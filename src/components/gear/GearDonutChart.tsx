import React from 'react'
import { GearCategory, GearItem, WeightUnit } from '../../core/types/gear'
import { formatWeight } from '../../store/use-gear-store'

interface GearDonutChartProps {
  categories: GearCategory[]
  items: GearItem[]
  totalWeightG: number
  baseWeightG: number
  consumableWeightG: number
  wornWeightG: number
  weightUnit: WeightUnit
}

export const GearDonutChart: React.FC<GearDonutChartProps> = ({
  categories,
  items,
  totalWeightG,
  baseWeightG,
  consumableWeightG,
  wornWeightG,
  weightUnit
}) => {
  const radius = 58
  const circumference = 2 * Math.PI * radius

  const segments = categories
    .map((cat) => {
      const catG = items
        .filter((i) => i.categoryId === cat.id)
        .reduce((sum, i) => sum + i.weightG * Math.max(1, i.quantity), 0)
      return { id: cat.id, name: cat.name, colorHex: cat.colorHex, weightG: catG }
    })
    .filter((s) => s.weightG > 0)

  let accumulatedRatio = 0

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-[#2a323d] bg-[#161b22] p-5 lg:flex-row lg:items-center">
      <div className="relative mx-auto flex h-44 w-44 shrink-0 items-center justify-center">
        <svg className="h-44 w-44 -rotate-90" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={radius} fill="none" stroke="#222933" strokeWidth="18" />
          {totalWeightG > 0 &&
            segments.map((seg) => {
              const ratio = seg.weightG / totalWeightG
              const dashLength = ratio * circumference
              const dashOffset = -accumulatedRatio * circumference
              accumulatedRatio += ratio
              return (
                <circle
                  key={seg.id}
                  cx="75"
                  cy="75"
                  r={radius}
                  fill="none"
                  stroke={seg.colorHex}
                  strokeWidth="18"
                  strokeDasharray={`${dashLength} ${circumference}`}
                  strokeDashoffset={dashOffset}
                />
              )
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[11px] font-medium text-slate-400">總重量</span>
          <span className="mt-0.5 text-base font-extrabold text-white">{formatWeight(totalWeightG, weightUnit)}</span>
        </div>
      </div>

      <div className="flex-1 space-y-2.5 text-xs">
        <div className="space-y-1.5">
          {segments.length === 0 ? (
            <p className="text-slate-400">尚無裝備重量分佈，請從左側裝備庫挑入或新增項目。</p>
          ) : (
            segments.map((seg) => (
              <div key={seg.id} className="flex items-center justify-between py-0.5">
                <span className="flex items-center gap-2 font-medium text-slate-200">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: seg.colorHex }} />
                  {seg.name}
                </span>
                <span className="font-mono font-semibold text-slate-100">{formatWeight(seg.weightG, weightUnit)}</span>
              </div>
            ))
          )}
        </div>

        <div className="space-y-1.5 border-t border-[#2a323d] pt-2.5">
          <div className="flex items-center justify-between font-bold text-white">
            <span>全部的（總重量 Total）</span>
            <span className="font-mono">{formatWeight(totalWeightG, weightUnit)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>消耗品（飲食/瓦斯/水）</span>
            <span className="font-mono text-amber-300">{formatWeight(consumableWeightG, weightUnit)}</span>
          </div>
          <div className="flex items-center justify-between text-slate-300">
            <span>穿戴/磨損（Worn 不計入背包）</span>
            <span className="font-mono text-sky-300">{formatWeight(wornWeightG, weightUnit)}</span>
          </div>
          <div className="flex items-center justify-between font-semibold text-[#a3e635]">
            <span>基礎重量（Base Weight）</span>
            <span className="font-mono">{formatWeight(baseWeightG, weightUnit)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
