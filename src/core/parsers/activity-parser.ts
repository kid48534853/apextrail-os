import { Decoder, Stream } from '@garmin/fitsdk'
import { ActivityFormat, TrackPoint, TrackPointSchema } from '../types/trail'

const SEMICIRCLE_TO_DEG = 180 / Math.pow(2, 31)

export async function parseActivityFile(file: File): Promise<{
  format: ActivityFormat
  points: TrackPoint[]
}> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'gpx') return { format: 'gpx', points: parseGpxXml(await file.text()) }
  if (ext === 'tcx') return { format: 'tcx', points: parseTcxXml(await file.text()) }
  if (ext === 'fit') return { format: 'fit', points: parseFitBinary(await file.arrayBuffer()) }
  throw new Error(`不支援的檔案格式：.${ext ?? 'unknown'}，請匯入 GPX、TCX 或 FIT 檔案`)
}

function parseGpxXml(xmlText: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('GPX 檔案 XML 格式損毀')

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'))
  const points: TrackPoint[] = []

  for (const pt of trkpts) {
    const lat = Number(pt.getAttribute('lat'))
    const lon = Number(pt.getAttribute('lon'))
    const ele = Number(getFirstTagText(pt, ['ele']) ?? 0)
    const timeStr = getFirstTagText(pt, ['time'])
    const hr = parseOptionalNumber(getFirstTagText(pt, ['gpxtpx:hr', 'hr', 'ns3:hr']))
    const cadRaw = parseOptionalNumber(getFirstTagText(pt, ['gpxtpx:cad', 'cad', 'ns3:cad']))
    const power = parseOptionalNumber(getFirstTagText(pt, ['power', 'gpxpx:PowerInWatts']))
    const cadence = cadRaw !== undefined ? (cadRaw < 120 ? cadRaw * 2 : cadRaw) : undefined

    const validated = TrackPointSchema.safeParse({
      lat, lon, ele, time: timeStr ? Date.parse(timeStr) : undefined, hr, cadence, power
    })
    if (validated.success) points.push(validated.data)
  }

  if (points.length === 0) throw new Error('GPX 檔案中找不到有效的軌跡點')
  return points
}

function parseTcxXml(xmlText: string): TrackPoint[] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('TCX 檔案 XML 格式損毀')

  const nodes = Array.from(doc.getElementsByTagName('Trackpoint'))
  const points: TrackPoint[] = []

  for (const node of nodes) {
    const latStr = getFirstTagText(node, ['LatitudeDegrees'])
    const lonStr = getFirstTagText(node, ['LongitudeDegrees'])
    if (!latStr || !lonStr) continue

    const ele = Number(getFirstTagText(node, ['AltitudeMeters']) ?? 0)
    const timeStr = getFirstTagText(node, ['Time'])
    const hrNode = node.getElementsByTagName('HeartRateBpm')[0]
    const hr = hrNode ? parseOptionalNumber(getFirstTagText(hrNode, ['Value'])) : undefined
    const cadRaw = parseOptionalNumber(getFirstTagText(node, ['RunCadence', 'ns3:RunCadence', 'Cadence']))
    const power = parseOptionalNumber(getFirstTagText(node, ['Watts', 'ns3:Watts']))
    const cadence = cadRaw !== undefined ? (cadRaw < 120 ? cadRaw * 2 : cadRaw) : undefined

    const validated = TrackPointSchema.safeParse({
      lat: Number(latStr), lon: Number(lonStr), ele, time: timeStr ? Date.parse(timeStr) : undefined, hr, cadence, power
    })
    if (validated.success) points.push(validated.data)
  }

  if (points.length === 0) throw new Error('TCX 檔案中找不到有效的 GPS 軌跡點')
  return points
}

function parseFitBinary(buffer: ArrayBuffer): TrackPoint[] {
  const stream = Stream.fromByteArray(new Uint8Array(buffer))
  if (!Decoder.isFIT(stream)) throw new Error('無效的 FIT 檔案標頭')

  const decoder = new Decoder(stream)
  const { messages, errors } = decoder.read()
  if (errors.length > 0 && !messages.recordMesgs?.length) {
    throw new Error(`FIT 解析失敗：${String(errors[0])}`)
  }

  const records = (messages.recordMesgs ?? []) as Array<Record<string, unknown>>
  const points: TrackPoint[] = []

  for (const rec of records) {
    const posLat = rec.positionLat
    const posLon = rec.positionLong
    if (typeof posLat !== 'number' || typeof posLon !== 'number') continue

    const lat = Math.abs(posLat) > 90 ? posLat * SEMICIRCLE_TO_DEG : posLat
    const lon = Math.abs(posLon) > 180 ? posLon * SEMICIRCLE_TO_DEG : posLon
    const ele = typeof rec.enhancedAltitude === 'number'
      ? rec.enhancedAltitude
      : (typeof rec.altitude === 'number' ? rec.altitude : 0)

    const ts = rec.timestamp instanceof Date ? rec.timestamp.getTime() : undefined
    const hr = typeof rec.heartRate === 'number' ? rec.heartRate : undefined
    const power = typeof rec.power === 'number' ? rec.power : undefined
    const rawCad = typeof rec.cadence === 'number' ? rec.cadence : undefined
    const fracCad = typeof rec.fractionalCadence === 'number' ? rec.fractionalCadence : 0
    const cadence = rawCad !== undefined ? Math.round((rawCad + fracCad) * 2) : undefined

    const validated = TrackPointSchema.safeParse({ lat, lon, ele, time: ts, hr, cadence, power })
    if (validated.success) points.push(validated.data)
  }

  if (points.length === 0) throw new Error('FIT 檔案中找不到有效的 GPS 紀錄點')
  return points
}

function getFirstTagText(parent: Element, tagNames: string[]): string | undefined {
  for (const tag of tagNames) {
    const el = parent.getElementsByTagName(tag)[0]
    if (el?.textContent) return el.textContent.trim()
  }
  return undefined
}

function parseOptionalNumber(val?: string): number | undefined {
  if (!val) return undefined
  const num = Number(val)
  return Number.isFinite(num) ? num : undefined
}
