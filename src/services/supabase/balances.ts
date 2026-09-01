import type { SupabaseClient } from '@supabase/supabase-js'

/** Total approved-invoice quantity per wine_id. Shared by wineService.getBalances() and alertService.listInventoryAlerts(). */
export async function fetchBalanceByWineId(supabase: SupabaseClient): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('wine_invoice_line_items')
    .select('wine_id, quantity, wine_invoices!inner(status)')
    .eq('wine_invoices.status', 'approved')
  if (error) throw new Error(error.message)

  const balanceByWineId = new Map<string, number>()
  for (const line of (data ?? []) as { wine_id: string | null; quantity: number }[]) {
    if (!line.wine_id) continue
    balanceByWineId.set(line.wine_id, (balanceByWineId.get(line.wine_id) ?? 0) + Number(line.quantity))
  }
  return balanceByWineId
}
