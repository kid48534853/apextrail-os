import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import {
  AlertTriangle,
  Box,
  Compass,
  Download,
  Flag,
  Globe,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  Navigation,
  Navigation2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
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

interface GpsFix {
  lat: number
  lon: number
  ele: number
}

interface PointerPos {
  x: number
  y: number
}

interface DragSnapshot {
  dragging: boolean
  startX: number
  startY: number
  origLon: number
  origLat: number
}

const TERRAIN_SOURCE_ID = 'terrain-topo'
const TERRAIN_TILE_URL = 'https://tile.opentopomap.org/{z}/{x}/{y}.png'

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
    zoom: 9,
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

function latLonToMercator(lat: number, lon: number, z: number): { mx: number; my: number } {
  const n = Math.pow(2, z)
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat))
  const latRad = (clampedLat * Math.PI) / 180
  const mx = ((lon + 180) / 360) * n
  const my = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { mx, my }
}

function mercatorToLatLon(mx: number, my: number, z: number): { lat: number; lon: number } {
  const n = Math.pow(2, z)
  const lon = (mx / n) * 360 - 180
  const mercN = Math.PI * (1 - (2 * my) / n)
  const lat = (Math.atan(Math.sinh(mercN)) * 180) / Math.PI
  return { lat, lon }
}

function computeBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dLon) * Math.cos(p2)
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export const OfflineTrailMap: React.FC<OfflineTrailMapProps> = ({
  plannedTrack,
  offRouteThresholdM = 40
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const loadedImgsRef = useRef<Record<string, HTMLImageElement>>({})
  const inflightKeysRef = useRef<Record<string, boolean>>({})
  const debounceTimerRef = useRef<number | null>(null)
  const prevGpsRef = useRef<GpsFix | null>(null)

  // 多點觸控（雙指縮放）與單指拖曳狀態
  const activePointersRef = useRef<Record<number, PointerPos>>({})
  const pinchPrevDistRef = useRef<number | null>(null)
  const dragRef = useRef<DragSnapshot>({
    dragging: false,
    startX: 0,
    startY: 0,
    origLon: 120.96,
    origLat: 23.65
  })

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
  const [minZoom, setMinZoom] = useState<number>(9)
  const [maxZoom, setMaxZoom] = useState<number>(13)
  const [batchCap, setBatchCap] = useState<number>(1500)
  const [includeTerrainDownload, setIncludeTerrainDownload] = useState<boolean>(true)

  const [centerLon, setCenterLon] = useState<number>(120.96)
  const [centerLat, setCenterLat] = useState<number>(23.65)
  const [zoomLevel, setZoomLevel] = useState<number>(9)

  // 新增：全螢幕、前進方向朝上、高畫質過採樣、3D 透視角、地形渲染疊加
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false)
  const [isHeadingUp, setIsHeadingUp] = useState<boolean>(false)
  const [headingDeg, setHeadingDeg] = useState<number>(0)
  const [isHighClarity, setIsHighClarity] = useState<boolean>(true)
  const [is3dTilt, setIs3dTilt] = useState<boolean>(false)
  const [showTerrainOverlay, setShowTerrainOverlay] = useState<boolean>(false)

  const [isTracking, setIsTracking] = useState<boolean>(false)
  const [latestPos, setLatestPos] = useState<GpsFix | null>(null)
  const [offRouteDistance, setOffRouteDistance] = useState<number | null>(null)
  const [downloadMsg, setDownloadMsg] = useState<string>('')
  const [isDownloading, setIsDownloading] = useState<boolean>(false)

  const [poiName, setPoiName] = useState<string>('')
  const [poiCategory, setPoiCategory] = useState<PoiCategory>('water')
  const [poiNotes, setPoiNotes] = useState<string>('')

  const activePreset = REGION_PRESETS[regionPresetId]
  const recStats = useMemo(() => computeRecordedStats(recordedPoints), [recordedPoints])

  const renderMapCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return

    const width = wrapper.clientWidth
    const height = wrapper.clientHeight
    if (width <= 0 || height <= 0) return

    // 解放高 DPI（最高 3x）確保 Android 手機全螢幕銳利度
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const targetW = Math.floor(width * dpr)
    const targetH = Math.floor(height * dpr)
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW
      canvas.height = targetH
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#18202a'
    ctx.fillRect(0, 0, width, height)

    // 若啟用「前進方向朝上」，以畫面中心為軸旋轉地圖
    if (isHeadingUp && headingDeg !== 0) {
      ctx.translate(width / 2, height / 2)
      ctx.rotate((-headingDeg * Math.PI) / 180)
      ctx.translate(-width / 2, -height / 2)
    }

    // HD 過採樣模式：抓取高一階 Z+1 圖磚（最高 Z16），大幅提升等高線與文字清晰度
    const baseZ = Math.min(16, Math.max(2, Math.round(zoomLevel)))
    const fetchZ = isHighClarity ? Math.min(16, baseZ + 1) : baseZ
    const scale = Math.pow(2, zoomLevel - fetchZ)
    const tilePx = 256 * scale
    const maxTileIdx = Math.pow(2, fetchZ)

    const centerMerc = latLonToMercator(centerLat, centerLon, fetchZ)
    const centerX = Math.floor(centerMerc.mx)
    const centerY = Math.floor(centerMerc.my)

    // 旋轉或 3D 傾角時擴大預載範圍，避免邊角出現黑邊
    const padTiles = isHeadingUp || is3dTilt ? 2 : 1
    const halfCols = Math.ceil(width / tilePx / 2) + padTiles
    const halfRows = Math.ceil(height / tilePx / 2) + padTiles

    const missingTiles: Array<{
      key: string
      sourceId: string
      tpl: string
      z: number
      x: number
      y: number
    }> = []

    const drawLayerTiles = (sourceId: string, tpl: string, alpha: number) => {
      ctx.globalAlpha = alpha
      for (let dx = -halfCols; dx <= halfCols; dx += 1) {
        for (let dy = -halfRows; dy <= halfRows; dy += 1) {
          const tx = (((centerX + dx) % maxTileIdx) + maxTileIdx) % maxTileIdx
          const ty = centerY + dy
          if (ty < 0 || ty >= maxTileIdx) continue

          const leftPx = width / 2 + (centerX + dx - centerMerc.mx) * tilePx
          const topPx = height / 2 + (ty - centerMerc.my) * tilePx
          const key = `${sourceId}/${fetchZ}/${tx}/${ty}`

          const img = loadedImgsRef.current[key]
          if (img && img.complete && img.naturalWidth > 0) {
            ctx.drawImage(img, leftPx, topPx, tilePx + 0.6, tilePx + 0.6)
          } else {
            if (alpha === 1) {
              ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)'
              ctx.strokeRect(leftPx, topPx, tilePx, tilePx)
            }
            if (!inflightKeysRef.current[key]) {
              missingTiles.push({ key, sourceId, tpl, z: fetchZ, x: tx, y: ty })
            }
          }
        }
      }
      ctx.globalAlpha = 1
    }

    // 繪製主底圖（魯地圖或 OSM）
    drawLayerTiles(activePreset.sourceId, activePreset.tileUrlTemplate, 1)

    // 若啟用地形渲染疊加，以 38% 透明度疊合地形陰影圖層
    if (showTerrainOverlay) {
      drawLayerTiles(TERRAIN_SOURCE_ID, TERRAIN_TILE_URL, 0.38)
    }

    const toScreen = (lat: number, lon: number) => {
      const m = latLonToMercator(lat, lon, fetchZ)
      return {
        x: width / 2 + (m.mx - centerMerc.mx) * tilePx,
        y: height / 2 + (m.my - centerMerc.my) * tilePx
      }
    }

    if (plannedTrack.length >= 2) {
      ctx.beginPath()
      plannedTrack.forEach((pt, idx) => {
        const p = toScreen(pt.lat, pt.lon)
        if (idx === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.strokeStyle = '#84cc16'
      ctx.lineWidth = 3.5
      ctx.stroke()
    }

    if (recordedPoints.length >= 2) {
      ctx.beginPath()
      recordedPoints.forEach((pt, idx) => {
        const p = toScreen(pt.lat, pt.lon)
        if (idx === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 4
      ctx.stroke()
    }

    pois.forEach((poi) => {
      const p = toScreen(poi.lat, poi.lon)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#0f172a'
      ctx.stroke()

      ctx.font = 'bold 11px sans-serif'
      ctx.fillStyle = '#fef3c7'
      ctx.fillText(poi.name, p.x + 9, p.y + 4)
    })

    // 繪製使用者目前位置：實心等腰三角形（尖端指向前進方向）
    if (latestPos) {
      const u = toScreen(latestPos.lat, latestPos.lon)
      ctx.save()
      ctx.translate(u.x, u.y)
      ctx.rotate((headingDeg * Math.PI) / 180)

      // 外圍半透明定位光圈
      ctx.beginPath()
      ctx.arc(0, 0, 18, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(56, 189, 248, 0.22)'
      ctx.fill()

      // 實心三角形本體（尖端朝前進方向 0,-15）
      ctx.beginPath()
      ctx.moveTo(0, -15)
      ctx.lineTo(10, 10)
      ctx.lineTo(-10, 10)
      ctx.closePath()
      ctx.fillStyle = '#38bdf8'
      ctx.fill()
      ctx.lineWidth = 2.5
      ctx.strokeStyle = '#ffffff'
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()

    if (missingTiles.length > 0) {
      missingTiles.forEach((item) => {
        inflightKeysRef.current[item.key] = true
      })
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = window.setTimeout(() => {
        void Promise.all(
          missingTiles.slice(0, 32).map(async (item) => {
            try {
              const dataUrl = await invoke<string>('get_tile_data_url', {
                sourceId: item.sourceId,
                z: item.z,
                x: item.x,
                y: item.y,
                tileUrlTemplate: item.tpl
              })
              const tileImg = new Image()
              tileImg.onload = () => {
                loadedImgsRef.current[item.key] = tileImg
                delete inflightKeysRef.current[item.key]
                renderMapCanvas()
              }
              tileImg.onerror = () => {
                delete inflightKeysRef.current[item.key]
              }
              tileImg.src = dataUrl
            } catch {
              delete inflightKeysRef.current[item.key]
            }
          })
        )
      }, 35)
    }
  }, [
    centerLat,
    centerLon,
    zoomLevel,
    isHeadingUp,
    headingDeg,
    isHighClarity,
    is3dTilt,
    showTerrainOverlay,
    activePreset.sourceId,
    activePreset.tileUrlTemplate,
    plannedTrack,
    recordedPoints,
    pois,
    latestPos
  ])

  useEffect(() => {
    renderMapCanvas()
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const ro = new ResizeObserver(() => renderMapCanvas())
    ro.observe(wrapper)
    return () => {
      ro.disconnect()
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    }
  }, [renderMapCanvas, isFullScreen])

  useEffect(() => {
    if (plannedTrack.length >= 2) {
      setCenterLat(plannedTrack[0].lat)
      setCenterLon(plannedTrack[0].lon)
      setZoomLevel(13)
    }
  }, [plannedTrack])

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
        const { latitude, longitude, altitude, accuracy, heading } = pos.coords
        const ele = Number.isFinite(altitude) && altitude !== null ? altitude : 0
        const currentFix: GpsFix = { lat: latitude, lon: longitude, ele }

        // 優先採用 GNSS 感測器航向；若無則依前後移動點（> 3m）計算前進方向
        if (heading !== null && Number.isFinite(heading) && heading >= 0) {
          setHeadingDeg(heading)
        } else if (prevGpsRef.current) {
          const movedM = haversineDistanceM(
            prevGpsRef.current.lat,
            prevGpsRef.current.lon,
            latitude,
            longitude
          )
          if (movedM >= 3) {
            setHeadingDeg(
              computeBearingDeg(prevGpsRef.current.lat, prevGpsRef.current.lon, latitude, longitude)
            )
          }
        }
        prevGpsRef.current = currentFix

        setLatestPos(currentFix)
        setCenterLat(latitude)
        setCenterLon(longitude)

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
      (err) => {
        setIsTracking(false)
        if (err.code === 1) {
          setDownloadMsg(
            '定位權限被拒（User denied Geolocation）：請至手機「設定 > 應用程式 > ApexTrail OS > 權限」開啟位置權限。'
          )
        } else {
          setDownloadMsg(`GPS 定位錯誤：${err.message}`)
        }
      },
      gpsOptions
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [isTracking, gnssMode, plannedTrack, offRouteThresholdM, ingestGpsSample])

  // 支援單指拖曳 + 雙指捏合放大縮小（Pinch-to-Zoom）
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY }
    const ids = Object.keys(activePointersRef.current)

    if (ids.length === 1) {
      dragRef.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        origLon: centerLon,
        origLat: centerLat
      }
      pinchPrevDistRef.current = null
    } else if (ids.length === 2) {
      dragRef.current.dragging = false
      const p1 = activePointersRef.current[Number(ids[0])]
      const p2 = activePointersRef.current[Number(ids[1])]
      pinchPrevDistRef.current = Math.hypot(p1.x - p2.x, p1.y - p2.y)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointersRef.current[e.pointerId]) return
    activePointersRef.current[e.pointerId] = { x: e.clientX, y: e.clientY }
    const ids = Object.keys(activePointersRef.current)

    if (ids.length === 2) {
      const p1 = activePointersRef.current[Number(ids[0])]
      const p2 = activePointersRef.current[Number(ids[1])]
      const currDist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
      if (pinchPrevDistRef.current && pinchPrevDistRef.current > 10 && currDist > 10) {
        const deltaZoom = Math.log2(currDist / pinchPrevDistRef.current)
        setZoomLevel((prev) => Math.min(16, Math.max(2, Number((prev + deltaZoom).toFixed(3)))))
      }
      pinchPrevDistRef.current = currDist
      return
    }

    if (!dragRef.current.dragging) return
    const rawDx = e.clientX - dragRef.current.startX
    const rawDy = e.clientY - dragRef.current.startY

    // 若開啟前進方向朝上，將拖曳向量依航向反向旋轉，讓滑動方向符合直覺
    const rad = isHeadingUp ? (headingDeg * Math.PI) / 180 : 0
    const dx = rawDx * Math.cos(rad) - rawDy * Math.sin(rad)
    const dy = rawDx * Math.sin(rad) + rawDy * Math.cos(rad)

    const z = Math.round(zoomLevel)
    const worldPx = 256 * Math.pow(2, zoomLevel)
    const origMerc = latLonToMercator(dragRef.current.origLat, dragRef.current.origLon, z)
    const scaleToZ = Math.pow(2, z - zoomLevel)
    const nextMx = origMerc.mx - (dx / worldPx) * Math.pow(2, zoomLevel) * scaleToZ
    const nextMy = origMerc.my - (dy / worldPx) * Math.pow(2, zoomLevel) * scaleToZ
    const nextLl = mercatorToLatLon(nextMx, nextMy, z)
    setCenterLon(nextLl.lon)
    setCenterLat(nextLl.lat)
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    delete activePointersRef.current[e.pointerId]
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    const ids = Object.keys(activePointersRef.current)
    if (ids.length < 2) {
      pinchPrevDistRef.current = null
    }
    if (ids.length === 0) {
      dragRef.current.dragging = false
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.5 : -0.5
    setZoomLevel((prev) => Math.min(16, Math.max(2, Number((prev + delta).toFixed(2)))))
  }

  const resetTileMemory = () => {
    loadedImgsRef.current = {}
    inflightKeysRef.current = {}
  }

  const handleSelectRegionPreset = (nextId: RegionPresetId) => {
    setRegionPresetId(nextId)
    resetTileMemory()
    const preset = REGION_PRESETS[nextId]
    setCenterLon(preset.center[0])
    setCenterLat(preset.center[1])
    setZoomLevel(preset.zoom)
    if (nextId === 'taiwan-rudy') {
      setMinZoom(9)
      setMaxZoom(13)
    } else if (nextId === 'viewport') {
      setMinZoom(11)
      setMaxZoom(14)
    } else {
      setMinZoom(4)
      setMaxZoom(7)
    }
  }

  const handleDownloadRegion = async () => {
    const lowZ = Math.min(minZoom, maxZoom)
    const highZ = Math.max(minZoom, maxZoom)
    const targetBounds = activePreset.bounds ?? {
      minLat: centerLat - 0.12,
      maxLat: centerLat + 0.12,
      minLon: centerLon - 0.15,
      maxLon: centerLon + 0.15
    }

    setIsDownloading(true)
    setDownloadMsg(
      `正在下載「${activePreset.label}」${includeTerrainDownload ? '+ 3D 地形渲染圖層' : ''} (Z${lowZ}~Z${highZ})...`
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

      let terrainSummary = ''
      if (includeTerrainDownload) {
        const terrainRes = await invoke<{
          downloaded: number
          skipped_cached: number
          failed: number
        }>('download_offline_region', {
          payload: {
            source_id: TERRAIN_SOURCE_ID,
            tile_url_template: TERRAIN_TILE_URL,
            min_lat: targetBounds.minLat,
            max_lat: targetBounds.maxLat,
            min_lon: targetBounds.minLon,
            max_lon: targetBounds.maxLon,
            min_zoom: lowZ,
            max_zoom: Math.min(highZ, 15),
            max_tiles: Math.min(batchCap, 1000)
          }
        })
        terrainSummary = ` ｜ 地形渲染：新下載 ${terrainRes.downloaded} 張、已快取 ${terrainRes.skipped_cached} 張`
      }

      const remainHint =
        res.remaining_in_bounds > 0
          ? `；尚有約 ${res.remaining_in_bounds} 張未抓，可再按一次續傳`
          : '；所選層級已全部快取完成'

      setDownloadMsg(
        `主圖資新下載 ${res.downloaded} 張、已快取 ${res.skipped_cached} 張、失敗 ${res.failed} 張${terrainSummary}${remainHint}`
      )

      resetTileMemory()
      renderMapCanvas()
    } catch (err) {
      setDownloadMsg(`下載失敗：${String(err)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const handleReloadTiles = () => {
    resetTileMemory()
    renderMapCanvas()
    setDownloadMsg('已重新載入本地離線圖資快取')
  }

  const handleAddPoiAtTarget = (e: React.FormEvent) => {
    e.preventDefault()
    const targetLat = latestPos?.lat ?? centerLat
    const targetLon = latestPos?.lon ?? centerLon
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

  const mapUi = (
    <div
      className={
        isFullScreen
          ? 'fixed inset-0 z-[9999] flex h-[100dvh] w-[100vw] flex-col bg-[#0d1117]'
          : 'relative flex flex-col gap-3 rounded-2xl border border-[#2a323d] bg-[#161b22] p-4'
      }
    >
      {!isFullScreen && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Compass className="h-4 w-4 text-[#84cc16]" />
              <span>離線高清地圖、3D 地形渲染與 GPS 軌跡</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsFullScreen(true)}
                className="flex items-center gap-1 rounded-lg bg-[#84cc16] px-2.5 py-1.5 text-xs font-bold text-slate-950"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                全螢幕地圖
              </button>
              <button
                type="button"
                onClick={handleReloadTiles}
                className="flex items-center gap-1 rounded-lg border border-[#2a323d] bg-[#1f2630] px-2.5 py-1.5 text-xs font-bold text-slate-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
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
                  onChange={(e) => setMinZoom(Number(e.target.value) || 9)}
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
                  onChange={(e) => setMaxZoom(Number(e.target.value) || 13)}
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

              <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#2a323d] bg-[#161b22] px-2.5 py-1 text-slate-200">
                <input
                  type="checkbox"
                  checked={includeTerrainDownload}
                  onChange={(e) => setIncludeTerrainDownload(e.target.checked)}
                  className="accent-[#84cc16]"
                />
                <span>含 3D 地形渲染下載</span>
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
        </>
      )}

      {offRouteDistance !== null && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-950/80 px-3 py-2 text-xs font-semibold text-red-200">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <span>偏離預定軌跡警報：目前距離路線約 {offRouteDistance} 公尺！</span>
        </div>
      )}

      {/* 地圖畫布區：支援全螢幕、雙指捏合縮放、3D 透視角與懸浮控制鈕 */}
      <div
        ref={wrapperRef}
        className={
          isFullScreen
            ? 'relative h-full w-full flex-1 overflow-hidden bg-[#18202a]'
            : 'relative h-[65vh] min-h-[460px] w-full overflow-hidden rounded-xl border border-[#2a323d] bg-[#18202a]'
        }
      >
        <div
          className="h-full w-full transition-transform duration-300"
          style={
            is3dTilt
              ? { transform: 'perspective(900px) rotateX(40deg) scale(1.24)', transformOrigin: 'center 60%' }
              : undefined
          }
        >
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onWheel={handleWheel}
            className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
          />
        </div>

        {/* 右上角懸浮控制列：全螢幕 / 縮放 / 前進方向朝上 / HD / 3D / 地形疊加 */}
        <div className="absolute right-3 top-3 flex flex-col gap-1.5 rounded-xl border border-[#2a323d] bg-[#161b22]/90 p-1.5 backdrop-blur">
          <button
            type="button"
            onClick={() => setIsFullScreen((f) => !f)}
            aria-label={isFullScreen ? '退出全螢幕' : '全螢幕地圖'}
            title={isFullScreen ? '退出全螢幕' : '全螢幕地圖'}
            className="rounded-lg bg-[#84cc16] p-1.5 text-slate-950"
          >
            {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.min(16, Number((z + 1).toFixed(2))))}
            aria-label="放大地圖"
            className="rounded-lg p-1.5 text-slate-200 hover:bg-[#2a323d]"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoomLevel((z) => Math.max(2, Number((z - 1).toFixed(2))))}
            aria-label="縮小地圖"
            className="rounded-lg p-1.5 text-slate-200 hover:bg-[#2a323d]"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsHeadingUp((prev) => !prev)}
            title={isHeadingUp ? '目前：前進方向朝上' : '目前：正北朝上'}
            className={`rounded-lg p-1.5 ${
              isHeadingUp ? 'bg-sky-500 text-slate-950' : 'text-slate-200 hover:bg-[#2a323d]'
            }`}
          >
            <Navigation2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsHighClarity((prev) => !prev)}
            title={isHighClarity ? '高清過採樣 (HD) 已開啟' : '標準畫質'}
            className={`rounded-lg p-1.5 ${
              isHighClarity ? 'bg-amber-400 text-slate-950' : 'text-slate-200 hover:bg-[#2a323d]'
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIs3dTilt((prev) => !prev)}
            title={is3dTilt ? '3D 俯視角已開啟' : '切換 3D 俯視角'}
            className={`rounded-lg p-1.5 ${
              is3dTilt ? 'bg-emerald-400 text-slate-950' : 'text-slate-200 hover:bg-[#2a323d]'
            }`}
          >
            <Box className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowTerrainOverlay((prev) => !prev)}
            title={showTerrainOverlay ? '3D 地形渲染疊加已開啟' : '疊加 3D 地形渲染圖層'}
            className={`rounded-lg p-1.5 ${
              showTerrainOverlay ? 'bg-purple-400 text-slate-950' : 'text-slate-200 hover:bg-[#2a323d]'
            }`}
          >
            <Layers className="h-4 w-4" />
          </button>
        </div>

        {/* 左下角即時狀態列 */}
        <div className="pointer-events-none absolute bottom-2.5 left-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#0d1117]/85 px-2.5 py-1 font-mono text-[11px] text-slate-200">
          <span>Z{zoomLevel.toFixed(1)}</span>
          <span>{isHighClarity ? 'HD' : 'SD'}</span>
          <span>{isHeadingUp ? `航向 ${Math.round(headingDeg)}°` : '正北朝上'}</span>
          {is3dTilt && <span className="text-emerald-300">3D</span>}
          {showTerrainOverlay && <span className="text-purple-300">地形疊加</span>}
          <span className="text-slate-400">
            {centerLat.toFixed(4)}, {centerLon.toFixed(4)}
          </span>
        </div>
      </div>

      {!isFullScreen && downloadMsg && <p className="text-xs text-sky-400">{downloadMsg}</p>}
    </div>
  )

  if (isFullScreen && typeof document !== 'undefined') {
    return createPortal(mapUi, document.body)
  }

  return mapUi
}
