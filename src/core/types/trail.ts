import { z } from 'zod'

export const TrackPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  ele: z.number(),
  time: z.number().optional(),
  hr: z.number().min(30).max(240).optional(),
  cadence: z.number().min(0).max(260).optional(),
  power: z.number().min(0).max(1500).optional()
})

export type TrackPoint = z.infer<typeof TrackPointSchema>
export type ActivityFormat = 'gpx' | 'tcx' | 'fit'

export interface DifficultyGrade {
  code: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'
  label: string
  rangeText: string
  itraPoints: number
}

export interface EphGrade {
  code: 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6'
  label: string
  rangeText: string
}

export interface CheckpointInput {
  id: string
  name: string
  distanceKm: number
  hasWater: boolean
  isShelter?: boolean
  isBailout?: boolean
}

export interface SegmentAnalysis {
  segmentIndex: number
  fromName: string
  toName: string
  distanceKm: number
  ascentM: number
  descentM: number
  avgGradePct: number
  ep: number
  estimatedHours: number
  actualHours?: number
  actualEph?: number
  actualEphGrade?: EphGrade
  avgHr?: number
  avgPower?: number
  avgCadence?: number
  avgPaceSecPerKm?: number
  nutrition: {
    waterMl: number
    carbsG: number
    caloriesKcal: number
    sodiumMg: number
  }
}

export interface ActivitySummary {
  totalDistanceKm: number
  totalAscentM: number
  totalDescentM: number
  durationSec: number
  ep: number
  difficulty: DifficultyGrade
  eph: number | null
  ephGrade: EphGrade | null
  avgHr: number | null
  maxHr: number | null
  hrSafeZonePct: number | null
  avgPower: number | null
  avgCadence: number | null
  avgPaceSecPerKm: number | null
  avgGapSecPerKm: number | null
  efficiencyFactor: number | null
  segments: SegmentAnalysis[]
}
