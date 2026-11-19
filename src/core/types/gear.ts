export interface GearItem {
  id: string
  categoryId: string
  name: string
  weightG: number
  quantity: number
  isWorn: boolean
  isConsumable: boolean
  checkedStage1: boolean
  checkedStage2: boolean
}

export interface GearCategory {
  id: string
  name: string
  colorHex: string
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

export interface MandatoryGearStatus {
  key: string
  label: string
  keywords: string[]
  isPresent: boolean
}

export interface WeightSummary {
  baseWeightG: number
  consumableWeightG: number
  wornWeightG: number
  packWeightG: number
  totalWeightG: number
  bodyWeightRatioPct: number
  ultralightTier: { label: string; badgeClass: string }
  stage1Done: number
  stage2Done: number
  totalItems: number
}
