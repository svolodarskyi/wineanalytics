import type { Confidence } from '../types'

export function ConfidenceBadge({ confidence }: { confidence: Confidence | null }) {
  if (!confidence) {
    return <span className="badge badge--unresolved">No match</span>
  }
  const label = confidence[0].toUpperCase() + confidence.slice(1)
  return <span className={`badge badge--${confidence}`}>{label} confidence</span>
}
