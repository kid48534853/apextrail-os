import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { invoke } from '@tauri-apps/api/core'
import { Compass, Download, AlertTriangle, Navigation, RefreshCw } from 'lucide-react'
import { TrackPoint } from '../../core/types/trail'
import { haversineDistanceM } from '../../core/algorithms/trail-metrics'

interface OfflineTrailMapProps {
  plannedTrack: TrackPoint[]
  offRouteThresholdM?: number
}

type TileSourceKey = 'rudy' | 'osm'

const TILE_SOURCES: Record<TileSourceKey, { label: string; url: string }> = {
  rudy: {
    label: '魯地圖 Rudy Map',
    url: 'https://tile.happyman.idv.tw/map/rudy/{z}/{x}/{y}.png'
  },
  osm: {
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  }
}

export const OfflineTrailMap: React.FC<OfflineTrailMapProps> = ({
  plannedTrack,
  offRouteThresholdM = 40
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const userMarkerRef = useRef<maplibregl.Marker | null>(null)

  const [sourceKey, setSourceKey] = useState<TileSourceKey>('rudy')
  const [isTracking, setIsTracking] = useState(false)
  const [offRouteDistance, setOffRouteDistance] = useState<number | null>(null)
  const [downloadMsg, setDownloadMsg] = useState('')
  const [isDownloading, setIsDownloading] = useState(false)

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
            tiles: [`offline-tile://localhost/${sourceKey}/{z}/{x}/{y}.png`],
            tileSize: 256,
            minzoom: 0,
            maxzoom: 17,
            attribution: `${TILE_SOURCES[sourceKey].label} Offline`
          }
        },
        layers: [
          {
            id: 'bg-fill',
            type: 'background',
            paint: { 'background-color': '#1b222c' }
          },
          {
            id: 'topo-layer',
            type: 'raster',
            source: 'offline-topo',
            paint: { 'raster-opacity': 1 }
          }
        ]
      },
      center: [120.99, 24.18],
      zoom: 13
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    const resizeObserver = new ResizeObserver(() => {
      map.resize()
    })
    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [sourceKey])

  useEffect(() => {
    const map = mapRef.current
    if (!map || plannedTrack.length < 2) return

    const renderTrack = () => {
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
          paint: { 'line-color': '#84cc16', 'line-width': 4, 'line-opacity': 0.95 }
        })
      }
      const bounds = new maplibregl.LngLatBounds()
      plannedTrack.forEach((p) => bounds.extend([p.lon, p.lat]))
      map.fitBounds(bounds, { padding: 48, maxZoom: 15 })
    }

    if (map.isStyleLoaded()) renderTrack()
    else map.once('load', renderTrack)
  }, [plannedTrack])

  useEffect(() => {
    if (!isTracking || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const map = mapRef.current
        if (!map) return
        if (!userMarkerRef.current) {
          userMarkerRef.current = new maplibregl.Marker({ color: '#38bdf8' })
            .setLngLat([longitude, latitude])
            .addTo(map)
        } else {
          userMarkerRef.current.setLngLat([longitude, latitude])
        }
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
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [isTracking, plannedTrack, offRouteThresholdM])

  const handleDownloadViewport = async () => {
    const map = mapRef.current
    if (!map) return
    const bounds = map.getBounds()
    const currentZoom = Math.min(16, Math.max(12, Math.round(map.getZoom())))
    setIsDownloading(true)
    setDownloadMsg(`正在下載 ${TILE_SOURCES[sourceKey].label} 離線圖資 (Z${currentZoom - 1}~Z${currentZoom})...`)
    try {
      const res = await invoke<{
        total_tiles: number
        downloaded: number
        skipped_cached: number
        failed: number
      }>('download_offline_region', {
        payload: {
          source_id: sourceKey,
          tile_url_template: TILE_SOURCES[sourceKey].url,
          min_lat: bounds.getSouth(),
          max_lat: bounds.getNorth(),
          min_lon: bounds.getWest(),
          max_lon: bounds.getEast(),
          min_zoom: Math.max(11, currentZoom - 1),
          max_zoom: currentZoom
        }
      })
      setDownloadMsg(
        `離線圖資完成：新下載 ${res.downloaded} 張、已快取 ${res.skipped_cached} 張、失敗 ${res.failed} 張（共 ${res.total_tiles} 張）`
      )
      const src = map.getSource('offline-topo') as maplibregl.RasterTileSource | undefined
      if (src) src.setTiles([`offline-tile://localhost/${sourceKey}/{z}/{x}/{y}.png?t=${Date.now()}`])
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
      src.setTiles([`offline-tile://localhost/${sourceKey}/{z}/{x}/{y}.png?t=${Date.now()}`])
      map.triggerRepaint()
      setDownloadMsg('已重新載入本地離線圖資快取')
    }
  }

  return (
    <div className="relative flex flex-col gap-3 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Compass className="h-4 w-4 text-[#84cc16]" />
          <span>離線等高線地圖與 GPS 即時導航</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sourceKey}
            onChange={(e) => setSourceKey(e.target.value as TileSourceKey)}
            aria-label="選擇地圖來源"
            className="rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-bold text-slate-200"
          >
            <option value="rudy">魯地圖 Rudy Map</option>
            <option value="osm">OpenStreetMap</option>
          </select>
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
          <button
            type="button"
            onClick={handleDownloadViewport}
            disabled={isDownloading}
            className="flex items-center gap-1.5 rounded-lg bg-[#84cc16] px-3 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {isDownloading ? '下載中...' : '下載此區離線地圖'}
          </button>
        </div>
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
