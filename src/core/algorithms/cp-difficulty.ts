import { TrackPoint } from '../types/trail'
import { haversineDistanceM } from './trail-metrics'
import { CpDifficultyAssessment, CpSegmentBreakdown } from '../types/cp-strategy'

interface CumulativeTrackPoint {
  cumDistKm: number
  ele: number
}

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
      advice: '極限陡坡／高耗能段！嚴控心率 <= 155 bpm，務必帶足預備水與高熱量補給。'
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
    advice: '平緩推進段，可趁機調整呼吸、補水並檢視身體狀態。'
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

/**
 * 依據固定公里間距（intervalKm）切分路線並計算各段爬升、EP、補給與難度
 */
export function computeIntervalSegments(
  track: TrackPoint[],
  intervalKm: number,
  targetEph: number,
  weightKg: number
): CpSegmentBreakdown[] {
  const cumTrack = buildCumulativeTrack(track)
  if (cumTrack.length < 2) return []

  const totalDistKm = cumTrack[cumTrack.length - 1].cumDistKm
  if (totalDistKm <= 0.1) return []

  const stepKm = Math.max(1, Math.min(50, intervalKm))
  const safeEph = Math.max(1, targetEph)
  const safeWeight = Math.max(35, Math.min(150, weightKg))

  const marks: number[] = [0]
  for (let km = stepKm; km < totalDistKm - 0.3; km += stepKm) {
    marks.push(Number(km.toFixed(1)))
  }
  marks.push(Number(totalDistKm.toFixed(2)))

  const segments: CpSegmentBreakdown[] = []

  for (let i = 0; i < marks.length - 1; i += 1) {
    const startKm = marks[i]
    const endKm = marks[i + 1]
    const distanceKm = Math.max(0.01, endKm - startKm)

    // 採用 ±2.5m 垂直遲滯閾值過濾海拔漂移雜訊
    let ascentM = 0
    let descentM = 0
    let lastRefEle: number | null = null

    for (const pt of cumTrack) {
      if (pt.cumDistKm < startKm) continue
      if (pt.cumDistKm > endKm) break
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

    const mult =
      difficulty.level === 'extreme' ? 1.2 : difficulty.level === 'hard' ? 1.1 : difficulty.level === 'moderate' ? 1.0 : 0.9

    segments.push({
      id: `km-${i}-${startKm}-${endKm}`,
      fromLabel: `${startKm} km`,
      toLabel: i === marks.length - 2 ? `${endKm} km (終點)` : `${endKm} km`,
      startKm,
      endKm,
      distanceKm: Number(distanceKm.toFixed(2)),
      ascentM: Math.round(ascentM),
      descentM: Math.round(descentM),
      segmentEp,
      estimatedHours: Number(estimatedHours.toFixed(2)),
      targetEph: safeEph,
      waterMl: Math.round(estimatedHours * 550 * mult),
      carbsG: Math.round(estimatedHours * 60 * mult),
      caloriesKcal: Math.round(estimatedHours * safeWeight * 7.8 * mult),
      sodiumMg: Math.round(estimatedHours * 500 * mult),
      difficulty
    })
  }

  return segments
}
