import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface StatTileProps {
  label: string
  value: ReactNode
  detail?: ReactNode
  to?: string
  tone?: 'neutral' | 'danger' | 'warning' | 'success'
}

/** One tile in the dashboard's top stat row - a Link when `to` is given, otherwise informational only. */
export function StatTile({ label, value, detail, to, tone = 'neutral' }: StatTileProps) {
  const className = `stat-tile stat-tile--${tone}`
  const content = (
    <>
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{value}</span>
      {detail && <span className="stat-tile__detail">{detail}</span>}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    )
  }
  return <div className={className}>{content}</div>
}
