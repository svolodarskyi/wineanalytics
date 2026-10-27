interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
}

/** Minimal inline trend line - no charting dependency, cheap enough to render many times in a list. */
export function Sparkline({ values, width = 64, height = 24, color = 'var(--accent)' }: SparklineProps) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  const stepX = width / (values.length - 1)

  const points = values
    .map((value, index) => {
      const x = index * stepX
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
