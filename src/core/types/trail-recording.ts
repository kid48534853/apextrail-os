export type GnssFrequencyMode = 'power-saving' | 'standard-multi' | 'high-precision-dual'

export type RecordingSampleMode = 'every-second' | 'smart'

export type PoiCategory = 'water' | 'shelter' | 'signal' | 'bailout' | 'custom'

export interface RecordedTrackPoint {
  lat: number
  lon: number
  ele: number
  timestampMs: number
  accuracyM?: number
}

export interface TrailPoi {
  id: string
  name: string
  category: PoiCategory
  lat: number
  lon: number
  ele: number
  notes: string
  createdAtMs: number
}
