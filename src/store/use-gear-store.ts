import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  GearCategory,
  GearItem,
  SafetyPlan,
  TripProfile,
  VaultTemplateItem,
  WeightSummary,
  WeightUnit
} from '../core/types/gear'

const DEFAULT_CATEGORIES: GearCategory[] = [
  { id: 'cat-pack', name: '背負系統', colorHex: '#ef4444' },
  { id: 'cat-body', name: '身體部品與強制裝備', colorHex: '#a855f7' },
  { id: 'cat-food', name: '飲食', colorHex: '#ec4899' },
  { id: 'cat-tech', name: '電子產品', colorHex: '#10b981' },
  { id: 'cat-camp', name: '宿營系統', colorHex: '#84cc16' }
]

const DEFAULT_VAULT: VaultTemplateItem[] = [
  { id: 'v-1', name: '24升越野背包', categoryName: '背負系統', brandModel: 'HANCHOR Marlin', weightG: 400, isWorn: false, isConsumable: false, isMandatory: false },
  { id: 'v-2', name: '背包內層防水袋', categoryName: '背負系統', brandModel: '輕量 DCF 20L', weightG: 29, isWorn: false, isConsumable: false, isMandatory: false },
  { id: 'v-3', name: '風雨衣（防水透氣）', categoryName: '身體部品與強制裝備', brandModel: 'Gore-Tex Active', weightG: 210, isWorn: false, isConsumable: false, isMandatory: true },
  { id: 'v-4', name: '頭燈 + 急救包', categoryName: '身體部品與強制裝備', brandModel: 'Nitecore NU25', weightG: 210, isWorn: false, isConsumable: false, isMandatory: true },
  { id: 'v-5', name: '越野跑鞋 + 羊毛襪', categoryName: '身體部品與強制裝備', brandModel: '全身行進穿戴', weightG: 670, isWorn: true, isConsumable: false, isMandatory: true },
  { id: 'v-6', name: '能量果膠與電解質粉', categoryName: '飲食', brandModel: '高熱量補給', weightG: 450, isWorn: false, isConsumable: true, isMandatory: true },
  { id: 'v-7', name: '10000mAh 行動電源', categoryName: '電子產品', brandModel: 'PD 快充行充', weightG: 185, isWorn: false, isConsumable: false, isMandatory: true }
]

const createInitialTrip = (): TripProfile => ({
  id: 'trip-default',
  name: '谷關 G4 縱走',
  modeLabel: 'Fastpacking 快速打包',
  days: 2,
  categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
  items: [
    {
      id: 'item-init-1',
      categoryId: 'cat-pack',
      name: '24升越野背包',
      brandModel: 'HANCHOR',
      weightG: 400,
      quantity: 1,
      isWorn: false,
      isConsumable: false,
      isMandatory: false,
      checkedStage1: false,
      checkedStage2: false
    },
    {
      id: 'item-init-2',
      categoryId: 'cat-body',
      name: '頭燈 + 急救包',
      brandModel: 'Nitecore NU25',
      weightG: 210,
      quantity: 1,
      isWorn: false,
      isConsumable: false,
      isMandatory: true,
      checkedStage1: false,
      checkedStage2: false
    }
  ]
})

interface GearStoreState {
  trips: TripProfile[]
  activeTripId: string
  vault: VaultTemplateItem[]
  weightUnit: WeightUnit
  safetyPlan: SafetyPlan

  setActiveTrip: (tripId: string) => void
  createTrip: (name: string, days: number, modeLabel: string) => void
  deleteTrip: (tripId: string) => void
  duplicateActiveTrip: () => void
  updateActiveTripMeta: (patch: Partial<Pick<TripProfile, 'name' | 'days' | 'modeLabel'>>) => void
  setWeightUnit: (unit: WeightUnit) => void

  addCategory: (name: string, colorHex: string) => string
  deleteCategory: (categoryId: string) => void
  moveCategory: (categoryId: string, direction: 'up' | 'down') => void

