import {
  ActivitySummary,
  CheckpointInput,
  DifficultyGrade,
  EphGrade,
  SegmentAnalysis,
  TrackPoint
} from '../types/trail'

const EARTH_RADIUS_M = 6371000
const ELEVATION_HYSTERESIS_M = 3.0
const AEROBIC_SAFE_HR_BPM = 155

export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function surfaceDistance3DM(p1: TrackPoint, p2: TrackPoint): number {
  const flatM = haversineDistanceM(p1.lat, p1.lon, p2.lat, p2.lon)
  const dEle = p2.ele - p1.ele
  return Math.sqrt(flatM * flatM + dEle * dEle)
}

export function smoothElevations(points: TrackPoint[], windowSize = 5): number[] {
  const half = Math.floor(windowSize / 2)
  return points.map((_, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(points.length - 1, i + half)
    let sum = 0
    for (let j = start; j <= end; j++) sum += points[j].ele
    return sum / (end - start + 1)
  })
}

export function computeAscentDescent(smoothedEles: number[]): { ascentM: number; descentM: number } {
  if (smoothedEles.length < 2) return { ascentM: 0, descentM: 0 }
  let anchorEle = smoothedEles[0]
  let ascentM = 0
  let descentM = 0

  for (let i = 1; i < smoothedEles.length; i++) {
    const diff = smoothedEles[i] - anchorEle
    if (diff >= ELEVATION_HYSTERESIS_M) {
      ascentM += diff
      anchorEle = smoothedEles[i]
    } else if (diff <= -ELEVATION_HYSTERESIS_M) {
      descentM += Math.abs(diff)
      anchorEle = smoothedEles[i]
    }
  }
  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM) }
}

export function minettiCostFactor(gradeDecimal: number): number {
  const g = Math.max(-0.45, Math.min(0.45, gradeDecimal))
  const cost = 155.4 * g ** 5 - 30.4 * g ** 4 - 43.3 * g ** 3 + 46.3 * g ** 2 + 19.5 * g + 3.6
  return Math.max(0.5, cost / 3.6)
}

export function calculateEP(distanceKm: number, ascentM: number): number {
  return Number((distanceKm + ascentM / 100).toFixed(1))
}

export function classifyDifficulty(ep: number): DifficultyGrade {
  if (ep < 25) return { code: 'L1', label: '輕量入門級', rangeText: '< 25 EP', itraPoints: 0 }
  if (ep < 45) return { code: 'L2', label: '中階標準級', rangeText: '25~45 EP', itraPoints: 1 }
  if (ep < 75) return { code: 'L3', label: '進階挑戰級', rangeText: '45~75 EP', itraPoints: 2 }
  if (ep < 115) return { code: 'L4', label: '高階耐力級', rangeText: '75~115 EP', itraPoints: 3 }
  if (ep < 155) return { code: 'L5', label: '菁英超馬級', rangeText: '115~155 EP', itraPoints: 4 }
  return { code: 'L6', label: '極限史詩級', rangeText: '≥ 155 EP', itraPoints: 5 }
}

export function classifyEph(eph: number): EphGrade {
  if (eph < 2.5) return { code: 'E1', label: '悠閒健行級', rangeText: '< 2.5 EPH' }
  if (eph < 4.0) return { code: 'E2', label: '穩健快走級', rangeText: '2.5~4.0 EPH' }
  if (eph < 5.5) return { code: 'E3', label: '越野巡航級', rangeText: '4.0~5.5 EPH' }
  if (eph < 7.0) return { code: 'E4', label: '競技跑者級', rangeText: '5.5~7.0 EPH' }
  if (eph < 8.5) return { code: 'E5', label: '頂尖好手級', rangeText: '7.0~8.5 EPH' }
  return { code: 'E6', label: '世界菁英級', rangeText: '≥ 8.5 EPH' }
}

function calculateSegmentNutrition(hours: number, ascentM: number, bodyWeightKg: number): SegmentAnalysis['nutrition'] {
  const climbIntensity = hours > 0 ? Math.min(1.35, 1 + ascentM / (hours * 1500)) : 1
  return {
    waterMl: Math.round(hours * 550 * climbIntensity),
    carbsG: Math.round(hours * 60 * climbIntensity),
    caloriesKcal: Math.round(hours * bodyWeightKg * 7.2 * climbIntensity),
    sodiumMg: Math.round(hours * 500 * climbIntensity)
  }
}

