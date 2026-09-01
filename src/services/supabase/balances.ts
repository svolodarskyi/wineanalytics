import type { SupabaseClient } from '@supabase/supabase-js'

async function fetchPurchasedByWineId(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('wine_invoice_line_items')
    .select('wine_id, quantity, wine_invoices!inner(status)')
    .eq('wine_invoices.status', 'approved')
  if (error) throw new Error(error.message)

  const map = new Map<string, number>()
  for (const line of (data ?? []) as { wine_id: string | null; quantity: number }[]) {
    if (!line.wine_id) continue
    map.set(line.wine_id, (map.get(line.wine_id) ?? 0) + Number(line.quantity))
  }
  return map
}

async function fetchSoldMlByWineId(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('wine_sales').select('wine_id, volume_ml, quantity')
  if (error) throw new Error(error.message)

  const map = new Map<string, number>()
  for (const sale of (data ?? []) as { wine_id: string; volume_ml: number; quantity: number | null }[]) {
    // quantity is nullable - rows written before that column existed have no value to backfill, so treat null as 1.
    map.set(sale.wine_id, (map.get(sale.wine_id) ?? 0) + Number(sale.volume_ml) * (sale.quantity ?? 1))
  }
  return map
}

/**
 * Ending balance per wine_id: purchased (approved invoices) minus
 * sold-bottle-equivalent (Σ sale volume_ml * quantity / wine.volumeMl). Shared by
 * wineService.getBalances() and alertService.listInventoryAlerts() so the
 * calculation only lives in one place.
 *
 * A wine with no volumeMl can't convert its sales to a bottle-equivalent,
 * so it falls back to purchased-only rather than guessing - the missing
 * volume is already surfaced separately via the data-quality alert.
 */
export async function fetchBalanceByWineId(
  supabase: SupabaseClient,
  wines: { id: string; volumeMl: number | null }[],
): Promise<Map<string, number>> {
  const [purchasedByWineId, soldMlByWineId] = await Promise.all([
    fetchPurchasedByWineId(supabase),
    fetchSoldMlByWineId(supabase),
  ])

  const balanceByWineId = new Map<string, number>()
  for (const wine of wines) {
    const purchased = purchasedByWineId.get(wine.id) ?? 0
    const soldMl = soldMlByWineId.get(wine.id) ?? 0
    balanceByWineId.set(wine.id, wine.volumeMl ? purchased - soldMl / wine.volumeMl : purchased)
  }
  return balanceByWineId
}