  addItem: (item: Omit<GearItem, 'id' | 'checkedStage1' | 'checkedStage2'>) => void
  updateItem: (itemId: string, patch: Partial<GearItem>) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void

  addVaultTemplate: (tpl: Omit<VaultTemplateItem, 'id'>) => void
  removeVaultTemplate: (tplId: string) => void
  deployVaultItemToTrip: (tplId: string) => void

  toggleCheck: (itemId: string, stage: 1 | 2) => void
  markAllStage: (stage: 1 | 2, checked: boolean) => void
  resetAllChecks: () => void
  updateSafetyPlan: (patch: Partial<SafetyPlan>) => void
  exportStateJson: () => string
  importStateJson: (rawJson: string) => { ok: boolean; message: string }
}

export const useGearStore = create<GearStoreState>()(
  persist(
    (set, get) => ({
      trips: [createInitialTrip()],
      activeTripId: 'trip-default',
      vault: DEFAULT_VAULT,
      weightUnit: 'kg',
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

      setActiveTrip: (tripId) => set({ activeTripId: tripId }),

      createTrip: (name, days, modeLabel) => {
        const trimmed = name.trim() || '未命名行程'
        const newId = `trip-${Date.now()}`
        const newTrip: TripProfile = {
          id: newId,
          name: trimmed,
          modeLabel: modeLabel || 'Fastpacking 快速打包',
          days: Math.max(1, Math.floor(days || 1)),
          categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
          items: []
        }
        set((s) => ({ trips: [...s.trips, newTrip], activeTripId: newId }))
      },

      deleteTrip: (tripId) =>
        set((s) => {
          if (s.trips.length <= 1) return s
          const nextTrips = s.trips.filter((t) => t.id !== tripId)
          const nextActive = s.activeTripId === tripId ? nextTrips[0].id : s.activeTripId
          return { trips: nextTrips, activeTripId: nextActive }
        }),

      duplicateActiveTrip: () =>
        set((s) => {
          const current = s.trips.find((t) => t.id === s.activeTripId)
          if (!current) return s
          const copyId = `trip-${Date.now()}`
          const copyTrip: TripProfile = {
            ...current,
            id: copyId,
            name: `${current.name} (副本)`,
            categories: current.categories.map((c) => ({ ...c })),
            items: current.items.map((i, idx) => ({
              ...i,
              id: `item-${Date.now()}-${idx}`,
              checkedStage1: false,
              checkedStage2: false
            }))
          }
          return { trips: [...s.trips, copyTrip], activeTripId: copyId }
        }),

      updateActiveTripMeta: (patch) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  ...patch,
                  days: patch.days !== undefined ? Math.max(1, Math.floor(patch.days || 1)) : t.days
                }
              : t
          )
        })),

      setWeightUnit: (weightUnit) => set({ weightUnit }),

      addCategory: (name, colorHex) => {
        const trimmed = name.trim()
        const state = get()
        const activeTrip = state.trips.find((t) => t.id === state.activeTripId)
        if (!trimmed || !activeTrip) return activeTrip?.categories[0]?.id ?? 'cat-pack'
        const newId = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? { ...t, categories: [...t.categories, { id: newId, name: trimmed, colorHex }] }
              : t
          )
        }))
        return newId
      },

      deleteCategory: (categoryId) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  categories: t.categories.filter((c) => c.id !== categoryId),
                  items: t.items.filter((i) => i.categoryId !== categoryId)
                }
              : t
          )
        })),

      moveCategory: (categoryId, direction) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const idx = t.categories.findIndex((c) => c.id === categoryId)
            if (idx < 0) return t
            const targetIdx = direction === 'up' ? idx - 1 : idx + 1
            if (targetIdx < 0 || targetIdx >= t.categories.length) return t
            const next = [...t.categories]
            const [picked] = next.splice(idx, 1)
            next.splice(targetIdx, 0, picked)
            return { ...t, categories: next }
          })
        })),

      addItem: (item) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const fallbackCatId = t.categories[0]?.id ?? 'cat-pack'
            const newItem: GearItem = {
              ...item,
              categoryId: item.categoryId || fallbackCatId,
              name: item.name.trim() || '未命名裝備',
              brandModel: item.brandModel.trim(),
              weightG: Math.max(0, Math.round(Number(item.weightG) || 0)),
              quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
              id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              checkedStage1: false,
              checkedStage2: false
            }
            return { ...t, items: [...t.items, newItem] }
          })
        })),

      updateItem: (itemId, patch) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  items: t.items.map((item) => {
                    if (item.id !== itemId) return item
                    return {
                      ...item,
                      ...patch,
                      weightG:
                        patch.weightG !== undefined
                          ? Math.max(0, Math.round(Number(patch.weightG) || 0))
                          : item.weightG,
                      quantity:
                        patch.quantity !== undefined
                          ? Math.max(1, Math.floor(Number(patch.quantity) || 1))
                          : item.quantity
                    }
                  })
                }
              : t
          )
        })),

      removeItem: (itemId) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t
          )
        })),

      moveItem: (itemId, direction) =>
        set((s) => ({
          trips: s.trips.map((t) => {
            if (t.id !== s.activeTripId) return t
            const current = t.items.find((i) => i.id === itemId)
            if (!current) return t
            const sameCatIndices = t.items
              .map((it, i) => ({ it, i }))
              .filter((entry) => entry.it.categoryId === current.categoryId)
            const posInCat = sameCatIndices.findIndex((entry) => entry.it.id === itemId)
            const targetPosInCat = direction === 'up' ? posInCat - 1 : posInCat + 1
            if (targetPosInCat < 0 || targetPosInCat >= sameCatIndices.length) return t

            const fromIdx = sameCatIndices[posInCat].i
            const toIdx = sameCatIndices[targetPosInCat].i
            const next = [...t.items]
            const [moved] = next.splice(fromIdx, 1)
            next.splice(toIdx, 0, moved)
            return { ...t, items: next }
          })
        })),

      addVaultTemplate: (tpl) =>
        set((s) => ({
          vault: [
            {
              ...tpl,
              id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              name: tpl.name.trim() || '未命名裝備',
              categoryName: tpl.categoryName.trim() || '背負系統',
              brandModel: tpl.brandModel.trim(),
              weightG: Math.max(0, Math.round(Number(tpl.weightG) || 0))
            },
            ...s.vault
          ]
        })),

      removeVaultTemplate: (tplId) =>
        set((s) => ({ vault: s.vault.filter((v) => v.id !== tplId) })),

      deployVaultItemToTrip: (tplId) =>
        set((s) => {
          const tpl = s.vault.find((v) => v.id === tplId)
          if (!tpl) return s
          return {
            trips: s.trips.map((t) => {
              if (t.id !== s.activeTripId) return t
              let matchedCat = t.categories.find((c) => c.name === tpl.categoryName)
              let nextCats = t.categories
              if (!matchedCat) {
                matchedCat = {
                  id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 4)}`,
                  name: tpl.categoryName,
                  colorHex: '#38bdf8'
                }
                nextCats = [...t.categories, matchedCat]
              }
              const newItem: GearItem = {
                id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                categoryId: matchedCat.id,
                name: tpl.name,
                brandModel: tpl.brandModel,
                weightG: tpl.weightG,
                quantity: 1,
                isWorn: tpl.isWorn,
                isConsumable: tpl.isConsumable,
                isMandatory: tpl.isMandatory,
                checkedStage1: false,
                checkedStage2: false
              }
              return { ...t, categories: nextCats, items: [...t.items, newItem] }
            })
          }
        }),

      toggleCheck: (itemId, stage) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  items: t.items.map((item) => {
                    if (item.id !== itemId) return item
                    if (stage === 1) {
                      const next1 = !item.checkedStage1
                      return { ...item, checkedStage1: next1, checkedStage2: next1 ? item.checkedStage2 : false }
                    }
                    return { ...item, checkedStage1: true, checkedStage2: !item.checkedStage2 }
                  })
                }
              : t
          )
        })),

      markAllStage: (stage, checked) =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? {
                  ...t,
                  items: t.items.map((i) =>
                    stage === 1
                      ? { ...i, checkedStage1: checked, checkedStage2: checked ? i.checkedStage2 : false }
                      : { ...i, checkedStage1: true, checkedStage2: checked }
                  )
                }
              : t
          )
        })),

      resetAllChecks: () =>
        set((s) => ({
          trips: s.trips.map((t) =>
            t.id === s.activeTripId
              ? { ...t, items: t.items.map((i) => ({ ...i, checkedStage1: false, checkedStage2: false })) }
              : t
          )
        })),

      updateSafetyPlan: (patch) => set((s) => ({ safetyPlan: { ...s.safetyPlan, ...patch } })),

      exportStateJson: () => {
        const { trips, activeTripId, vault, weightUnit, safetyPlan } = get()
        return JSON.stringify({ trips, activeTripId, vault, weightUnit, safetyPlan }, null, 2)
      },

      importStateJson: (rawJson) => {
        try {
          const parsed = JSON.parse(rawJson)
          if (!Array.isArray(parsed.trips) || parsed.trips.length === 0) {
            return { ok: false, message: 'JSON 格式無效：缺少 trips 行程陣列' }
          }
          set({
            trips: parsed.trips,
            activeTripId: parsed.activeTripId || parsed.trips[0].id,
            vault: Array.isArray(parsed.vault) ? parsed.vault : get().vault,
            weightUnit: parsed.weightUnit === 'g' ? 'g' : 'kg',
            safetyPlan: parsed.safetyPlan ? { ...get().safetyPlan, ...parsed.safetyPlan } : get().safetyPlan
          })
          return { ok: true, message: '已成功匯入行程與裝備庫資料' }
        } catch {
          return { ok: false, message: '無法解析 JSON，請確認內容是否完整' }
        }
      }
    }),
    { name: 'apextrail-gear-pro-v1' }
  )
)

export function formatWeight(weightG: number, unit: WeightUnit): string {
  const safeG = Math.max(0, weightG)
  if (unit === 'g') return `${Math.round(safeG)} g`
  return `${(safeG / 1000).toFixed(2)} kg`
}

export function computeWeightSummary(items: GearItem[], bodyWeightKg: number): WeightSummary {
  let baseWeightG = 0
  let consumableWeightG = 0
  let wornWeightG = 0
  let mandatoryCount = 0
  let totalQuantity = 0
  let stage1Done = 0
  let stage2Done = 0

  for (const item of items) {
    const qty = Math.max(1, item.quantity)
    const subtotal = item.weightG * qty
    totalQuantity += qty
    if (item.isMandatory) mandatoryCount += qty
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

  let ultralightTier = {
    label: 'Traditional 傳統重裝 (>9kg)',
    badgeClass: 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
  }
  if (baseKg < 3) {
    ultralightTier = {
      label: 'Sub-Ultralight 極致超輕 (<3kg)',
      badgeClass: 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
    }
  } else if (baseKg < 4.5) {
    ultralightTier = {
      label: 'Ultralight 超輕量 (<4.5kg)',
      badgeClass: 'bg-[#84cc16]/20 text-[#a3e635] border border-[#84cc16]/40'
    }
  } else if (baseKg < 9) {
    ultralightTier = {
      label: 'Lightweight 輕量化 (<9kg)',
      badgeClass: 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
    }
  }

  return {
    baseWeightG,
    consumableWeightG,
    wornWeightG,
    packWeightG,
    totalWeightG,
    mandatoryCount,
    totalQuantity,
    bodyWeightRatioPct,
    ultralightTier,
    stage1Done,
    stage2Done,
    totalItems: items.length
  }
}
