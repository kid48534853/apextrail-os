export type WeightUnit = 'kg' | 'g'

export interface VaultTemplateItem {
  id: string
  name: string
  categoryName: string
  brandModel: string
  weightG: number
  isWorn: boolean
  isConsumable: boolean
  isMandatory: boolean
}

export interface GearItem {
  id: string
  categoryId: string
  name: string
  brandModel: string
  weightG: number
  quantity: number
  isWorn: boolean
  isConsumable: boolean
  isMandatory: boolean
  checkedStage1: boolean
  checkedStage2: boolean
  notes?: string
}

export interface GearCategory {
  id: string
  name: string
  colorHex: string
}

export interface TripProfile {
  id: string
  name: string
  modeLabel: string
  days: number
  categories: GearCategory[]
  items: GearItem[]
}

export interface SafetyPlan {
  routeName: string
  startDate: string
  endDate: string
  permitAndInsurance: string
  leaderContact: string
  stayBehindContact: string
  checkInSchedule: string
  sarTriggerDeadline: string
  commDevices: string
  bailoutPlan: string
}

export interface WeightSummary {
  baseWeightG: number
  consumableWeightG: number
  wornWeightG: number
  packWeightG: number
  totalWeightG: number
  mandatoryCount: number
  totalQuantity: number
  bodyWeightRatioPct: number
  ultralightTier: { label: string; badgeClass: string }
  stage1Done: number
  stage2Done: number
  totalItems: number
}
