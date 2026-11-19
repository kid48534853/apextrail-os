import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  GnssFrequencyMode,
  PoiCategory,
  RecordedTrackPoint,
  RecordingSampleMode,
  TrailPoi
} from '../core/types/trail-recording'
import { haversineDistanceM } from '../core/algorithms/trail-metrics'

interface TrailRecordingState {
  isRecording: boolean
  isPaused: boolean
  gnssMode: GnssFrequencyMode
  sampleMode: RecordingSampleMode
  recordedPoints: RecordedTrackPoint[]
  pois: TrailPoi[]
  recordingStartedAtMs: number | null

  setGnssMode: (mode: GnssFrequencyMode) => void
  setSampleMode: (mode: RecordingSampleMode) => void
  startRecording: () => void
  togglePauseRecording: () => void
  stopRecording: () => void
  clearRecordedTrack: () => void
  ingestGpsSample: (pt: RecordedTrackPoint) => boolean
  addPoi: (input: Omit<TrailPoi, 'id' | 'createdAtMs'>) => void
  removePoi: (id: string) => void
  exportRecordedGpx: (trackName?: string) => string
}

function bearingDeg(a: RecordedTrackPoint, b: RecordedTrackPoint): number {
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function shouldAcceptPoint(
  prev: RecordedTrackPoint | undefined,
  next: RecordedTrackPoint,
  sampleMode: RecordingSampleMode
): boolean {
  if (!prev) return true
  const dtMs = next.timestampMs - prev.timestampMs
  if (dtMs < 850) return false

  if (sampleMode === 'every-second') {
    return true
  }

  // 智慧紀錄模式：位移 >= 4m、航向變化 >= 12 度或間隔 >= 15 秒才寫入
  const distM = haversineDistanceM(prev.lat, prev.lon, next.lat, next.lon)
  const angleDiff = Math.abs(bearingDeg(prev, next) - bearingDeg(prev, { ...next, lat: next.lat + 0.00001 }))
  return distM >= 4 || angleDiff >= 12 || dtMs >= 15000
}

export const useTrailRecordingStore = create<TrailRecordingState>()(
  persist(
    (set, get) => ({
      isRecording: false,
      isPaused: false,
      gnssMode: 'standard-multi',
      sampleMode: 'smart',
      recordedPoints: [],
      pois: [],
      recordingStartedAtMs: null,

      setGnssMode: (gnssMode) => set({ gnssMode }),
      setSampleMode: (sampleMode) => set({ sampleMode }),

      startRecording: () =>
        set({
          isRecording: true,
          isPaused: false,
          recordingStartedAtMs: Date.now()
        }),

      togglePauseRecording: () =>
        set((s) => {
          if (!s.isRecording) return s
          return { isPaused: !s.isPaused }
        }),

      stopRecording: () => set({ isRecording: false, isPaused: false }),

      clearRecordedTrack: () => set({ recordedPoints: [], recordingStartedAtMs: null }),

      ingestGpsSample: (pt) => {
        const state = get()
        if (!state.isRecording || state.isPaused) return false
        const last = state.recordedPoints[state.recordedPoints.length - 1]
        if (!shouldAcceptPoint(last, pt, state.sampleMode)) return false
        set({ recordedPoints: [...state.recordedPoints, pt] })
        return true
      },

      addPoi: (input) =>
        set((s) => ({
          pois: [
            ...s.pois,
            {
              ...input,
              id: `poi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              createdAtMs: Date.now()
            }
          ]
        })),

      removePoi: (id) => set((s) => ({ pois: s.pois.filter((p) => p.id !== id) })),

      exportRecordedGpx: (trackName = 'ApexTrail Recorded Track') => {
        const { recordedPoints, pois } = get()
        const trkpts = recordedPoints
          .map(
            (p) =>
              `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><ele>${p.ele.toFixed(1)}</ele><time>${new Date(p.timestampMs).toISOString()}</time></trkpt>`
          )
          .join('\n')
        const wpts = pois
          .map(
            (w) =>
              `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lon.toFixed(6)}"><ele>${w.ele.toFixed(1)}</ele><name>${escapeXml(w.name)}</name><type>${w.category}</type><desc>${escapeXml(w.notes)}</desc></wpt>`
          )
          .join('\n')
        return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ApexTrail OS">
${wpts}
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`
      }
    }),
    { name: 'apextrail-trail-recording-v1' }
  )
)

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function computeRecordedStats(points: RecordedTrackPoint[]): {
  distanceKm: number
  ascentM: number
  pointCount: number
} {
  let distanceM = 0
  let ascentM = 0
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]
    const curr = points[i]
    distanceM += haversineDistanceM(prev.lat, prev.lon, curr.lat, curr.lon)
    const dEle = curr.ele - prev.ele
    if (dEle > 2.5) ascentM += dEle
  }
  return {
    distanceKm: Number((distanceM / 1000).toFixed(2)),
    ascentM: Math.round(ascentM),
    pointCount: points.length
  }
}

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  water: '水源點',
  shelter: '避難山屋／營地',
  signal: '通訊點',
  bailout: '撤退路線點',
  custom: '自訂興趣點'
}
