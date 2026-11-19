import React, { useMemo } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { CheckpointInput, TrackPoint } from '../../core/types/trail'
import { surfaceDistance3DM } from '../../core/algorithms/trail-metrics'

interface ElevationProfileChartProps {
  points: TrackPoint[]
  checkpoints: CheckpointInput[]
}

const MAX_RENDER_POINTS = 400

export const ElevationProfileChart: React.FC<ElevationProfileChartProps> = ({ points, checkpoints }) => {
  const { data, hasHr } = useMemo(() => {
    if (points.length < 2) return { data: [], hasHr: false }
    const step = Math.max(1, Math.floor(points.length / MAX_RENDER_POINTS))
    const result: Array<{ distKm: number; ele: number; hr?: number }> = []
    let cumDistM = 0
    let foundHr = false

    for (let i = 0; i < points.length; i++) {
      if (i > 0) cumDistM += surfaceDistance3DM(points[i - 1], points[i])
      if (points[i].hr !== undefined) foundHr = true
      if (i % step === 0 || i === points.length - 1) {
        result.push({ distKm: Number((cumDistM / 1000).toFixed(2)), ele: Math.round(points[i].ele), hr: points[i].hr })
      }
    }
    return { data: result, hasHr: foundHr }
  }, [points])

  if (data.length === 0) return null

  return (
    <div className="rounded-2xl border border-[#2a323d] bg-[#161b22] p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-100">海拔剖面與心率控場互動圖表</h3>
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="eleFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#84cc16" stopOpacity={0.45} />
                <stop offset="95%" stopColor="#84cc16" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#222933" />
            <XAxis dataKey="distKm" type="number" domain={['dataMin', 'dataMax']} unit="km" stroke="#64748b" fontSize={11} />
            <YAxis yAxisId="ele" stroke="#84cc16" fontSize={11} unit="m" />
            {hasHr && <YAxis yAxisId="hr" orientation="right" domain={[80, 200]} stroke="#fb7185" fontSize={11} />}
            <Tooltip
              contentStyle={{ backgroundColor: '#0d1117', borderColor: '#2a323d', borderRadius: '10px', fontSize: '12px' }}
              formatter={(value, name) => (name === 'ele' ? [`${String(value)} m`, '海拔'] : [`${String(value)} bpm`, '心率'])}
              labelFormatter={(label) => `累積距離：${String(label)} km`}
            />
            <Area yAxisId="ele" type="monotone" dataKey="ele" stroke="#84cc16" strokeWidth={2} fill="url(#eleFill)" isAnimationActive={false} />
            {hasHr && (
              <>
                <Line yAxisId="hr" type="monotone" dataKey="hr" stroke="#fb7185" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <ReferenceLine yAxisId="hr" y={155} stroke="#f59e0b" strokeDasharray="4 4" />
              </>
            )}
            {checkpoints.map((cp) => (
              <ReferenceLine key={cp.id} yAxisId="ele" x={cp.distanceKm} stroke="#38bdf8" strokeDasharray="3 3" />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
