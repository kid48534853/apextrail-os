import { TrackPoint } from './trail'

export type GpxTrackSource = 'imported' | 'recorded'

export interface SavedGpxTrack {
  id: string
  name: string
  source: GpxTrackSource
  createdAtMs: number
  distanceKm: number
  ascentM: number
  descentM: number
  pointCount: number
  points: TrackPoint[]
}
