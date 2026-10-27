import { useSales } from '../hooks/useSales'
import { useWinePurchaseHistory } from '../hooks/useWines'
import type { Wine } from '../types'
import { computeBalanceHistory } from '../utils/balanceHistory'
import { Sparkline } from './Sparkline'

interface AlertTrendSparklineProps {
  wine: Wine
}

/** 90-day balance trend for one alert row - a steep decline reads as more urgent than a line that's been flat and low for months. */
export function AlertTrendSparkline({ wine }: AlertTrendSparklineProps) {
  const { data: purchaseHistory } = useWinePurchaseHistory(wine.id)
  const { data: sales } = useSales(wine.id)

  if (!purchaseHistory || !sales) return null

  const history = computeBalanceHistory(purchaseHistory, sales, wine, '90d')
  if (history.length < 2) return null

  const isDeclining = history[history.length - 1].balanceInBottles < history[0].balanceInBottles
  return <Sparkline values={history.map((point) => point.balanceInBottles)} color={isDeclining ? 'var(--danger)' : 'var(--accent)'} />
}
