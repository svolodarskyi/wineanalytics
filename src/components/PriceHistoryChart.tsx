import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { PricePoint } from '../utils/priceHistory'
import { formatCurrency, formatDate, formatDeltaPct } from '../utils/format'

/** Cycled by vendor index - CSS-variable-backed so it follows the app's light/dark palette. */
const VENDOR_COLORS = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--danger)']

interface PriceHistoryChartProps {
  points: PricePoint[]
  vendors: string[]
}

interface TooltipEntry {
  payload?: PricePoint
}

function PriceTooltip({ active, payload }: { active?: boolean; payload?: TooltipEntry[] }) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null

  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, padding: '8px 10px' }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{formatDate(point.date)}</div>
      <div style={{ color: 'var(--text-h)', fontWeight: 500 }}>
        {point.vendorName}: {formatCurrency(point.unitPrice)}
      </div>
      {point.deltaPct !== null && (
        <div style={{ color: point.deltaPct > 0 ? 'var(--warning)' : 'var(--success)' }}>
          {formatDeltaPct(point.deltaPct)} vs previous purchase
        </div>
      )}
    </div>
  )
}

interface DotProps {
  cx?: number
  cy?: number
  payload?: PricePoint
}

export function PriceHistoryChart({ points, vendors }: PriceHistoryChartProps) {
  const colorByVendor = new Map(vendors.map((vendor, index) => [vendor, VENDOR_COLORS[index % VENDOR_COLORS.length]]))

  function renderDot({ cx, cy, payload }: DotProps) {
    if (cx == null || cy == null || !payload) return <circle cx={0} cy={0} r={0} />
    const color = colorByVendor.get(payload.vendorName) ?? 'var(--accent)'
    return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="var(--bg)" strokeWidth={1} />
  }

  return (
    <div>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" hide />
            <YAxis
              tickFormatter={(value: number) => formatCurrency(value)}
              tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
              axisLine={false}
              tickLine={false}
              width={56}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<PriceTooltip />} />
            <Line
              dataKey="unitPrice"
              stroke="var(--text-muted)"
              strokeWidth={1.5}
              dot={renderDot}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {vendors.length > 1 && (
        <div className="chart-legend">
          {vendors.map((vendor) => (
            <span key={vendor} className="chart-legend__item">
              <span className="chart-legend__swatch" style={{ background: colorByVendor.get(vendor) }} />
              {vendor}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
