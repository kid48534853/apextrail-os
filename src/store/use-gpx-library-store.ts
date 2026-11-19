import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { TrackPoint } from '../core/types/trail'
import { GpxTrackSource, SavedGpxTrack } from '../core/types/gpx-library'
import { haversineDistanceM } from '../core/algorithms/trail-metrics'

interface GpxLibraryState {
  tracks: SavedGpxTrack[]
  activeTrackId: string | null
  saveTrack: (name: string, points: TrackPoint[], source: GpxTrackSource) => SavedGpxTrack | null
  importGpxXml: (fileName: string, xmlText: string) => { ok: boolean; message: string; track?: SavedGpxTrack }
  selectActiveTrack: (id: string | null) => void
  renameTrack: (id: string, nextName: string) => void
  deleteTrack: (id: string) => void
  exportTrackGpx: (id: string) => string | null
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function calculateTrackMetrics(points: TrackPoint[]) {
  let distanceM = 0
  let ascentM = 0
  let descentM = 0
  let lastRefEle: number | null = points.length > 0 ? (points[0].ele ?? 0) : null
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const curr = points[i]
    distanceM += haversineDistanceM(prev.lat, prev.lon, curr.lat, curr.lon)
    const currEle = curr.ele ?? prev.ele ?? 0
    if (lastRefEle === null) { lastRefEle = currEle; continue }
    const delta = currEle - lastRefEle
    if (delta >= 2.5) { ascentM += delta; lastRefEle = currEle }
    else if (delta <= -2.5) { descentM += Math.abs(delta); lastRefEle = currEle }
  }
  return { distanceKm: Number((distanceM / 1000).toFixed(2)), ascentM: Math.round(ascentM), descentM: Math.round(descentM) }
}

function parseGpxTrackPoints(xmlText: string): { name: string | null; points: TrackPoint[] } {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('GPX XML 格式異常')
  const parsedName = (doc.querySelector('trk > name') ?? doc.querySelector('metadata > name'))?.textContent?.trim() || null
  const ptNodes = Array.from(doc.querySelectorAll('trkpt'))
  const nodes = ptNodes.length > 0 ? ptNodes : Array.from(doc.querySelectorAll('rtept'))
  const points: TrackPoint[] = []
  for (const node of nodes) {
    const lat = Number(node.getAttribute('lat'))
    const lon = Number(node.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const eleText = node.querySelector('ele')?.textContent
    const ele = eleText !== null && eleText !== undefined && Number.isFinite(Number(eleText)) ? Number(eleText) : 0
    points.push({ lat, lon, ele })
  }
  return { name: parsedName, points }
}

export const useGpxLibraryStore = create<GpxLibraryState>()(
  persist(
    (set, get) => ({
      tracks: [],
      activeTrackId: null,
      saveTrack: (name, points, source) => {
        if (points.length < 2) return null
        const m = calculateTrackMetrics(points)
        const newTrack: SavedGpxTrack = {
          id: `gpx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: name.trim() || `未命名軌跡 ${new Date().toLocaleDateString('zh-TW')}`,
          source,
          createdAtMs: Date.now(),
          distanceKm: m.distanceKm,
          ascentM: m.ascentM,
          descentM: m.descentM,
          pointCount: points.length,
          points
        }
        set((s) => ({ tracks: [newTrack, ...s.tracks], activeTrackId: newTrack.id }))
        return newTrack
      },
      importGpxXml: (fileName, xmlText) => {
        try {
          const { name, points } = parseGpxTrackPoints(xmlText)
          if (points.length < 2) return { ok: false, message: `「${fileName}」缺少有效軌跡點` }
          const saved = get().saveTrack(name || fileName.replace(/\.gpx$/i, ''), points, 'imported')
          return saved ? { ok: true, message: `已保存「${saved.name}」`, track: saved } : { ok: false, message: '儲存失敗' }
        } catch (err) {
          return { ok: false, message: `解析失敗：${err instanceof Error ? err.message : String(err)}` }
        }
      },
      selectActiveTrack: (id) => set({ activeTrackId: id }),
      renameTrack: (id, nextName) => {
        const trimmed = nextName.trim()
        if (!trimmed) return
        set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, name: trimmed } : t)) }))
      },
      deleteTrack: (id) => set((s) => {
        const remaining = s.tracks.filter((t) => t.id !== id)
        return { tracks: remaining, activeTrackId: s.activeTrackId === id ? (remaining[0]?.id ?? null) : s.activeTrackId }
      }),
      exportTrackGpx: (id) => {
        const track = get().tracks.find((t) => t.id === id)
        if (!track) return null
        const trkpts = track.points.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${(p.ele ?? 0).toFixed(1)}</ele></trkpt>`).join('\n')
        return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="ApexTrail OS">\n  <trk>\n    <name>${escapeXml(track.name)}</name>\n    <trkseg>\n${trkpts}\n    </trkseg>\n  </trk>\n</gpx>`
      }
    }),
    { name: 'apextrail-gpx-library-v1' }
  )
)
