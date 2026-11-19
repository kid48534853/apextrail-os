import React, { useState } from 'react'
import { Upload, Flame, HeartPulse, Zap, Footprints, Droplets, Mountain } from 'lucide-react'
import { parseActivityFile } from '../../core/parsers/activity-parser'
import { analyzeTrailActivity } from '../../core/algorithms/trail-metrics'
import { ActivitySummary, CheckpointInput, TrackPoint } from '../../core/types/trail'

interface RouteAnalyticsViewProps {
  onPlannedTrackLoaded: (points: TrackPoint[]) => void
}

const DEFAULT_CPS: CheckpointInput[] = [
  { id: 'cp-1', name: 'CP1 登山口補水點', distanceKm: 6.5, hasWater: true },
  { id: 'cp-2', name: 'CP2 稜線避難山屋', distanceKm: 14.2, hasWater: false, isShelter: true }
]

const formatPace = (secPerKm: number | null | undefined): string => {
  if (!secPerKm) return '--:--'
  return `${Math.floor(secPerKm / 60)}'${String(secPerKm % 60).padStart(2, '0')}"/km`
}

export const RouteAnalyticsView: React.FC<RouteAnalyticsViewProps> = ({ onPlannedTrackLoaded }) => {
  const [targetEph, setTargetEph] = useState(3.8)
  const [bodyWeightKg, setBodyWeightKg] = useState(65)
  const [plannedSummary, setPlannedSummary] = useState<ActivitySummary | null>(null)
  const [actualSummary, setActualSummary] = useState<ActivitySummary | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, mode: 'planned' | 'actual') => {
    const file = e.target.files?.[0]
    if (!file) return
    setErrorMsg('')
    try {
      const { points } = await parseActivityFile(file)
      const summary = analyzeTrailActivity(points, DEFAULT_CPS, { targetEph, bodyWeightKg })
      if (mode === 'planned') {
        setPlannedSummary(summary)
        onPlannedTrackLoaded(points)
      } else {
        setActualSummary(summary)
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '檔案解析失敗')
    }
  }

  return (
    <div className="space-y-4 text-slate-100">
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4 md:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#84cc16] px-4 py-3 text-sm font-bold text-slate-950">
          <Upload className="h-4 w-4" />
          <span>匯入行前路線檔 (GPX / TCX / FIT)</span>
          <input type="file" accept=".gpx,.tcx,.fit" className="hidden" onChange={(e) => handleUpload(e, 'planned')} />
        </label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-500/50 bg-[#1c2430] px-4 py-3 text-sm font-bold text-sky-300">
          <Flame className="h-4 w-4" />
          <span>上傳賽後手錶實測檔 (FIT / TCX / GPX)</span>
          <input type="file" accept=".fit,.tcx,.gpx" className="hidden" onChange={(e) => handleUpload(e, 'actual')} />
        </label>
        <div className="flex items-center gap-3 text-xs text-slate-300">
          <span>目標 EPH：</span>
          <input type="number" step="0.1" value={targetEph} onChange={(e) => setTargetEph(Number(e.target.value) || 3.5)} className="w-20 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2 py-1 text-center font-bold text-[#84cc16]" />
          <span>體重 (kg)：</span>
          <input type="number" value={bodyWeightKg} onChange={(e) => setBodyWeightKg(Number(e.target.value) || 65)} className="w-20 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2 py-1 text-center font-bold text-amber-400" />
        </div>
      </div>

      {errorMsg && <div className="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-xs text-red-300">{errorMsg}</div>}

      {plannedSummary && (
        <section className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-bold text-amber-300"><Mountain className="h-4 w-4" />出發前：預計路線 EP 難度</h2>
            <span className="rounded-full bg-sky-500/20 px-3 py-0.5 text-xs font-bold text-sky-300">ITRA {plannedSummary.difficulty.itraPoints} 點</span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="預估總 EP 難度" value={`${plannedSummary.ep} EP`} badge={`${plannedSummary.difficulty.code} ${plannedSummary.difficulty.label}`} accent="text-sky-400" />
            <MetricCard label="距離 / 爬升" value={`${plannedSummary.totalDistanceKm} km`} badge={`+${plannedSummary.totalAscentM}m / -${plannedSummary.totalDescentM}m`} accent="text-[#84cc16]" />
            <MetricCard label="預估完賽耗時" value={`${(plannedSummary.ep / targetEph).toFixed(1)} hr`} badge={`以 ${targetEph} EPH 推進`} accent="text-amber-400" />
            <MetricCard label="分段 CP 數" value={`${plannedSummary.segments.length} 段`} badge="已自動試算補給" accent="text-purple-400" />
          </div>
        </section>
      )}

      {actualSummary && (
        <section className="rounded-2xl border border-sky-500/30 bg-[#161b22] p-4">
          <h2 className="mb-3 text-base font-bold text-sky-300">行程結束後：實際路線 EP 與生理分析</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="實際 EP / EPH" value={`${actualSummary.ep} EP`} badge={actualSummary.eph ? `${actualSummary.eph} EPH (${actualSummary.ephGrade?.code})` : '無時間'} accent="text-sky-400" />
            <MetricCard label="均心率 / 安全控場" value={actualSummary.avgHr ? `${actualSummary.avgHr} bpm` : '--'} badge={actualSummary.hrSafeZonePct !== null ? `≤155bpm 佔 ${actualSummary.hrSafeZonePct}%` : '無心率'} accent="text-rose-400" icon={<HeartPulse className="h-3.5 w-3.5 text-rose-400" />} />
            <MetricCard label="配速 / GAP" value={formatPace(actualSummary.avgPaceSecPerKm)} badge={`GAP ${formatPace(actualSummary.avgGapSecPerKm)}`} accent="text-[#84cc16]" icon={<Footprints className="h-3.5 w-3.5 text-[#84cc16]" />} />
            <MetricCard label="功率 / 步頻 / EF" value={actualSummary.avgPower ? `${actualSummary.avgPower} W` : '--'} badge={`步頻 ${actualSummary.avgCadence ?? '--'} | EF ${actualSummary.efficiencyFactor ?? '--'}`} accent="text-amber-400" icon={<Zap className="h-3.5 w-3.5 text-amber-400" />} />
          </div>
        </section>
      )}

      {(actualSummary ?? plannedSummary) && (
        <section className="overflow-x-auto rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100"><Droplets className="h-4 w-4 text-sky-400" />分段 CP 補給策略與 EP / EPH 明細</h3>
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-[#2a323d] text-slate-400">
              <tr>
                <th className="py-2">區段</th><th className="py-2">距離 / 爬升</th><th className="py-2">區段 EP</th><th className="py-2">預估 / 實測 EPH</th><th className="py-2">飲水</th><th className="py-2">碳水 / 熱量</th><th className="py-2">鈉</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222933]">
              {(actualSummary ?? plannedSummary)!.segments.map((seg) => (
                <tr key={seg.segmentIndex} className="hover:bg-[#1c232d]">
                  <td className="py-2.5 font-semibold text-slate-200">{seg.fromName} → {seg.toName}</td>
                  <td className="py-2.5 text-slate-300">{seg.distanceKm} km / +{seg.ascentM}m</td>
                  <td className="py-2.5 font-bold text-[#84cc16]">{seg.ep} EP</td>
                  <td className="py-2.5 text-sky-300">{seg.actualEph ? `${seg.actualEph} EPH (${seg.actualEphGrade?.code})` : `預估 ${seg.estimatedHours} hr`}</td>
                  <td className="py-2.5 text-sky-400">{seg.nutrition.waterMl} ml</td>
                  <td className="py-2.5 text-amber-300">{seg.nutrition.carbsG}g / {seg.nutrition.caloriesKcal} kcal</td>
                  <td className="py-2.5 text-slate-300">{seg.nutrition.sodiumMg} mg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

const MetricCard: React.FC<{ label: string; value: string; badge: string; accent: string; icon?: React.ReactNode }> = ({ label, value, badge, accent, icon }) => (
  <div className="rounded-xl border border-[#2a323d] bg-[#11161d] p-3">
    <div className="flex items-center gap-1.5 text-xs text-slate-400">{icon}<span>{label}</span></div>
    <div className={`mt-1 text-xl font-extrabold ${accent}`}>{value}</div>
    <div className="mt-1 inline-block rounded-md bg-[#1f2733] px-2 py-0.5 text-[11px] text-slate-300">{badge}</div>
  </div>
)
