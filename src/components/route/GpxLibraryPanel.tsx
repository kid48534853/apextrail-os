import React, { useRef, useState } from 'react'
import { Check, Download, FolderHeart, Pencil, Save, Trash2, Upload } from 'lucide-react'
import { TrackPoint } from '../../core/types/trail'
import { useGpxLibraryStore } from '../../store/use-gpx-library-store'
import { useTrailRecordingStore } from '../../store/use-trail-recording-store'

interface GpxLibraryPanelProps {
  onSelectTrack?: (points: TrackPoint[], trackName: string) => void
}

export const GpxLibraryPanel: React.FC<GpxLibraryPanelProps> = ({ onSelectTrack }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { tracks, activeTrackId, saveTrack, importGpxXml, selectActiveTrack, renameTrack, deleteTrack, exportTrackGpx } = useGpxLibraryStore()
  const recordedPoints = useTrailRecordingStore((s) => s.recordedPoints)

  const [statusMsg, setStatusMsg] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const msgs: string[] = []
    for (const file of Array.from(fileList)) {
      const res = importGpxXml(file.name, await file.text())
      msgs.push(res.message)
      if (res.ok && res.track && onSelectTrack) onSelectTrack(res.track.points, res.track.name)
    }
    setStatusMsg(msgs.join(' ｜ '))
    e.target.value = ''
  }

  const handleSaveCurrentRecorded = () => {
    if (recordedPoints.length < 2) { setStatusMsg('目前沒有足夠的 GPS 錄製軌跡點可保存。'); return }
    const saved = saveTrack(`實測軌跡 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, recordedPoints.map((p) => ({ lat: p.lat, lon: p.lon, ele: p.ele })), 'recorded')
    if (saved) { setStatusMsg(`已保存「${saved.name}」`); if (onSelectTrack) onSelectTrack(saved.points, saved.name) }
  }

  const handleExport = (id: string, name: string) => {
    const gpx = exportTrackGpx(id)
    if (!gpx) return
    const url = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/[\\/:*?"<>|]/g, '_')}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <FolderHeart className="h-4 w-4 text-[#84cc16]" />
          <span>內建 GPX 軌跡庫（已保存 {tracks.length} 條）</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input ref={fileInputRef} type="file" accept=".gpx,application/gpx+xml" multiple onChange={handleFileChange} className="hidden" />
          <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-[#84cc16] px-3 py-1.5 font-bold text-slate-950">
            <Upload className="h-3.5 w-3.5" />匯入多筆 GPX
          </button>
          <button type="button" onClick={handleSaveCurrentRecorded} className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 font-bold text-sky-300">
            <Save className="h-3.5 w-3.5" />存入目前錄製軌跡
          </button>
        </div>
      </div>
      {statusMsg && <p className="text-xs text-sky-400">{statusMsg}</p>}
      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#2a323d] bg-[#0d1117] p-4 text-center text-xs text-slate-400">尚無保存的 GPX 軌跡。</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {tracks.map((track) => {
            const isActive = track.id === activeTrackId
            const isEditing = editingId === track.id
            return (
              <div key={track.id} className={`flex flex-col justify-between gap-2 rounded-xl border p-3 text-xs ${isActive ? 'border-[#84cc16] bg-[#84cc16]/10' : 'border-[#2a323d] bg-[#0d1117]'}`}>
                <div>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { renameTrack(track.id, editingName); setEditingId(null) } }} className="w-full rounded border border-[#84cc16] bg-[#161b22] px-2 py-0.5 text-slate-100" autoFocus />
                      <button type="button" onClick={() => { renameTrack(track.id, editingName); setEditingId(null) }} className="rounded bg-[#84cc16] p-1 text-slate-950"><Check className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-bold text-slate-100">{track.name}</span>
                      <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] text-sky-300">{track.source === 'recorded' ? '實測' : '匯入'}</span>
                    </div>
                  )}
                  <div className="mt-1 flex gap-3 font-mono text-[11px] text-slate-400">
                    <span>{track.distanceKm} km</span><span>+{track.ascentM}m / -{track.descentM}m</span><span>{track.pointCount} 點</span>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[#2a323d]/70 pt-2">
                  <button type="button" onClick={() => { selectActiveTrack(track.id); if (onSelectTrack) onSelectTrack(track.points, track.name) }} className={`rounded-lg px-2.5 py-1 font-bold ${isActive ? 'bg-[#84cc16] text-slate-950' : 'border border-[#2a323d] bg-[#161b22] text-slate-200'}`}>
                    {isActive ? '使用中' : '載入此軌跡'}
                  </button>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => { setEditingId(track.id); setEditingName(track.name) }} className="rounded p-1.5 text-slate-400 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => handleExport(track.id, track.name)} className="rounded p-1.5 text-sky-400"><Download className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => deleteTrack(track.id)} className="rounded p-1.5 text-slate-400 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
