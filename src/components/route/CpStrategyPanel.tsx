import React, { useEffect, useMemo, useState } from 'react'
import { Droplets, Flame, Plus, RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react'
import { TrackPoint } from '../../core/types/trail'
import { CpDifficultyLevel, CustomCpPoint } from '../../core/types/cp-strategy'
import { buildCumulativeTrack, computeCpSegments } from '../../core/algorithms/cp-difficulty'

interface CpStrategyPanelProps {
  track: TrackPoint[]
  targetEph: number
  weightKg: number
}

const DIFFICULTY_BADGE_STYLES: Record<CpDifficultyLevel, string> = {
  easy: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  moderate: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  hard: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  extreme: 'border-rose-500/40 bg-rose-500/15 text-rose-300'
}

function createDefaultCps(totalDistKm: number): CustomCpPoint[] {
  if (totalDistKm < 2) return []
  return [
    {
      id: 'cp-default-1',
      name: 'CP1',
      distanceKm: Number((totalDistKm * 0.33).toFixed(1))
    },
    {
      id: 'cp-default-2',
      name: 'CP2',
      distanceKm: Number((totalDistKm * 0.66).toFixed(1))
    }
  ]
}

export const CpStrategyPanel: React.FC<CpStrategyPanelProps> = ({
  track,
  targetEph,
  weightKg
}) => {
  const totalDistKm = useMemo(() => {
    const cum = buildCumulativeTrack(track)
    return cum.length > 0 ? Number(cum[cum.length - 1].cumDistKm.toFixed(2)) : 0
  }, [track])

  const [cps, setCps] = useState<CustomCpPoint[]>([])
  const [showEditor, setShowEditor] = useState<boolean>(true)

  useEffect(() => {
    if (totalDistKm >= 2) {
      setCps(createDefaultCps(totalDistKm))
    } else {
      setCps([])
    }
  }, [totalDistKm])

  const segments = useMemo(
    () => computeCpSegments(track, cps, targetEph, weightKg),
    [track, cps, targetEph, weightKg]
  )

  const handleAddCp = () => {
    if (totalDistKm < 1.5) return
    const nextIdx = cps.length + 1
    const midKm = Number(Math.min(totalDistKm - 0.5, Math.max(0.5, totalDistKm * 0.5)).toFixed(1))
    setCps((prev) => [
      ...prev,
      {
        id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: `CP${nextIdx}`,
        distanceKm: midKm
      }
    ])
  }

  const handleUpdateCp = (id: string, patch: Partial<CustomCpPoint>) => {
    setCps((prev) =>
      prev.map((cp) => {
        if (cp.id !== id) return cp
        const nextDist =
          patch.distanceKm !== undefined
            ? Math.min(Math.max(0.3, patch.distanceKm), Math.max(0.5, totalDistKm - 0.3))
            : cp.distanceKm
        return { ...cp, ...patch, distanceKm: Number(nextDist.toFixed(1)) }
      })
    )
  }

  const handleRemoveCp = (id: string) => {
    setCps((prev) => prev.filter((cp) => cp.id !== id))
  }

  const handleResetCps = () => {
    setCps(createDefaultCps(totalDistKm))
  }

  if (totalDistKm < 0.2) {
    return (
      <div className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4 text-xs text-slate-400">
        請先匯入路線檔（GPX / TCX / FIT），即可自訂 CP 點位與檢視各段難度與補給明細。
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Droplets className="h-4 w-4 text-sky-400" />
          <span>分段 CP 補給策略與難度分析（總距離 {totalDistKm} km）</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowEditor((prev) => !prev)}
            className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 font-semibold text-slate-200"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            {showEditor ? '收合 CP 設定' : '展開 CP 設定'}
          </button>
          <button
            type="button"
            onClick={handleAddCp}
            className="flex items-center gap-1 rounded-lg bg-[#84cc16] px-2.5 py-1.5 font-bold text-slate-950"
          >
            <Plus className="h-3.5 w-3.5" />
            新增 CP 點位
          </button>
          <button
            type="button"
            onClick={handleResetCps}
            className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 font-semibold text-slate-300"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            重設
          </button>
        </div>
      </div>

      {/* 自訂 CP 點位名稱與位置編輯區 */}
      {showEditor && (
        <div className="space-y-2 rounded-xl border border-[#2a323d] bg-[#0d1117] p-3">
          {cps.length === 0 ? (
            <p className="text-xs text-slate-400">目前無中繼 CP（全程單段計算），點擊「新增 CP 點位」即可自訂站點。</p>
          ) : (
            cps.map((cp, idx) => (
              <div
                key={cp.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-[#2a323d]/80 bg-[#161b22] px-3 py-2 text-xs"
              >
                <span className="font-mono font-bold text-[#a3e635]">#{idx + 1}</span>
                <input
                  type="text"
                  value={cp.name}
                  onChange={(e) => handleUpdateCp(cp.id, { name: e.target.value })}
                  placeholder="輸入 CP 名稱（如：水源地、山屋）"
                  className="min-w-[160px] flex-1 rounded-md border border-[#2a323d] bg-[#0d1117] px-2.5 py-1 text-slate-100"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0.5}
                    max={Math.max(0.6, Number((totalDistKm - 0.5).toFixed(1)))}
                    step={0.1}
                    value={cp.distanceKm}
                    onChange={(e) => handleUpdateCp(cp.id, { distanceKm: Number(e.target.value) })}
                    aria-label="調整 CP 里程位置"
                    className="w-28 accent-[#84cc16]"
                  />
                  <input
                    type="number"
                    min={0.5}
                    max={Math.max(0.6, Number((totalDistKm - 0.5).toFixed(1)))}
                    step={0.1}
                    value={cp.distanceKm}
                    onChange={(e) => handleUpdateCp(cp.id, { distanceKm: Number(e.target.value) || 0.5 })}
                    className="w-16 rounded-md border border-[#2a323d] bg-[#0d1117] px-1.5 py-1 text-center font-mono text-white"
                  />
                  <span className="font-mono text-slate-400">km</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCp(cp.id)}
                  aria-label="刪除此 CP 點位"
                  className="rounded p-1 text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* 分段明細與難度判斷提示表 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#2a323d] text-slate-400">
              <th className="py-2 pr-3">區段（里程）</th>
              <th className="py-2 pr-3">難度與策略提示</th>
              <th className="py-2 pr-3">距離 / 爬升</th>
              <th className="py-2 pr-3">區段 EP</th>
              <th className="py-2 pr-3">預估時間</th>
              <th className="py-2 pr-3">飲水</th>
              <th className="py-2 pr-3">碳水 / 熱量</th>
              <th className="py-2">鈉</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a323d]/60">
            {segments.map((seg) => (
              <tr key={seg.id} className="align-top hover:bg-[#1f2630]/40">
                <td className="py-2.5 pr-3">
                  <div className="font-semibold text-slate-100">
                    {seg.fromLabel} → {seg.toLabel}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {seg.startKm} km → {seg.endKm} km
                  </div>
                </td>
                <td className="max-w-[260px] py-2.5 pr-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                        DIFFICULTY_BADGE_STYLES[seg.difficulty.level]
                      }`}
                    >
                      <Flame className="h-3 w-3" />
                      {seg.difficulty.label}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      均坡 {seg.difficulty.avgGradePct}%
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-300">{seg.difficulty.advice}</p>
                </td>
                <td className="py-2.5 pr-3 font-mono text-slate-200">
                  {seg.distanceKm} km / +{seg.ascentM}m
                </td>
                <td className="py-2.5 pr-3 font-mono font-bold text-[#a3e635]">{seg.segmentEp} EP</td>
                <td className="py-2.5 pr-3 font-mono text-sky-300">{seg.estimatedHours} hr</td>
                <td className="py-2.5 pr-3 font-mono text-sky-400">{seg.waterMl} ml</td>
                <td className="py-2.5 pr-3 font-mono text-amber-300">
                  {seg.carbsG}g / {seg.caloriesKcal} kcal
                </td>
                <td className="py-2.5 font-mono text-amber-200">{seg.sodiumMg} mg</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
