import React, { useState } from 'react'
import { Mountain, Map as MapIcon, Backpack, Monitor, Smartphone } from 'lucide-react'
import { RouteAnalyticsView } from './components/dashboard/RouteAnalyticsView'
import { OfflineTrailMap } from './components/map/OfflineTrailMap'
import { ElevationProfileChart } from './components/charts/ElevationProfileChart'
import { GearAndSafetyModule } from './components/gear/GearAndSafetyModule'
import { CheckpointInput, TrackPoint } from './core/types/trail'

type MainTab = 'route' | 'map' | 'gear'

const DEFAULT_CHECKPOINTS: CheckpointInput[] = [
  { id: 'cp-1', name: 'CP1 登山口補水點', distanceKm: 6.5, hasWater: true },
  { id: 'cp-2', name: 'CP2 稜線避難山屋', distanceKm: 14.2, hasWater: false, isShelter: true }
]

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<MainTab>('route')
  const [isWideMode, setIsWideMode] = useState(false)
  const [tripName, setTripName] = useState('谷關G4')
  const [tripDays, setTripDays] = useState(2)
  const [plannedTrack, setPlannedTrack] = useState<TrackPoint[]>([])

  return (
    <div className="min-h-screen bg-[#0d1117] pb-20 text-slate-100 print:bg-white print:pb-0 print:text-black">
      <header className="sticky top-0 z-30 border-b border-[#2a323d] bg-[#0d1117]/95 backdrop-blur print:hidden">
        <div className={`mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${isWideMode ? 'max-w-7xl' : 'max-w-2xl'}`}>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-[#84cc16]/20 px-2.5 py-1 text-xs font-bold text-[#84cc16]">ApexTrail OS</span>
            <input type="text" value={tripName} onChange={(e) => setTripName(e.target.value)} className="w-32 bg-transparent text-base font-extrabold text-white focus:outline-none" />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5">
              <input type="number" min={1} max={30} value={tripDays} onChange={(e) => setTripDays(Math.max(1, Number(e.target.value) || 1))} className="w-8 bg-transparent text-center font-bold text-[#84cc16]" />
              <span className="text-slate-400">天</span>
            </div>
            <button onClick={() => setIsWideMode((p) => !p)} className="flex items-center gap-1.5 rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 font-semibold">
              {isWideMode ? <><Smartphone className="h-3.5 w-3.5 text-[#84cc16]" /><span>窄版</span></> : <><Monitor className="h-3.5 w-3.5 text-sky-400" /><span>寬版</span></>}
            </button>
          </div>
        </div>
      </header>

      <main className={`mx-auto space-y-4 px-4 py-4 ${isWideMode ? 'max-w-7xl' : 'max-w-2xl'}`}>
        {activeTab === 'route' && (
          <>
            <RouteAnalyticsView onPlannedTrackLoaded={setPlannedTrack} />
            {plannedTrack.length > 1 && <ElevationProfileChart points={plannedTrack} checkpoints={DEFAULT_CHECKPOINTS} />}
          </>
        )}
        {activeTab === 'map' && <OfflineTrailMap plannedTrack={plannedTrack} offRouteThresholdM={40} />}
        {activeTab === 'gear' && <GearAndSafetyModule bodyWeightKg={65} />}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-[#2a323d] bg-[#0d1117]/95 backdrop-blur print:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-3">
          <NavButton active={activeTab === 'route'} onClick={() => setActiveTab('route')} icon={<Mountain className="h-5 w-5" />} label="路線與 EP" />
          <NavButton active={activeTab === 'map'} onClick={() => setActiveTab('map')} icon={<MapIcon className="h-5 w-5" />} label="離線地圖" />
          <NavButton active={activeTab === 'gear'} onClick={() => setActiveTab('gear')} icon={<Backpack className="h-5 w-5" />} label="裝備與計畫書" />
        </div>
      </nav>
    </div>
  )
}

const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-bold ${active ? 'border-t-2 border-[#84cc16] text-[#84cc16]' : 'text-slate-400'}`}>
    {icon}<span>{label}</span>
  </button>
)

export default App