export function analyzeTrailActivity(
  points: TrackPoint[],
  checkpoints: CheckpointInput[],
  options: { targetEph: number; bodyWeightKg: number }
): ActivitySummary {
  if (points.length < 2) throw new Error('軌跡點位不足，無法分析')

  const smoothedEles = smoothElevations(points)
  const cumDistKm: number[] = [0]
  let totalGapDistM = 0

  for (let i = 1; i < points.length; i++) {
    const seg3DM = surfaceDistance3DM(points[i - 1], points[i])
    cumDistKm.push(cumDistKm[i - 1] + seg3DM / 1000)
    const flatM = haversineDistanceM(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon)
    const grade = flatM > 2 ? (smoothedEles[i] - smoothedEles[i - 1]) / flatM : 0
    totalGapDistM += seg3DM * minettiCostFactor(grade)
  }

  const totalDistanceKm = Number(cumDistKm[cumDistKm.length - 1].toFixed(2))
  const { ascentM, descentM } = computeAscentDescent(smoothedEles)
  const ep = calculateEP(totalDistanceKm, ascentM)
  const difficulty = classifyDifficulty(ep)

  const startTime = points[0].time
  const endTime = points[points.length - 1].time
  const durationSec = startTime && endTime && endTime > startTime ? Math.round((endTime - startTime) / 1000) : 0
  const eph = durationSec > 0 ? Number((ep / (durationSec / 3600)).toFixed(2)) : null
  const ephGrade = eph !== null ? classifyEph(eph) : null

  const hrValues = points.map((p) => p.hr).filter((v): v is number => v !== undefined)
  const powerValues = points.map((p) => p.power).filter((v): v is number => v !== undefined)
  const cadValues = points.map((p) => p.cadence).filter((v): v is number => v !== undefined)

  const avgHr = hrValues.length ? Math.round(average(hrValues)) : null
  const maxHr = hrValues.length ? Math.max(...hrValues) : null
  const hrSafeZonePct = hrValues.length
    ? Number(((hrValues.filter((h) => h <= AEROBIC_SAFE_HR_BPM).length / hrValues.length) * 100).toFixed(1))
    : null
  const avgPower = powerValues.length ? Math.round(average(powerValues)) : null
  const avgCadence = cadValues.length ? Math.round(average(cadValues)) : null
  const avgPaceSecPerKm = durationSec > 0 && totalDistanceKm > 0 ? Math.round(durationSec / totalDistanceKm) : null
  const avgGapSecPerKm = durationSec > 0 && totalGapDistM > 0 ? Math.round(durationSec / (totalGapDistM / 1000)) : null
  const efficiencyFactor = avgGapSecPerKm && avgHr ? Number(((1000 / (avgGapSecPerKm / 60)) / avgHr).toFixed(2)) : null

  return {
    totalDistanceKm, totalAscentM: ascentM, totalDescentM: descentM, durationSec, ep, difficulty,
    eph, ephGrade, avgHr, maxHr, hrSafeZonePct, avgPower, avgCadence, avgPaceSecPerKm, avgGapSecPerKm,
    efficiencyFactor,
    segments: buildSegmentAnalysis(points, smoothedEles, cumDistKm, checkpoints, options)
  }
}

function buildSegmentAnalysis(
  points: TrackPoint[],
  smoothedEles: number[],
  cumDistKm: number[],
  checkpoints: CheckpointInput[],
  options: { targetEph: number; bodyWeightKg: number }
): SegmentAnalysis[] {
  const totalKm = cumDistKm[cumDistKm.length - 1]
  const sortedCps = [...checkpoints].filter((cp) => cp.distanceKm > 0 && cp.distanceKm < totalKm).sort((a, b) => a.distanceKm - b.distanceKm)
  const boundaries = [
    { name: '起點 (Start)', distanceKm: 0 },
    ...sortedCps.map((cp) => ({ name: cp.name, distanceKm: cp.distanceKm })),
    { name: '終點 (Finish)', distanceKm: totalKm }
  ]

  const segments: SegmentAnalysis[] = []
  for (let s = 0; s < boundaries.length - 1; s++) {
    const startIdx = findClosestDistIndex(cumDistKm, boundaries[s].distanceKm)
    const endIdx = findClosestDistIndex(cumDistKm, boundaries[s + 1].distanceKm)
    if (endIdx <= startIdx) continue

    const slicePts = points.slice(startIdx, endIdx + 1)
    const sliceEles = smoothedEles.slice(startIdx, endIdx + 1)
    const distKm = Number((cumDistKm[endIdx] - cumDistKm[startIdx]).toFixed(2))
    const { ascentM, descentM } = computeAscentDescent(sliceEles)
    const segEp = calculateEP(distKm, ascentM)
    const estHours = Number((segEp / Math.max(0.5, options.targetEph)).toFixed(2))
    const t0 = slicePts[0].time
    const t1 = slicePts[slicePts.length - 1].time
    const actualHours = t0 && t1 && t1 > t0 ? Number(((t1 - t0) / 3600000).toFixed(2)) : undefined
    const actualEph = actualHours && actualHours > 0 ? Number((segEp / actualHours).toFixed(2)) : undefined
    const hrs = slicePts.map((p) => p.hr).filter((v): v is number => v !== undefined)
    const pwrs = slicePts.map((p) => p.power).filter((v): v is number => v !== undefined)
    const cads = slicePts.map((p) => p.cadence).filter((v): v is number => v !== undefined)
    const avgGradePct = distKm > 0 ? Number((((ascentM - descentM) / (distKm * 1000)) * 100).toFixed(1)) : 0

    segments.push({
      segmentIndex: s + 1,
      fromName: boundaries[s].name,
      toName: boundaries[s + 1].name,
      distanceKm: distKm,
      ascentM,
      descentM,
      avgGradePct,
      ep: segEp,
      estimatedHours: estHours,
      actualHours,
      actualEph,
      actualEphGrade: actualEph ? classifyEph(actualEph) : undefined,
      avgHr: hrs.length ? Math.round(average(hrs)) : undefined,
      avgPower: pwrs.length ? Math.round(average(pwrs)) : undefined,
      avgCadence: cads.length ? Math.round(average(cads)) : undefined,
      avgPaceSecPerKm: actualHours && distKm > 0 ? Math.round((actualHours * 3600) / distKm) : undefined,
      nutrition: calculateSegmentNutrition(actualHours ?? estHours, ascentM, options.bodyWeightKg)
    })
  }
  return segments
}

function findClosestDistIndex(cumDistKm: number[], targetKm: number): number {
  let low = 0
  let high = cumDistKm.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (cumDistKm[mid] < targetKm) low = mid + 1
    else high = mid
  }
  return low
}

function average(nums: number[]): number {
  return nums.reduce((acc, v) => acc + v, 0) / nums.length
}
