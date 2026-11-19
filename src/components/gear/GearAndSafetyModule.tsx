import React, { useMemo, useState } from 'react'
import {
  Backpack,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FolderPlus,
  GripVertical,
  Plus,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
  Upload
} from 'lucide-react'
import { computeWeightSummary, formatWeight, useGearStore } from '../../store/use-gear-store'
import { GearDonutChart } from './GearDonutChart'

export const GearAndSafetyModule: React.FC<{ bodyWeightKg: number }> = ({ bodyWeightKg }) => {
  const {
    trips,
    activeTripId,
    vault,
    weightUnit,
    safetyPlan,
    setActiveTrip,
    createTrip,
    deleteTrip,
    duplicateActiveTrip,
    updateActiveTripMeta,
    setWeightUnit,
    addCategory,
    deleteCategory,
    moveCategory,
    addItem,
    updateItem,
    removeItem,
    moveItem,
    addVaultTemplate,
    removeVaultTemplate,
    deployVaultItemToTrip,
    toggleCheck,
    markAllStage,
    resetAllChecks,
    updateSafetyPlan,
    exportStateJson,
    importStateJson
  } = useGearStore()

  const activeTrip = useMemo(
    () => trips.find((t) => t.id === activeTripId) ?? trips[0],
    [trips, activeTripId]
  )

  const [activeTab, setActiveTab] = useState<'gear' | 'check' | 'plan'>('gear')
  const [onlyUnchecked, setOnlyUnchecked] = useState(false)

  const [vaultQuery, setVaultQuery] = useState('')
  const [selectedVaultCat, setSelectedVaultCat] = useState<string>('全部')
  const [showNewVaultForm, setShowNewVaultForm] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplCategory, setTplCategory] = useState('背負系統')
  const [tplBrand, setTplBrand] = useState('')
  const [tplWeightG, setTplWeightG] = useState('120')

  const [showNewTripForm, setShowNewTripForm] = useState(false)
  const [newTripName, setNewTripName] = useState('')
  const [newTripDays, setNewTripDays] = useState('2')
  const [newTripMode, setNewTripMode] = useState('Fastpacking 快速打包')

  const [showNewCatForm, setShowNewCatForm] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState('#38bdf8')

  const [statusToast, setStatusToast] = useState('')

  const summary = useMemo(
    () => computeWeightSummary(activeTrip.items, bodyWeightKg),
    [activeTrip.items, bodyWeightKg]
  )

  const vaultCategories = useMemo(() => {
    const setNames = new Set<string>([
      '全部',
      ...activeTrip.categories.map((c) => c.name),
      ...vault.map((v) => v.categoryName)
    ])
    return Array.from(setNames)
  }, [activeTrip.categories, vault])

  const filteredVault = useMemo(() => {
    const q = vaultQuery.trim().toLowerCase()
    return vault.filter((v) => {
      const matchCat = selectedVaultCat === '全部' || v.categoryName === selectedVaultCat
      const matchText =
        !q ||
        v.name.toLowerCase().includes(q) ||
        v.brandModel.toLowerCase().includes(q) ||
        v.categoryName.toLowerCase().includes(q)
      return matchCat && matchText
    })
  }, [vault, vaultQuery, selectedVaultCat])

  const notify = (msg: string) => {
    setStatusToast(msg)
    setTimeout(() => setStatusToast(''), 3200)
  }

  const handleCreateTrip = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTripName.trim()) return
    createTrip(newTripName, Number(newTripDays), newTripMode)
    setNewTripName('')
    setShowNewTripForm(false)
    notify('已建立新行程')
  }

  const handleCreateVaultItem = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tplName.trim()) return
    addVaultTemplate({
      name: tplName,
      categoryName: tplCategory,
      brandModel: tplBrand,
      weightG: Number(tplWeightG),
      isWorn: false,
      isConsumable: false,
      isMandatory: false
    })
    setTplName('')
    setTplBrand('')
    setTplWeightG('120')
    setShowNewVaultForm(false)
    notify('已存入裝備庫')
  }

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    addCategory(newCatName, newCatColor)
    setNewCatName('')
    setShowNewCatForm(false)
    notify('已新增裝備分類')
  }

  const handleAddItemToCategory = (categoryId: string) => {
    addItem({
      categoryId,
      name: '新裝備項目',
      brandModel: '',
      weightG: 100,
      quantity: 1,
      isWorn: false,
      isConsumable: false,
      isMandatory: false
    })
  }

  const handleExportJson = () => {
    const json = exportStateJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apextrail-gear-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('已匯出離線裝備 JSON 檔')
  }

  const handleImportJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = importStateJson(text)
    notify(result.message)
    e.target.value = ''
  }

  const handleCopySafetyPlan = async () => {
    const text = [
      `【登山／越野跑安全留守計畫書】`,
      `行程：${activeTrip.name} (${activeTrip.days} 天)｜路線：${safetyPlan.routeName}`,
      `日期：${safetyPlan.startDate} ~ ${safetyPlan.endDate}`,
      `入園/保險：${safetyPlan.permitAndInsurance}`,
      `領隊：${safetyPlan.leaderContact || '未填寫'}｜留守人：${safetyPlan.stayBehindContact || '未填寫'}`,
      `通聯：${safetyPlan.checkInSchedule}｜搜救死線：${safetyPlan.sarTriggerDeadline}`,
      `通訊與導航：${safetyPlan.commDevices}`,
      `撤退計畫：${safetyPlan.bailoutPlan || '未填寫'}`
    ].join('\n')
    await navigator.clipboard.writeText(text)
    notify('已複製留守計畫書純文字')
  }

  const missingMandatoryItems = activeTrip.items.filter((i) => i.isMandatory && !i.checkedStage2)

  return (
    <div className="grid grid-cols-1 gap-4 text-slate-100 xl:grid-cols-12">
      <aside className="space-y-4 xl:col-span-4 print:hidden">
        <div className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wide text-slate-200">
              行程列表 · {trips.length}
            </span>
            <button
              type="button"
              onClick={() => setShowNewTripForm((p) => !p)}
              className="flex items-center gap-1 rounded-lg bg-[#84cc16]/15 px-2.5 py-1 text-xs font-bold text-[#a3e635] hover:bg-[#84cc16]/25"
            >
              <Plus className="h-3.5 w-3.5" />
              新增行程
            </button>
          </div>

          {showNewTripForm && (
            <form onSubmit={handleCreateTrip} className="mb-3 space-y-2 rounded-xl border border-[#2a323d] bg-[#0d1117] p-3 text-xs">
              <input
                type="text"
                placeholder="行程名稱（例如：奇萊南峰／南華山 3 日）"
                value={newTripName}
                onChange={(e) => setNewTripName(e.target.value)}
                className="w-full rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="1"
                  value={newTripDays}
                  onChange={(e) => setNewTripDays(e.target.value)}
                  placeholder="天數"
                  className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
                />
                <input
                  type="text"
                  value={newTripMode}
                  onChange={(e) => setNewTripMode(e.target.value)}
                  placeholder="打包模式"
                  className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
                />
              </div>
              <button type="submit" className="w-full rounded-lg bg-[#84cc16] py-1.5 font-bold text-slate-950">
                確認建立
              </button>
            </form>
          )}

          <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
            {trips.map((trip) => {
              const s = computeWeightSummary(trip.items, bodyWeightKg)
              const isSelected = trip.id === activeTrip.id
              return (
                <div
                  key={trip.id}
                  onClick={() => setActiveTrip(trip.id)}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2.5 transition ${
                    isSelected
                      ? 'border-[#84cc16] bg-[#1e2631]'
                      : 'border-[#2a323d] bg-[#0d1117] hover:border-slate-600'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-white">{trip.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {trip.days}天 基重 {(s.baseWeightG / 1000).toFixed(2)}kg 總重 {(s.totalWeightG / 1000).toFixed(2)}kg
                    </div>
                  </div>
                  {trips.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteTrip(trip.id)
                      }}
                      aria-label="刪除行程"
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wide text-slate-200">
              裝備庫 · {vault.length}
            </span>
            <button
              type="button"
              onClick={() => setShowNewVaultForm((p) => !p)}
              className="flex items-center gap-1 rounded-lg bg-[#84cc16]/15 px-2.5 py-1 text-xs font-bold text-[#a3e635] hover:bg-[#84cc16]/25"
            >
              <Plus className="h-3.5 w-3.5" />
              新增物品
            </button>
          </div>

          {showNewVaultForm && (
            <form onSubmit={handleCreateVaultItem} className="mb-3 space-y-2 rounded-xl border border-[#2a323d] bg-[#0d1117] p-3 text-xs">
              <input
                type="text"
                placeholder="裝備名稱"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                className="w-full rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="分類（如：宿營系統）"
                  value={tplCategory}
                  onChange={(e) => setTplCategory(e.target.value)}
                  className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="重量 (g)"
                  value={tplWeightG}
                  onChange={(e) => setTplWeightG(e.target.value)}
                  className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
                />
              </div>
              <input
                type="text"
                placeholder="品牌／型號／描述"
                value={tplBrand}
                onChange={(e) => setTplBrand(e.target.value)}
                className="w-full rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5"
              />
              <button type="submit" className="w-full rounded-lg bg-[#84cc16] py-1.5 font-bold text-slate-950">
                儲存至裝備庫
              </button>
            </form>
          )}

          <div className="relative mb-2.5">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜尋裝備名稱、品牌或分類..."
              value={vaultQuery}
              onChange={(e) => setVaultQuery(e.target.value)}
              className="w-full rounded-xl border border-[#2a323d] bg-[#0d1117] py-2 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500"
            />
          </div>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {vaultCategories.map((catName) => {
              const active = selectedVaultCat === catName
              return (
                <button
                  key={catName}
                  type="button"
                  onClick={() => setSelectedVaultCat(catName)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    active
                      ? 'bg-[#84cc16] text-slate-950'
                      : 'border border-[#2a323d] bg-[#0d1117] text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {catName}
                </button>
              )
            })}
          </div>

          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {filteredVault.map((tpl) => (
              <div
                key={tpl.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-[#2a323d] bg-[#0d1117] px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-100">{tpl.name}</div>
                  <div className="truncate text-[11px] text-slate-400">
                    [{tpl.categoryName}] {tpl.brandModel || '自訂'}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="rounded bg-[#1f2630] px-2 py-0.5 font-mono text-[11px] text-slate-200">
                    {tpl.weightG}克
                  </span>
                  <button
                    type="button"
                    onClick={() => removeVaultTemplate(tpl.id)}
                    aria-label="刪除裝備庫項目"
                    className="rounded p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      deployVaultItemToTrip(tpl.id)
                      notify(`已將「${tpl.name}」加入 ${activeTrip.name}`)
                    }}
                    aria-label="加入目前行程"
                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#84cc16] font-bold text-slate-950 hover:bg-[#a3e635]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="space-y-4 xl:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2a323d] bg-[#161b22] px-4 py-3 print:hidden">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-base font-extrabold text-white">{activeTrip.name}</h2>
            <span className="rounded-lg border border-[#2a323d] bg-[#0d1117] px-2.5 py-1 text-xs text-slate-300">
              {activeTrip.modeLabel}
            </span>
            <div className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2 py-1 text-xs">
              <input
                type="number"
                min="1"
                value={activeTrip.days}
                onChange={(e) => updateActiveTripMeta({ days: Number(e.target.value) })}
                aria-label="行程天數"
                className="w-10 bg-transparent text-center font-bold text-[#a3e635]"
              />
              <span className="text-slate-400">天</span>
            </div>
            <button
              type="button"
              onClick={() => setWeightUnit(weightUnit === 'kg' ? 'g' : 'kg')}
              className="rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1 text-xs font-bold text-slate-200 hover:border-[#84cc16]"
            >
              {weightUnit === 'kg' ? 'kg / g' : 'g / kg'}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={duplicateActiveTrip}
              className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-semibold text-slate-200"
            >
              <Copy className="h-3.5 w-3.5" />
              複製行程
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('plan')}
              className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-semibold text-slate-200"
            >
              <Printer className="h-3.5 w-3.5" />
              留守計畫書預覽
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-semibold text-[#a3e635]"
            >
              <Download className="h-3.5 w-3.5" />
              離線匯出
            </button>
            <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-semibold text-sky-300">
              <Upload className="h-3.5 w-3.5" />
              匯入 JSON
              <input type="file" accept="application/json" onChange={handleImportJsonFile} className="hidden" />
            </label>
          </div>
        </div>

        {statusToast && (
          <div className="rounded-xl border border-[#84cc16]/40 bg-[#84cc16]/10 px-4 py-2 text-xs font-semibold text-[#a3e635] print:hidden">
            {statusToast}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 rounded-xl border border-[#2a323d] bg-[#161b22] p-1.5 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('gear')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${
              activeTab === 'gear' ? 'bg-[#84cc16] text-slate-950' : 'text-slate-300 hover:bg-[#1f2630]'
            }`}
          >
            <Backpack className="h-4 w-4" />
            裝備重量規劃 ({formatWeight(summary.packWeightG, weightUnit)})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('check')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${
              activeTab === 'check' ? 'bg-[#84cc16] text-slate-950' : 'text-slate-300 hover:bg-[#1f2630]'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            二次確認攜帶檢核 ({summary.stage2Done}/{summary.totalItems})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold ${
              activeTab === 'plan' ? 'bg-[#84cc16] text-slate-950' : 'text-slate-300 hover:bg-[#1f2630]'
            }`}
          >
            <Printer className="h-4 w-4" />
            登山／越野跑計畫書
          </button>
        </div>

        {activeTab === 'gear' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <GearDonutChart
                  categories={activeTrip.categories}
                  items={activeTrip.items}
                  totalWeightG={summary.totalWeightG}
                  baseWeightG={summary.baseWeightG}
                  consumableWeightG={summary.consumableWeightG}
                  wornWeightG={summary.wornWeightG}
                  weightUnit={weightUnit}
                />
              </div>

              <div className="flex flex-col justify-between space-y-3 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4 lg:col-span-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-200">輕量化評級與打包進度</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${summary.ultralightTier.badgeClass}`}>
                      {summary.ultralightTier.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                    <span>二次確認上包進度</span>
                    <span className="font-mono text-slate-200">
                      {summary.stage2Done}/{summary.totalItems} (
                      {summary.totalItems ? Math.round((summary.stage2Done / summary.totalItems) * 100) : 0}%)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <MetricCard
                    label="背包實際肩負重"
                    value={formatWeight(summary.packWeightG, weightUnit)}
                    accent="text-white"
                  />
                  <MetricCard
                    label="強制/關鍵安全裝備"
                    value={`${summary.mandatoryCount} 項已列`}
                    accent="text-rose-400"
                  />
                  <MetricCard
                    label="總裝備件數"
                    value={`${summary.totalQuantity} 件`}
                    accent="text-white"
                  />
                  <MetricCard
                    label={`佔體重負荷比 (${bodyWeightKg}kg 基準)`}
                    value={`${summary.bodyWeightRatioPct}%`}
                    accent="text-sky-400"
                  />
                </div>

                <div className="space-y-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewCatForm((p) => !p)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#84cc16] py-2.5 text-xs font-extrabold text-slate-950 hover:bg-[#a3e635]"
                  >
                    <FolderPlus className="h-4 w-4" />
                    + 新增裝備分類系統
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('check')}
                    className="w-full rounded-xl border border-[#2a323d] bg-[#1f2630] py-2 text-xs font-bold text-slate-200 hover:border-slate-500"
                  >
                    前往二次確認 →
                  </button>
                </div>
              </div>
            </div>

            {showNewCatForm && (
              <form onSubmit={handleCreateCategory} className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#84cc16]/40 bg-[#161b22] p-3.5 text-xs">
                <input
                  type="text"
                  placeholder="自訂分類名稱（例如：炊煮系統、宿營與睡眠、登山杖）"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="min-w-[220px] flex-1 rounded-xl border border-[#2a323d] bg-[#0d1117] px-3 py-2"
                />
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  aria-label="選擇分類色標"
                  className="h-9 w-11 cursor-pointer rounded-lg border border-[#2a323d] bg-[#0d1117]"
                />
                <button type="submit" className="rounded-xl bg-[#84cc16] px-4 py-2 font-bold text-slate-950">
                  建立分類
                </button>
              </form>
            )}

            <div className="space-y-4">
              {activeTrip.categories.map((cat, catIdx) => {
                const catItems = activeTrip.items.filter((i) => i.categoryId === cat.id)
                const catTotalG = catItems.reduce((sum, i) => sum + i.weightG * Math.max(1, i.quantity), 0)
                const catQty = catItems.reduce((sum, i) => sum + Math.max(1, i.quantity), 0)

                return (
                  <div key={cat.id} className="overflow-hidden rounded-2xl border border-[#2a323d] bg-[#161b22]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2a323d] bg-[#1b222c] px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-slate-500" />
                        <button
                          type="button"
                          onClick={() => moveCategory(cat.id, 'up')}
                          disabled={catIdx === 0}
                          aria-label="上移分類"
                          className="rounded p-0.5 text-slate-400 hover:bg-[#2a323d] disabled:opacity-30"
                        >
                          <ChevronUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategory(cat.id, 'down')}
                          disabled={catIdx === activeTrip.categories.length - 1}
                          aria-label="下移分類"
                          className="rounded p-0.5 text-slate-400 hover:bg-[#2a323d] disabled:opacity-30"
                        >
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: cat.colorHex }} />
                        <span className="text-sm font-bold text-white">{cat.name}</span>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-300">
                          小計：<strong className="font-mono text-white">{formatWeight(catTotalG, weightUnit)}</strong>
                        </span>
                        <span className="text-slate-400">數量：{catQty}</span>
                        <button
                          type="button"
                          onClick={() => deleteCategory(cat.id)}
                          className="flex items-center gap-1 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          刪除分類
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead>
                          <tr className="border-b border-[#2a323d] bg-[#141920] text-[11px] text-slate-400">
                            <th className="px-3 py-2 font-medium">排序</th>
                            <th className="px-3 py-2 font-medium">裝備項目名稱</th>
                            <th className="px-3 py-2 font-medium">品牌 / 型號 / 描述</th>
                            <th className="px-3 py-2 font-medium">屬性標記（穿戴/消耗/必備）</th>
                            <th className="px-3 py-2 font-medium">攜帶雙重確認（初檢 → 上包）</th>
                            <th className="px-3 py-2 font-medium">單件重量 (g)</th>
                            <th className="px-3 py-2 font-medium">數量</th>
                            <th className="px-2 py-2 font-medium" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#2a323d]">
                          {catItems.map((item, idx) => (
                            <tr key={item.id} className="hover:bg-[#1a2029]">
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1 text-slate-400">
                                  <button
                                    type="button"
                                    onClick={() => moveItem(item.id, 'up')}
                                    disabled={idx === 0}
                                    aria-label="上移裝備"
                                    className="rounded p-0.5 hover:bg-[#2a323d] disabled:opacity-25"
                                  >
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveItem(item.id, 'down')}
                                    disabled={idx === catItems.length - 1}
                                    aria-label="下移裝備"
                                    className="rounded p-0.5 hover:bg-[#2a323d] disabled:opacity-25"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.name}
                                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                                  className="w-36 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2.5 py-1.5 font-semibold text-white"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={item.brandModel}
                                  placeholder="品牌型號或描述"
                                  onChange={(e) => updateItem(item.id, { brandModel: e.target.value })}
                                  className="w-36 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2.5 py-1.5 text-slate-200 placeholder:text-slate-500"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => updateItem(item.id, { isWorn: !item.isWorn })}
                                    className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                                      item.isWorn
                                        ? 'border border-sky-400/40 bg-sky-500/25 text-sky-300'
                                        : 'border border-[#2a323d] bg-[#0d1117] text-slate-400'
                                    }`}
                                  >
                                    穿戴
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateItem(item.id, { isConsumable: !item.isConsumable })}
                                    className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                                      item.isConsumable
                                        ? 'border border-amber-400/40 bg-amber-500/25 text-amber-300'
                                        : 'border border-[#2a323d] bg-[#0d1117] text-slate-400'
                                    }`}
                                  >
                                    消耗
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateItem(item.id, { isMandatory: !item.isMandatory })}
                                    className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                                      item.isMandatory
                                        ? 'border border-rose-400/40 bg-rose-500/25 text-rose-300'
                                        : 'border border-[#2a323d] bg-[#0d1117] text-slate-400'
                                    }`}
                                  >
                                    必備
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-3">
                                  <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={item.checkedStage1}
                                      onChange={() => toggleCheck(item.id, 1)}
                                    />
                                    初檢
                                  </label>
                                  <label className="flex cursor-pointer items-center gap-1 text-[11px] text-slate-300">
                                    <input
                                      type="checkbox"
                                      checked={item.checkedStage2}
                                      onChange={() => toggleCheck(item.id, 2)}
                                    />
                                    二次確認
                                  </label>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="number"
                                    min="0"
                                    value={item.weightG}
                                    onChange={(e) => updateItem(item.id, { weightG: Number(e.target.value) })}
                                    className="w-20 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2 py-1.5 font-mono text-white"
                                  />
                                  <span className="text-slate-400">克</span>
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) })}
                                  className="w-14 rounded-lg border border-[#2a323d] bg-[#0d1117] px-2 py-1.5 text-center font-mono text-white"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  aria-label="移除裝備"
                                  className="rounded p-1 text-slate-500 hover:text-rose-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#2a323d] bg-[#141920] px-4 py-2.5 text-xs">
                      <button
                        type="button"
                        onClick={() => handleAddItemToCategory(cat.id)}
                        className="flex items-center gap-1 font-semibold text-slate-300 hover:text-[#a3e635]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新增項目至此分類
                      </button>
                      <span className="text-[11px] text-amber-300/90">
                        按住「▲」「▼」可調整分類與裝備順序
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'check' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
              <button
                type="button"
                onClick={() => setOnlyUnchecked((p) => !p)}
                className="rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-1.5 text-xs font-semibold"
              >
                {onlyUnchecked ? '顯示全部裝備' : '僅顯示未完成上包'}
              </button>
              <button
                type="button"
                onClick={() => markAllStage(1, true)}
                className="rounded-lg border border-[#2a323d] bg-[#1f2630] px-3 py-1.5 text-xs font-semibold"
              >
                ① 全部初檢完成
              </button>
              <button
                type="button"
                onClick={() => markAllStage(2, true)}
                className="rounded-lg bg-[#84cc16] px-3 py-1.5 text-xs font-bold text-slate-950"
              >
                ② 全部上包完成
              </button>
              <button
                type="button"
                onClick={resetAllChecks}
                className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs font-semibold text-rose-300"
              >
                重置檢核
              </button>
            </div>

            <div className="rounded-2xl border border-amber-500/40 bg-[#161b22] p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                強制／關鍵安全裝備上包提醒
              </div>
              {missingMandatoryItems.length === 0 ? (
                <p className="text-xs font-semibold text-[#a3e635]">所有標記「必備」的裝備皆已完成二次確認上包！</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {missingMandatoryItems.map((m) => (
                    <span
                      key={m.id}
                      className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-2.5 py-1 text-xs font-semibold text-rose-200"
                    >
                      尚未上包：{m.name} ({formatWeight(m.weightG * m.quantity, weightUnit)})
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              {activeTrip.items
                .filter((i) => (!onlyUnchecked ? true : !i.checkedStage2))
                .map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-[#2a323d] bg-[#161b22] px-4 py-2.5 text-xs"
                  >
                    <div>
                      <span className={item.checkedStage2 ? 'text-slate-500 line-through' : 'font-bold text-white'}>
                        {item.name}
                      </span>
                      <span className="ml-2 font-mono text-slate-400">
                        {formatWeight(item.weightG * item.quantity, weightUnit)} × {item.quantity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCheck(item.id, 1)}
                        className={`rounded-lg px-2.5 py-1 font-bold ${
                          item.checkedStage1 ? 'bg-sky-500/20 text-sky-300' : 'bg-[#0d1117] text-slate-400'
                        }`}
                      >
                        ① 初檢
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCheck(item.id, 2)}
                        className={`rounded-lg px-2.5 py-1 font-bold ${
                          item.checkedStage2 ? 'bg-[#84cc16] text-slate-950' : 'bg-[#0d1117] text-slate-400'
                        }`}
                      >
                        ② 入包
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {activeTab === 'plan' && (
          <div className="space-y-4 rounded-2xl border border-[#2a323d] bg-[#161b22] p-5 print:border-none print:bg-white print:text-black">
            <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
              <h3 className="text-sm font-extrabold text-[#a3e635]">安全留守計畫書</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg bg-[#84cc16] px-3 py-1.5 text-xs font-bold text-slate-950"
                >
                  <Printer className="h-3.5 w-3.5" />
                  匯出 PDF
                </button>
                <button
                  type="button"
                  onClick={handleCopySafetyPlan}
                  className="flex items-center gap-1.5 rounded-lg border border-[#2a323d] bg-[#1f2630] px-3 py-1.5 text-xs font-bold"
                >
                  <Copy className="h-3.5 w-3.5" />
                  複製純文字
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PlanInput label="路線名稱" value={safetyPlan.routeName} onChange={(v) => updateSafetyPlan({ routeName: v })} />
              <PlanInput label="入園／保險狀態" value={safetyPlan.permitAndInsurance} onChange={(v) => updateSafetyPlan({ permitAndInsurance: v })} />
              <PlanInput label="出發日期" value={safetyPlan.startDate} onChange={(v) => updateSafetyPlan({ startDate: v })} />
              <PlanInput label="下山日期" value={safetyPlan.endDate} onChange={(v) => updateSafetyPlan({ endDate: v })} />
              <PlanInput label="領隊聯絡" value={safetyPlan.leaderContact} onChange={(v) => updateSafetyPlan({ leaderContact: v })} />
              <PlanInput label="留守人聯絡" value={safetyPlan.stayBehindContact} onChange={(v) => updateSafetyPlan({ stayBehindContact: v })} />
              <PlanInput label="通聯回報時間" value={safetyPlan.checkInSchedule} onChange={(v) => updateSafetyPlan({ checkInSchedule: v })} />
              <PlanInput label="搜救觸發死線" value={safetyPlan.sarTriggerDeadline} onChange={(v) => updateSafetyPlan({ sarTriggerDeadline: v })} />
            </div>

            <textarea
              rows={3}
              value={safetyPlan.bailoutPlan}
              onChange={(e) => updateSafetyPlan({ bailoutPlan: e.target.value })}
              placeholder="緊急撤退路線 (C-Plan)..."
              className="w-full rounded-xl border border-[#2a323d] bg-[#0d1117] p-3 text-xs text-slate-100"
            />
          </div>
        )}
      </section>
    </div>
  )
}

const MetricCard: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div className="rounded-xl border border-[#2a323d] bg-[#0d1117] p-3">
    <div className="text-[11px] text-slate-400">{label}</div>
    <div className={`mt-1 text-base font-extrabold ${accent}`}>{value}</div>
  </div>
)

const PlanInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({
  label,
  value,
  onChange
}) => (
  <div>
    <label className="mb-1 block text-xs text-slate-400">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[#2a323d] bg-[#0d1117] px-3 py-2 text-xs text-slate-100"
    />
  </div>
)
