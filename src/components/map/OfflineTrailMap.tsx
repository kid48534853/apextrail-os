import React, { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { invoke } from '@tauri-apps/api/core'
import {
  AlertTriangle,
  Compass,
  Download,
  Flag,
  Globe,
  MapPin,
  Navigation,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2
} from 'lucide-react'
import { TrackPoint } from '../../core/types/trail'
import {
  GnssFrequencyMode,
  PoiCategory,
  RecordingSampleMode,
  RegionPresetConfig,
  RegionPresetId
} from '../../core/types/trail-recording'
import { haversineDistanceM } from '../../core/algorithms/trail-metrics'
import {
  computeRecordedStats,
  POI_CATEGORY_LABELS,
  useTrailRecordingStore
} from '../../store/use-trail-recording-store'

interface OfflineTrailMapProps {
  plannedTrack: TrackPoint[]
  offRouteThresholdM?: number
}

const REGION_PRESETS: Record<RegionPresetId, RegionPresetConfig> = {
  viewport: {
    id: 'viewport',
    label: '目前地圖視野',
    sourceId: 'rudy',
    tileUrlTemplate: 'https://tile.happyman.idv.tw/map/rudy/{z}/{x}/{y}.png',
    center: [120.99, 24.18],
    zoom: 13
  },
  'taiwan-rudy': {
    id: 'taiwan-rudy',
    label: '全台灣魯地圖 (Taiwan Rudy)',
    sourceId: 'rudy',
    tileUrlTemplate: 'https://tile.happyman.idv.tw/map/rudy/{z}/{x}/{y}.png',
    center: [120.96, 23.65],
    zoom: 7,
    bounds: { minLat: 21.85, maxLat: 25.35, minLon: 119.95, maxLon: 122.05 }
  },
  'japan-osm': {
    id: 'japan-osm',
    label: '日本全境 (Japan OSM)',
    sourceId: 'osm',
    tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    center: [137.5, 36.2],
    zoom: 5,
    bounds: { minLat: 24.0, maxLat: 45.6, minLon: 129.0, maxLon: 146.0 }
  },
  'europe-osm': {
    id: 'europe-osm',
    label: '歐洲區域 (Europe OSM)',
    sourceId: 'osm',
    tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    center: [12.0, 48.5],
    zoom: 4,
    bounds: { minLat: 35.0, maxLat: 66.0, minLon: -10.0, maxLon: 32.0 }
  },
  'americas-osm': {
    id: 'americas-osm',
    label: '美洲區域 (Americas OSM)',
    sourceId: 'osm',
    tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    center: [-98.0, 38.0],
    zoom: 3,
    bounds: { minLat: -35.0, maxLat: 60.0, minLon: -135.0, maxLon: -45.0 }
  },
  'asia-osm': {
    id: 'asia-osm',
    label: '亞洲區域 (Asia OSM)',
    sourceId: 'osm',
    tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    center: [114.0, 28.0],
    zoom: 4,
    bounds: { minLat: 5.0, maxLat: 48.0, minLon: 73.0, maxLon: 145.0 }
  }
}

export const OfflineTrailMap: React.FC<OfflineTrailMapProps> = ({
  plannedTrack,
  offRouteThresholdM = 40
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)
  const poiMarkersRef = useRef<maplibregl.Marker[]>([])

  const {
    isRecording,
    isPaused,
    gnssMode,
    sampleMode,
    recordedPoints,
    pois,
    setGnssMode,
    setSampleMode,
    startRecording,
    togglePauseRecording,
    stopRecording,
    clearRecordedTrack,
    ingestGpsSample,
    addPoi,
    removePoi,
    exportRecordedGpx
  } = useTrailRecordingStore()

  const [regionPresetId, setRegionPresetId] = useState<RegionPresetId>('taiwan-rudy')
  const [minZoom, setMinZoom] = useState<number>(7)
  const [maxZoom, setMaxZoom] = useState<number>(12)
  const [batchCap, setBatchCap] = useState<number>(1500)

  const [isTracking, setIsTracking] = useState(false)
  const [latestPos, setLatestPos] = useState<{ lat: number; lon: number; ele: number } | null>(null)
  const [offRouteDistance, setOffRouteDistance] = useState<number | null>(null)
  const [downloadMsg, setDownloadMsg] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

  const [poiName, setPoiName] = useState('')
  const [poiCategory, setPoiCategory] = useState<PoiCategory>('water')
  const [poiNotes, setPoiNotes] = useState('')

  const activePreset = REGION_PRESETS[regionPresetId]
  const recStats = useMemo(() => computeRecordedStats(recordedPoints), [recordedPoints])

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return

    const map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {
          'offline-topo': {
            type: 'raster',
            tiles: [`offline-tile://localhost/${activePreset.sourceId}/{z}/{x}/{y}.png`],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 16,
            attribution: `${activePreset.label} Offline`
          }
        },
        layers: [
          { id: 'bg-fill', type: 'background', paint: { 'background-color': '#1b222c' } },
          { id: 'topo-layer', type: 'raster', source: 'offline-topo', paint: { 'raster-opacity': 1 } }
        ]
      },
      center: activePreset.center,
      zoom: activePreset.zoom
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [activePreset.sourceId])

  const handleSelectRegionPreset = (nextId: RegionPresetId) => {
    setRegionPresetId(nextId)
    const preset = REGION_PRESETS[nextId]
    if (nextId === 'taiwan-rudy') {
      setMinZoom(7)
      setMaxZoom(12)
    } else if (nextId === 'viewport') {
      setMinZoom(11)
      setMaxZoom(14)
    } else {
      // 洲際或跨國大區域建議先下載 Z4~Z8 總覽，再放大特定縣市下載高縮放層級
      setMinZoom(4)
      setMaxZoom(7)
    }
    const map = mapRef.current
    if (map) {
      map.flyTo({ center: preset.center, zoom: preset.zoom })
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || plannedTrack.length < 2) return

    const renderPlanned = () => {
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: plannedTrack.map((p) => [p.lon, p.lat]) }
      }
      if (map.getSource('planned-route')) {
        ;(map.getSource('planned-route') as maplibregl.GeoJSONSource).setData(geojson)
      } else {
        map.addSource('planned-route', { type: 'geojson', data: geojson })
        map.addLayer({
          id: 'planned-route-line',
          type: 'line',
          source: 'planned-route',
          paint: { 'line-color': '#84cc16', 'line-width': 4, 'line-opacity': 0.9 }
        })
      }
    }

    if (map.isStyleLoaded()) renderPlanned()
    else map.once('load', renderPlanned)
  }, [plannedTrack])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const drawRecorded = () => {
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: recordedPoints.map((p) => [p.lon, p.lat])
        }
      }
      if (map.getSource('recorded-route')) {
        ;(map.getSource('recorded-route') as maplibregl.GeoJSONSource).setData(geojson)
      } else if (recordedPoints.length >= 2) {
        map.addSource('recorded-route', { type: 'geojson', data: geojson })
        map.addLayer({
          id: 'recorded-route-line',
          type: 'line',
          source: 'recorded-route',
          paint: { 'line-color': '#38bdf8', 'line-width': 4, 'line-opacity': 0.95 }
        })
      }
    }
    if (map.isStyleLoaded()) drawRecorded()
    else map.once('load', drawRecorded)
  }, [recordedPoints])

  useEffect(() => {
    const map = mapRef.current
    poiMarkersRef.current.forEach((m) => m.remove())
    poiMarkersRef.current = []
    if (!map) return

    pois.forEach((poi) => {
      const marker = new maplibregl.Marker({ color: '#f59e0b' })
        .setLngLat([poi.lon, poi.lat])
        .setPopup(new maplibregl.Popup().setHTML(`<strong>${poi.name}</strong><br/>${POI_CATEGORY_LABELS[poi.category]}`))
        .addTo(map)
      poiMarkersRef.current.push(marker)
    })
  }, [pois])

  useEffect(() => {
    if (!isTracking || !navigator.geolocation) return

    const gpsOptions: PositionOptions =
      gnssMode === 'high-precision-dual'
        ? { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
        : gnssMode === 'power-saving'
          ? { enableHighAccuracy: false, maximumAge: 10000, timeout: 15000 }
          : { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, altitude, accuracy } = pos.coords
        const ele = Number.isFinite(altitude) && altitude !== null ? altitude : 0
        setLatestPos({ lat: latitude, lon: longitude, ele })

        const map = mapRef.current
        if (map) {
          if (!userMarkerRef.current) {
            userMarkerRef.current = new maplibregl.Marker({ color: '#38bdf8' })
              .setLngLat([longitude, latitude])
              .addTo(map)
          } else {
            userMarkerRef.current.setLngLat([longitude, latitude])
          }
        }

        ingestGpsSample({
          lat: latitude,
          lon: longitude,
          ele,
          timestampMs: pos.timestamp || Date.now(),
          accuracyM: accuracy
        })

        if (plannedTrack.length > 0) {
          let minDist = Infinity
          for (const pt of plannedTrack) {
            const d = haversineDistanceM(latitude, longitude, pt.lat, pt.lon)
            if (d < minDist) minDist = d
          }
          setOffRouteDistance(minDist > offRouteThresholdM ? Math.round(minDist) : null)
        }
      },
      (err) => setDownloadMsg(`GPS 定位錯誤：${err.message}`),
      gpsOptions
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [isTracking, gnssMode, plannedTrack, offRouteThresholdM, ingestGpsSample])

  const handleDownloadRegion = async () => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    const targetBounds = activePreset.bounds ?? {
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLon: bounds.getWest(),
      maxLon: bounds.getEast()
    }

    const lowZ = Math.min(minZoom, maxZoom)
    const highZ = Math.max(minZoom, maxZoom)

    setIsDownloading(true)
    setDownloadMsg(
      `正在下載「${activePreset.label}」離線圖資 (Z${lowZ}~Z${highZ}，單批上限 ${batchCap} 張)...`
    )

    try {
      const res = await invoke<{
        total_tiles: number
        downloaded: number
        skipped_cached: number
        failed: number
        remaining_in_bounds: number
      }>('download_offline_region', {
        payload: {
          source_id: activePreset.sourceId,
          tile_url_template: activePreset.tileUrlTemplate,
          min_lat: targetBounds.minLat,
          max_lat: targetBounds.maxLat,
          min_lon: targetBounds.minLon,
          max_lon: targetBounds.maxLon,
          min_zoom: lowZ,
          max_zoom: highZ,
          max_tiles: batchCap
        }
      })

      const remainHint =
        res.remaining_in_bounds > 0
          ? `；尚有約 ${res.remaining_in_bounds} 張未抓，可再按一次「下載選定區域」續傳`
          : '；此區域所選層級已全部快取完成'

      setDownloadMsg(
        `新下載 ${res.downloaded} 張、已快取 ${res.skipped_cached} 張、失敗 ${res.failed} 張${remainHint}`
      )

      const src = map.getSource('offline-topo') as maplibregl.RasterTileSource | undefined
      if (src) {
        src.setTiles([`offline-tile://localhost/${activePreset.sourceId}/{z}/{x}/{y}.png?t=${Date.now()}`])
      }
      map.triggerRepaint()
    } catch (err) {
      setDownloadMsg(`下載失敗：${String(err)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleReloadTiles = () => {
    const map = mapRef.current
    if (!map) return
    map.resize()
    const src = map.getSource('offline-topo') as maplibregl.RasterTileSource | undefined
    if (src) {
      src.setTiles([`offline-tile://localhost/${activePreset.sourceId}/{z}/{x}/{y}.png?t=${Date.now()}`])
      map.triggerRepaint()
      setDownloadMsg('已重新載入本地離線圖資快取')
    }
  }

  const handleAddPoiAtTarget = (e: React.FormEvent) => {
    e.preventDefault()
    const center = mapRef.current?.getCenter()
    const targetLat = latestPos?.lat ?? center?.lat ?? 24.18
    const targetLon = latestPos?.lon ?? center?.lng ?? 120.99
    const targetEle = latestPos?.ele ?? 0

    addPoi({
      name: poiName.trim() || `${POI_CATEGORY_LABELS[poiCategory]} #${pois.length + 1}`,
      category: poiCategory,
      lat: targetLat,
      lon: targetLon,
      ele: targetEle,
      notes: poiNotes.trim()
    })
    setPoiName('')
    setPoiNotes('')
  }

  const handleExportGpx = () => {
    const gpx = exportRecordedGpx()
    const blob = new Blob([gpx], { type: 'application/gpx+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `apextrail-track-${new Date().toISOString().slice(0, 10)}.gpx`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Compass className="h-4 w-4 text-[#84cc16]" />
          <span>離線等高線地圖、區域批次下載與 GPS 軌跡</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleReloadTiles}
            className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-bold text-slate-200"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新圖磚
          </button>
          <button
            type="button"
            onClick={() => setIsTracking((prev) => !prev)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
              isTracking ? 'bg-sky-500 text-slate-950' : 'border border-[#2a323d] bg-[#1f2630] text-slate-200'
            }`}
          >
            <Navigation className="h-3.5 w-3.5" />
            {isTracking ? 'GPS 定位中' : '開啟 GPS 定位'}
          </button>
        </div>
      </div>

      {/* 區域離線地圖批次下載列（全台灣魯地圖 / 日本 / 歐洲 / 美洲 / 亞洲） */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#84cc16]/30 bg-[#0d1117] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 font-bold text-[#a3e635]">
            <Globe className="h-3.5 w-3.5" />
            區域圖資：
          </span>
          <select
            value={regionPresetId}
            onChange={(e) => handleSelectRegionPreset(e.target.value as RegionPresetId)}
            aria-label="選擇離線地圖區域"
            className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 font-semibold text-white"
          >
            {Object.values(REGION_PRESETS).map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1 text-slate-300">
            <span>最小 Z</span>
            <input
              type="number"
              min={2}
              max={15}
              value={minZoom}
              onChange={(e) => setMinZoom(Number(e.target.value) || 7)}
              className="w-12 rounded-lg border border-[#2a323d] bg-[#161b22] px-1.5 py-1 text-center font-mono text-white"
            />
          </label>

          <label className="flex items-center gap-1 text-slate-300">
            <span>最大 Z</span>
            <input
              type="number"
              min={2}
              max={16}
              value={maxZoom}
              onChange={(e) => setMaxZoom(Number(e.target.value) || 12)}
              className="w-12 rounded-lg border border-[#2a323d] bg-[#161b22] px-1.5 py-1 text-center font-mono text-white"
            />
          </label>

          <label className="flex items-center gap-1 text-slate-300">
            <span>單批上限</span>
            <select
              value={batchCap}
              onChange={(e) => setBatchCap(Number(e.target.value))}
              aria-label="單批下載張數上限"
              className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2 py-1 font-mono text-white"
            >
              <option value={500}>500 張</option>
              <option value={1500}>1500 張</option>
              <option value={3000}>3000 張</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={handleDownloadRegion}
          disabled={isDownloading}
          className="flex items-center gap-1.5 rounded-lg bg-[#84cc16] px-3.5 py-1.5 font-bold text-slate-950 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          {isDownloading ? '批次下載中...' : '下載選定區域'}
        </button>
      </div>

      {/* GPS 軌跡記錄控制列 */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2a323d] bg-[#0d1117] p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={gnssMode}
            onChange={(e) => setGnssMode(e.target.value as GnssFrequencyMode)}
            aria-label="多頻定位模式"
            className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 font-semibold text-slate-200"
          >
            <option value="high-precision-dual">精準多頻 (Dual-Band L1+L5)</option>
            <option value="standard-multi">標準多頻 (Multi-GNSS)</option>
            <option value="power-saving">省電定位 (Low-Power)</option>
          </select>

          <select
            value={sampleMode}
            onChange={(e) => setSampleMode(e.target.value as RecordingSampleMode)}
            aria-label="紀錄取樣模式"
            className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 font-semibold text-[#a3e635]"
          >
            <option value="smart">智慧紀錄（位移/轉向動態濾波）</option>
            <option value="every-second">每秒紀錄（1s 連續取樣）</option>
          </select>

          {!isRecording ? (
            <button
              type="button"
              onClick={() => {
                setIsTracking(true)
                startRecording()
              }}
              className="flex items-center gap-1 rounded-lg bg-[#84cc16] px-3 py-1.5 font-bold text-slate-950"
            >
              <Play className="h-3.5 w-3.5" />
              開始錄製軌跡
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={togglePauseRecording}
                className="flex items-center gap-1 rounded-lg bg-amber-400 px-2.5 py-1.5 font-bold text-slate-950"
              >
                <Pause className="h-3.5 w-3.5" />
                {isPaused ? '繼續錄製' : '暫停'}
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="flex items-center gap-1 rounded-lg bg-rose-500 px-2.5 py-1.5 font-bold text-white"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </button>
            </>
          )}

          {recordedPoints.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportGpx}
                className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 font-semibold text-sky-300"
              >
                匯出 GPX
              </button>
              <button
                type="button"
                onClick={clearRecordedTrack}
                className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 text-slate-400 hover:text-rose-400"
              >
                清除軌跡
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300">
          <span>點數：{recStats.pointCount}</span>
          <span>距離：{recStats.distanceKm} km</span>
          <span>爬升：+{recStats.ascentM} m</span>
        </div>
      </div>

      {/* 標記興趣點 (POI) 區塊 */}
      <div className="space-y-2 rounded-xl border border-[#2a323d] bg-[#0d1117] p-3 text-xs">
        <form onSubmit={handleAddPoiAtTarget} className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 font-bold text-amber-300">
            <Flag className="h-3.5 w-3.5" />
            標記興趣點：
          </span>
          <select
            value={poiCategory}
            onChange={(e) => setPoiCategory(e.target.value as PoiCategory)}
            aria-label="興趣點類型"
            className="rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 text-slate-200"
          >
            {Object.entries(POI_CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="興趣點名稱（如：嘉明湖避難山屋、活水源）"
            value={poiName}
            onChange={(e) => setPoiName(e.target.value)}
            className="min-w-[180px] flex-1 rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 text-slate-100"
          />
          <input
            type="text"
            placeholder="備註（選填）"
            value={poiNotes}
            onChange={(e) => setPoiNotes(e.target.value)}
            className="w-40 rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1.5 text-slate-100"
          />
          <button
            type="submit"
            className="flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-slate-950"
          >
            <MapPin className="h-3.5 w-3.5" />
            新增 POI
          </button>
        </form>

        {pois.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {pois.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-[#161b22] px-2.5 py-1 text-[11px]"
              >
                <span className="font-bold text-amber-300">[{POI_CATEGORY_LABELS[p.category]}]</span>
                <span className="font-semibold text-white">{p.name}</span>
                <span className="font-mono text-slate-400">
                  ({p.lat.toFixed(4)}, {p.lon.toFixed(4)})
                </span>
                <button
                  type="button"
                  onClick={() => removePoi(p.id)}
                  aria-label="刪除興趣點"
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {offRouteDistance !== null && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-950/60 px-3 py-2 text-xs font-semibold text-red-200">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span>偏離預定軌跡警報：目前距離路線約 {offRouteDistance} 公尺！</span>
        </div>
      )}

      <div ref={mapContainerRef} className="h-[460px] w-full overflow-hidden rounded-xl border border-[#2a323d]" />
      {downloadMsg && <p className="text-xs text-sky-400">{downloadMsg}</p>}
    </div>
  )
}
