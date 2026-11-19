import { TrackPoint } from '../types/trail'
import { haversineDistanceM } from './trail-metrics'
import {
  CpDifficultyAssessment,
  CpSegmentBreakdown,
  CustomCpPoint
} from '../types/cp-strategy'

interface CumulativeTrackPoint {
  cumDistKm: number
  ele: number
}

/**
 * 依據區段平均爬升坡度與 EP 強度，回傳四級難度標籤與實戰補給／控場提示
 */
export function assessSegmentDifficulty(
  distanceKm: number,
  ascentM: number,
  segmentEp: number
): CpDifficultyAssessment {
  const avgGradePct =
    distanceKm > 0.05 ? Number(((ascentM / (distanceKm * 1000)) * 100).toFixed(1)) : 0

  if (avgGradePct >= 15 || segmentEp >= 30) {
    return {
      level: 'extreme',
      label: '極限魔王',
      avgGradePct,
      advice: '極限陡坡／長距離魔王段！嚴控心率 <= 155 bpm，務必帶足預備水與高熱量補給。'
    }
  }

  if (avgGradePct >= 10 || segmentEp >= 20) {
    return {
      level: 'hard',
      label: '陡升硬戰',
      avgGradePct,
      advice: '高爬升消耗段，善用登山杖省力，提早補鈉與電解質防抽筋。'
    }
  }

  if (avgGradePct >= 5 || segmentEp >= 10) {
    return {
      level: 'moderate',
      label: '中等耐力',
      avgGradePct,
      advice: '穩定爬升段，維持有氧巡航節奏，每 45 分鐘規律補充碳水。'
    }
  }

  return {
    level: 'easy',
    label: '輕鬆巡航',
    avgGradePct,
    advice: '平緩推進段，可趁機調整呼吸、補水並檢視身體與裝備狀態。'
  }
}

export function buildCumulativeTrack(track: TrackPoint[]): CumulativeTrackPoint[] {
  if (track.length === 0) return []
  const result: CumulativeTrackPoint[] = [{ cumDistKm: 0, ele: track[0].ele ?? 0 }]
  let accM = 0
  for (let i = 1; i < track.length; i += 1) {
    const prev = track[i - 1]
    const curr = track[i]
    accM += haversineDistanceM(prev.lat, prev.lon, curr.lat, curr.lon)
    result.push({ cumDistKm: accM / 1000, ele: curr.ele ?? prev.ele ?? 0 })
  }
  return result
}

export function computeCpSegments(
  track: TrackPoint[],
  customCps: CustomCpPoint[],
  targetEph: number,
  weightKg: number
): CpSegmentBreakdown[] {
  const cumTrack = buildCumulativeTrack(track)
  if (cumTrack.length < 2) return []

  const totalDistKm = cumTrack[cumTrack.length - 1].cumDistKm
  if (totalDistKm <= 0.1) return []

  const safeEph = Math.max(1, targetEph)
  const safeWeight = Math.max(35, Math.min(150, weightKg))

  // 依里程排序並過濾超出範圍的點位
  const sortedCps = [...customCps]
    .filter((cp) => cp.distanceKm > 0.2 && cp.distanceKm < totalDistKm - 0.2)
    .sort((a, b) => a.distanceKm - b.distanceKm)

  const boundaries: Array<{ label: string; km: number }> = [
    { label: '起點 (Start)', km: 0 },
    ...sortedCps.map((cp, idx) => ({ label: cp.name.trim() || `CP${idx + 1}`, km: cp.distanceKm })),
    { label: '終點 (Finish)', km: totalDistKm }
  ]

  const segments: CpSegmentBreakdown[] = []

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const startB = boundaries[i]
    const endB = boundaries[i + 1]
    const distanceKm = Math.max(0.01, endB.km - startB.km)

    // 計算區段內爬升與下降（採用 2.5m 垂直遲滯門檻降噪）
    let ascentM = 0
    let descentM = 0
    let lastRefEle: number | null = null

    for (const pt of cumTrack) {
      if (pt.cumDistKm < startB.km) continue
      if (pt.cumDistKm > endB.km) break
      if (lastRefEle === null) {
        lastRefEle = pt.ele
        continue
      }
      const delta = pt.ele - lastRefEle
      if (delta >= 2.5) {
        ascentM += delta
        lastRefEle = pt.ele
      } else if (delta <= -2.5) {
        descentM += Math.abs(delta)
        lastRefEle = pt.ele
      }
    }

    const segmentEp = Number((distanceKm + ascentM / 100).toFixed(1))
    const estimatedHours = segmentEp / safeEph
    const difficulty = assessSegmentDifficulty(distanceKm, ascentM, segmentEp)

    // 依預估時數、體重與難度係數估算水分、碳水、熱量與鈉需求
    const intensityMultiplier =
      difficulty.level === 'extreme'
        ? 1.2
        : difficulty.level === 'hard'
          ? 1.1
          : difficulty.level === 'moderate'
            ? 1.0
            : 0.9

    const waterMl = Math.round(estimatedHours * 550 * intensityMultiplier)
    const carbsG = Math.round(estimatedHours * 60 * intensityMultiplier)
    const caloriesKcal = Math.round(estimatedHours * safeWeight * 7.8 * intensityMultiplier)
    const sodiumMg = Math.round(estimatedHours * 500 * intensityMultiplier)

    segments.push({
      id: `seg-${i}-${startB.km.toFixed(2)}-${endB.km.toFixed(2)}`,
      fromLabel: startB.label,
      toLabel: endB.label,
      startKm: Number(startB.km.toFixed(2)),
      endKm: Number(endB.km.toFixed(2)),
      distanceKm: Number(distanceKm.toFixed(2)),
      ascentM: Math.round(ascentM),
      descentM: Math.round(descentM),
      segmentEp,
      estimatedHours: Number(estimatedHours.toFixed(2)),
      targetEph: safeEph,
      waterMl,
      carbsG,
      caloriesKcal,
      sodiumMg,
      difficulty
    })
  }

  return segments
}
