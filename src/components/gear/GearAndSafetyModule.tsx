import React, { useMemo, useState } from 'react'
import { CheckSquare, ShieldAlert, Printer, Copy, Plus, Trash2, Backpack } from 'lucide-react'
import { computeWeightSummary, detectMandatoryGear, useGearStore } from '../../store/use-gear-store'

export const GearAndSafetyModule: React.FC<{ bodyWeightKg: number }> = ({ bodyWeightKg }) => {
  const { categories, items, safetyPlan, addItem, removeItem, toggleCheck, markAllStage, resetAllChecks, updateSafetyPlan } = useGearStore()
  const [activeTab, setActiveTab] = useState<'gear' | 'check' | 'plan'>('gear')
  const [onlyUnchecked, setOnlyUnchecked] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWeightG, setNewWeightG] = useState('150')
  const [newCatId, setNewCatId] = useState(categories[0]?.id ?? 'cat-pack')
  const [isWorn, setIsWorn] = useState(false)
  const [isConsumable, setIsConsumable] = useState(false)
  const [copyToast, setCopyToast] = useState('')

  const summary = useMemo(() => computeWeightSummary(items, bodyWeightKg), [items, bodyWeightKg])
  const missingMandatory = useMemo(() => detectMandatoryGear(items).filter((m) => !m.isPresent), [items])

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    addItem({ categoryId: newCatId, name: newName.trim(), weightG: Math.max(0, Number(newWeightG) || 0), quantity: 1, isWorn, isConsumable })
    setNewName('')
    setNewWeightG('100')
    setIsWorn(false)
    setIsConsumable(false)
  }

  const handleCopyPlainText = async () => {
    const text = [
      `【登山／越野跑安全留守計畫書】`,
      `路線：${safetyPlan.routeName} (${safetyPlan.startDate} ~ ${safetyPlan.endDate})`,
      `入園/保險：${safetyPlan.permitAndInsurance}`,
      `領隊：${safetyPlan.leaderContact || '未填寫'} | 留守人：${safetyPlan.stayBehindContact || '未填寫'}`,
      `通聯：${safetyPlan.checkInSchedule} | 死線：${safetyPlan.sarTriggerDeadline}`,
      `設備：${safetyPlan.commDevices}`,
      `撤退計畫：${safetyPlan.bailoutPlan || '未填寫'}`
    ].join('\n')
    await navigator.clipboard.writeText(text)
    setCopyToast('已複製純文字留守計畫書！')
    setTimeout(() => setCopyToast(''), 3000)
  }

  return (
    <div className="space-y-4 text-slate-100">
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2a323d] bg-[#161b22] p-1.5 print:hidden">
        <button onClick={() => setActiveTab('gear')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${activeTab === 'gear' ? 'bg-[#84cc16] text-slate-950' : 'text-slate-300'}`}>
          <Backpack className="h-4 w-4" />裝備 ({(summary.baseWeightG / 1000).toFixed(2)}kg)
        </button>
        <button onClick={() => setActiveTab('check')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${activeTab === 'check' ? 'bg-[#84cc16] text-slate-950' : 'text-slate-300'}`}>
          <CheckSquare className="h-4 w-4" />二次確認 ({summary.stage2Done}/{summary.totalItems})
        </button>
        <button onClick={() => setActiveTab('plan')} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${activeTab === 'plan' ? 'bg-[#84cc16] text-slate-950' : 'text-slate-300'}`}>
          <Printer className="h-4 w-4" />留守計畫書
        </button>
      </div>

      {activeTab === 'gear' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold">輕量化評級與負重儀表</span>
              <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${summary.ultralightTier.badgeClass}`}>{summary.ultralightTier.label}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatBox label="基礎重量" value={`${(summary.baseWeightG / 1000).toFixed(2)} kg`} color="text-[#84cc16]" />
              <StatBox label="背包實重" value={`${(summary.packWeightG / 1000).toFixed(2)} kg`} color="text-sky-400" />
              <StatBox label="消耗品" value={`${(summary.consumableWeightG / 1000).toFixed(2)} kg`} color="text-amber-400" />
              <StatBox label="體重負荷比" value={`${summary.bodyWeightRatioPct}%`} color="text-slate-100" />
            </div>
          </div>

          <form onSubmit={handleAddItem} className="grid grid-cols-1 gap-2 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4 md:grid-cols-5">
            <input type="text" placeholder="裝備名稱" value={newName} onChange={(e) => setNewName(e.target.value)} className="rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-2 text-xs md:col-span-2" />
            <input type="number" placeholder="重量 (g)" value={newWeightG} onChange={(e) => setNewWeightG(e.target.value)} className="rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-2 text-xs" />
            <select value={newCatId} onChange={(e) => setNewCatId(e.target.value)} className="rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-2 text-xs">
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="submit" className="flex items-center justify-center gap-1 rounded-lg bg-[#84cc16] py-2 text-xs font-bold text-slate-950"><Plus className="h-4 w-4" />新增</button>
            <div className="flex items-center gap-4 text-xs text-slate-300 md:col-span-5">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={isConsumable} onChange={(e) => setIsConsumable(e.target.checked)} />消耗品</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={isWorn} onChange={(e) => setIsWorn(e.target.checked)} />穿戴身上</label>
            </div>
          </form>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#2a323d] bg-[#161b22] px-4 py-2.5 text-xs">
                <span>{item.name}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[#84cc16]">{item.weightG} g</span>
                  <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'check' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
            <button onClick={() => setOnlyUnchecked((p) => !p)} className="rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-1.5 text-xs">{onlyUnchecked ? '顯示全部' : '僅顯示未完成'}</button>
            <button onClick={() => markAllStage(1, true)} className="rounded-lg border border-[#2a323d] bg-[#1f2630] px-3 py-1.5 text-xs">① 全部初檢完成</button>
            <button onClick={() => markAllStage(2, true)} className="rounded-lg bg-[#84cc16] px-3 py-1.5 text-xs font-bold text-slate-950">② 全部上包完成</button>
            <button onClick={resetAllChecks} className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300">重置</button>
          </div>

          <div className="rounded-2xl border border-amber-500/40 bg-[#161b22] p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-300"><ShieldAlert className="h-4 w-4" />保命強制裝備自動偵測</div>
            {missingMandatory.length === 0 ? (
              <p className="text-xs text-[#84cc16]">所有 8 項保命強制裝備皆已備齊！</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {missingMandatory.map((m) => <span key={m.key} className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1 text-xs text-rose-300">缺：{m.label}</span>)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            {items.filter((i) => (!onlyUnchecked ? true : !i.checkedStage2)).map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-xl border border-[#2a323d] bg-[#161b22] px-4 py-2.5 text-xs">
                <span className={item.checkedStage2 ? 'text-slate-500 line-through' : 'font-semibold'}>{item.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => toggleCheck(item.id, 1)} className={`rounded px-2 py-1 font-bold ${item.checkedStage1 ? 'bg-sky-500/20 text-sky-300' : 'bg-[#0d1117] text-slate-400'}`}>① 初檢</button>
                  <button onClick={() => toggleCheck(item.id, 2)} className={`rounded px-2 py-1 font-bold ${item.checkedStage2 ? 'bg-[#84cc16] text-slate-950' : 'bg-[#0d1117] text-slate-400'}`}>② 入包</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'plan' && (
        <div className="space-y-4 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4 print:border-none print:bg-white print:text-black">
          <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
            <h3 className="text-sm font-bold text-[#84cc16]">安全留守計畫書</h3>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg bg-[#84cc16] px-3 py-1.5 text-xs font-bold text-slate-950"><Printer className="h-3.5 w-3.5" />匯出 PDF</button>
              <button onClick={handleCopyPlainText} className="flex items-center gap-1.5 rounded-lg border border-[#2a323d] bg-[#1f2630] px-3 py-1.5 text-xs font-bold"><Copy className="h-3.5 w-3.5" />複製純文字</button>
            </div>
          </div>
          {copyToast && <p className="text-xs text-[#84cc16] print:hidden">{copyToast}</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PlanField label="路線名稱" value={safetyPlan.routeName} onChange={(v) => updateSafetyPlan({ routeName: v })} />
            <PlanField label="入園/保險狀態" value={safetyPlan.permitAndInsurance} onChange={(v) => updateSafetyPlan({ permitAndInsurance: v })} />
            <PlanField label="出發日期" value={safetyPlan.startDate} onChange={(v) => updateSafetyPlan({ startDate: v })} />
            <PlanField label="下山日期" value={safetyPlan.endDate} onChange={(v) => updateSafetyPlan({ endDate: v })} />
            <PlanField label="領隊聯絡" value={safetyPlan.leaderContact} onChange={(v) => updateSafetyPlan({ leaderContact: v })} />
            <PlanField label="留守人聯絡" value={safetyPlan.stayBehindContact} onChange={(v) => updateSafetyPlan({ stayBehindContact: v })} />
            <PlanField label="通聯回報時間" value={safetyPlan.checkInSchedule} onChange={(v) => updateSafetyPlan({ checkInSchedule: v })} />
            <PlanField label="搜救觸發死線" value={safetyPlan.sarTriggerDeadline} onChange={(v) => updateSafetyPlan({ sarTriggerDeadline: v })} />
          </div>
          <textarea rows={3} value={safetyPlan.bailoutPlan} onChange={(e) => updateSafetyPlan({ bailoutPlan: e.target.value })} placeholder="緊急撤退路線 (C-Plan)..." className="w-full rounded-xl border border-[#2a323d] bg-[#0d1117] p-3 text-xs" />
        </div>
      )}
    </div>
  )
}

const StatBox: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className="rounded-xl border border-[#2a323d] bg-[#0d1117] p-3">
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className={`mt-1 text-lg font-extrabold ${color}`}>{value}</div>
  </div>
)

const PlanField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="mb-1 block text-xs text-slate-400">{label}</label>
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-2 text-xs" />
  </div>
)
