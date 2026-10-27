import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import type { SalesGranularity, VelocityPoint } from '../utils/salesVelocity'
import { formatBottles, formatDate } from '../utils/format'

interface SalesVelocityChartProps {
  data: VelocityPoint[]
  granularity: SalesGranularity
}

function formatBucketLabel(iso: string, granularity: SalesGranularity): string {
  if (granularity === 'month') {
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  return formatDate(iso)
}

export function SalesVelocityChart({ data, granularity }: SalesVelocityChartProps) {
  const bucketNoun = granularity === 'day' ? 'that day' : granularity === 'week' ? 'that week' : 'that month'

  return (
    <div style={{ width: '100%', height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <Tooltip
            formatter={(value) => [`${formatBottles(Number(value))} bottles`, `Sold ${bucketNoun}`]}
            labelFormatter={(label) => formatBucketLabel(String(label), granularity)}
            contentStyle={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="bottles" fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
