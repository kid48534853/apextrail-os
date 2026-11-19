import { create } from 'zustand'
import { GearCategory, GearItem, MandatoryGearStatus, SafetyPlan, WeightSummary } from '../core/types/gear'

const MANDATORY_RULES = [
  { key: 'headlamp', label: '頭燈/照明', keywords: ['頭燈', '手電筒', '照明', 'headlamp'] },
  { key: 'rain', label: '防水風雨衣', keywords: ['雨衣', '風雨衣', '衝鋒衣', 'gore-tex', '防水'] },
  { key: 'warm', label: '保暖層/羽絨', keywords: ['羽絨', '化纖', '保暖', '中層', 'fleece'] },
  { key: 'firstaid', label: '急救包/救生毯/哨', keywords: ['急救', '救生毯', '哨', '藥', '繃帶'] },
  { key: 'gps', label: '離線導航/GPS', keywords: ['gps', '離線', '手錶', 'garmin', 'inreach', '地圖'] },
  { key: 'power', label: '行動電源', keywords: ['行動電源', '行充', '充電', 'powerbank'] },
  { key: 'water', label: '飲水與濾水系統', keywords: ['水壺', '水袋', '軟水袋', '濾水', '水瓶'] },
  { key: 'food', label: '高熱量行動糧', keywords: ['行動糧', '果膠', '能量', '乾糧', '堅果', '鹽糖'] }
]

interface GearState {
  categories: GearCategory[]
  items: GearItem[]
  safetyPlan: SafetyPlan
  addItem: (item: Omit<GearItem, 'id' | 'checkedStage1' | 'checkedStage2'>) => void
  removeItem: (id: string) => void
  toggleCheck: (id: string, stage: 1 | 2) => void
  markAllStage: (stage: 1 | 2, checked: boolean) => void
  resetAllChecks: () => void
  updateSafetyPlan: (patch: Partial<SafetyPlan>) => void
}

export const useGearStore = create<GearState>((set) => ({
  categories: [
    { id: 'cat-pack', name: '背負系統', colorHex: '#ef4444' },
    { id: 'cat-camp', name: '宿營系統', colorHex: '#84cc16' },
    { id: 'cat-safety', name: '身體部品與強制裝備', colorHex: '#a855f7' }
  ],
  items: [],
  safetyPlan: {
    routeName: '谷關 G4 縱走',
    startDate: '2026-11-21',
    endDate: '2026-11-22',
    permitAndInsurance: '已投保登山綜合險',
    leaderContact: '',
    stayBehindContact: '',
    checkInSchedule: '每日抵達營地回報',
    sarTriggerDeadline: '預計下山日晚間 20:00 未歸即報警',
    commDevices: 'Garmin GPX + 手機離線地圖',
    bailoutPlan: ''
  },
  addItem: (item) =>
    set((s) => ({
      items: [...s.items, { ...item, id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, checkedStage1: false, checkedStage2: false }]
    })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  toggleCheck: (id, stage) =>
    set((s) => ({
      items: s.items.map((item) => {
        if (item.id !== id) return item
        if (stage === 1) {
          const next1 = !item.checkedStage1
          return { ...item, checkedStage1: next1, checkedStage2: next1 ? item.checkedStage2 : false }
        }
        return { ...item, checkedStage1: true, checkedStage2: !item.checkedStage2 }
      })
    })),
  markAllStage: (stage, checked) =>
    set((s) => ({
      items: s.items.map((i) =>
        stage === 1
          ? { ...i, checkedStage1: checked, checkedStage2: checked ? i.checkedStage2 : false }
          : { ...i, checkedStage1: true, checkedStage2: checked }
      )
    })),
  resetAllChecks: () => set((s) => ({ items: s.items.map((i) => ({ ...i, checkedStage1: false, checkedStage2: false })) })),
  updateSafetyPlan: (patch) => set((s) => ({ safetyPlan: { ...s.safetyPlan, ...patch } }))
}))

export function computeWeightSummary(items: GearItem[], bodyWeightKg: number): WeightSummary {
  let baseWeightG = 0
  let consumableWeightG = 0
  let wornWeightG = 0
  let stage1Done = 0
  let stage2Done = 0

  for (const item of items) {
    const subtotal = item.weightG * item.quantity
    if (item.isWorn) wornWeightG += subtotal
    else if (item.isConsumable) consumableWeightG += subtotal
    else baseWeightG += subtotal
    if (item.checkedStage1) stage1Done += 1
    if (item.checkedStage2) stage2Done += 1
  }

  const packWeightG = baseWeightG + consumableWeightG
  const totalWeightG = packWeightG + wornWeightG
  const bodyWeightRatioPct = Number(((packWeightG / (Math.max(30, bodyWeightKg) * 1000)) * 100).toFixed(1))
  const baseKg = baseWeightG / 1000

  let ultralightTier = { label: 'Traditional 傳統重裝 (>9kg)', badgeClass: 'bg-rose-500/20 text-rose-300' }
  if (baseKg < 3) ultralightTier = { label: 'Sub-Ultralight 極致超輕 (<3kg)', badgeClass: 'bg-sky-500/20 text-sky-300' }
  else if (baseKg < 4.5) ultralightTier = { label: 'Ultralight 超輕量 (<4.5kg)', badgeClass: 'bg-[#84cc16]/20 text-[#84cc16]' }
  else if (baseKg < 9) ultralightTier = { label: 'Lightweight 輕量化 (<9kg)', badgeClass: 'bg-amber-500/20 text-amber-300' }

  return {
    baseWeightG, consumableWeightG, wornWeightG, packWeightG, totalWeightG,
    bodyWeightRatioPct, ultralightTier, stage1Done, stage2Done, totalItems: items.length
  }
}

export function detectMandatoryGear(items: GearItem[]): MandatoryGearStatus[] {
  const joinedNames = items.map((i) => i.name.toLowerCase()).join(' ')
  return MANDATORY_RULES.map((rule) => ({
    ...rule,
    isPresent: rule.keywords.some((kw) => joinedNames.includes(kw.toLowerCase()))
  }))
}
