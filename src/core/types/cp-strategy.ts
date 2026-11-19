export type CpDifficultyLevel = 'easy' | 'moderate' | 'hard' | 'extreme'

export interface CustomCpPoint {
  id: string
  name: string
  distanceKm: number
}

export interface CpDifficultyAssessment {
  level: CpDifficultyLevel
  label: string
  avgGradePct: number
  advice: string
}

export interface CpSegmentBreakdown {
  id: string
  fromLabel: string
  toLabel: string
  startKm: number
  endKm: number
  distanceKm: number
  ascentM: number
  descentM: number
  segmentEp: number
  estimatedHours: number
  targetEph: number
  waterMl: number
  carbsG: number
  caloriesKcal: number
  sodiumMg: number
  difficulty: CpDifficultyAssessment
}
