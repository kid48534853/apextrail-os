import React, { useMemo, useState } from 'react'
import { Droplets, Flame } from 'lucide-react'
import { TrackPoint } from '../../core/types/trail'
import { CpDifficultyLevel } from '../../core/types/cp-strategy'
import { buildCumulativeTrack, computeIntervalSegments } from '../../core/algorithms/cp-difficulty'

interface CpStrategyPanelProps {
  track: TrackPoint[]
  targetEph: number
  weightKg: number
}

const PRESET_INTERVALS = [3, 5, 10, 15]

const DIFFICULTY_BADGE_STYLES: Record<CpDifficultyLevel, string> = {
  easy: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
  moderate: 'border-sky-500/40 bg-sky-500/15 text-sky-300',
  hard: 'border-amber-500/40 bg-amber-500/15 text-amber-300',
  extreme: 'border-rose-500/40 bg-rose-500/15 text-rose-300'
}

export const CpStrategyPanel: React.FC<CpStrategyPanelProps> = ({
  track,
  targetEph,
  weightKg
}) => {
  const [intervalKm, setIntervalKm] = useState<number>(5)

  const totalDistKm = useMemo(() => {
    const cum = buildCumulativeTrack(track)
    return cum.length > 0 ? Number(cum[cum.length - 1].cumDistKm.toFixed(2)) : 0
  }, [track])

  const segments = useMemo(
    () => computeIntervalSegments(track, intervalKm, targetEph, weightKg),
    [track, intervalKm, targetEph, weightKg]
  )

  if (totalDistKm < 0.2) {
    return (
      <div className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4 text-xs text-slate-400">
        請先匯入路線檔（GPX / TCX / FIT），即可依每幾公里自動試算分段補給與難度提示。
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Droplets className="h-4 w-4 text-sky-400" />
          <span>分段里程補給策略與難度分析（總距離 {totalDistKm} km）</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400">補給間距：</span>
          {PRESET_INTERVALS.map((km) => (
            <button
              key={km}
              type="button"
              onClick={() => setIntervalKm(km)}
              className={`rounded-lg px-2.5 py-1 font-bold ${
                intervalKm === km
                  ? 'bg-[#84cc16] text-slate-950'
                  : 'border border-[#2a323d] bg-[#1f2630] text-slate-200'
              }`}
            >
              每 {km} km
            </button>
          ))}
          <label className="ml-1 flex items-center gap-1 text-slate-300">
            <span>自訂</span>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={intervalKm}
              onChange={(e) => setIntervalKm(Math.max(1, Number(e.target.value) || 5))}
              className="w-14 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2 py-1 text-center font-mono text-white"
            />
            <span>km</span>
          </label>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[740px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[#2a323d] text-slate-400">
              <th className="py-2 pr-3">里程區段</th>
              <th className="py-2 pr-3">難度與控場提示</th>
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
                <td className="py-2.5 pr-3 font-mono font-semibold text-slate-100">
                  {seg.fromLabel} → {seg.toLabel}
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
