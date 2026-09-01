import type { SupabaseClient } from '@supabase/supabase-js'
import type { WineSale } from '../../types'
import type { SaleService } from '../types'

interface SaleRow {
  id: string
  wine_id: string
  pour_size_id: string | null
  volume_ml: number
  quantity: number | null
  amount: number | null
  sold_at: string
  source: WineSale['source']
  created_at: string
}

/** quantity is nullable in the database - rows written before that column existed have no value to backfill, so treat null as 1 (the same as an unspecified quantity on create). */
function fromRow(row: SaleRow): WineSale {
  return {
    id: row.id,
    wineId: row.wine_id,
    pourSizeId: row.pour_size_id,
    volumeMl: row.volume_ml,
    quantity: row.quantity ?? 1,
    amount: row.amount != null ? Number(row.amount) : null,
    soldAt: row.sold_at,
    source: row.source,
    createdAt: row.created_at,
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseSaleService(supabase: SupabaseClient): SaleService {
  return {
    async list(wineId: string): Promise<WineSale[]> {
      const { data, error } = await supabase
        .from('wine_sales')
        .select('*')
        .eq('wine_id', wineId)
        .order('sold_at', { ascending: false })
      throwIfError(error)
      return (data as SaleRow[]).map(fromRow)
    },

    async create(input: {
      wineId: string
      soldAt: string
      pourSizeId?: string | null
      volumeMl?: number
      quantity?: number
      amount?: number | null
    }): Promise<WineSale> {
      const quantity = input.quantity ?? 1
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
        throw new Error('Quantity must be a positive whole number.')
      }

      const amount = input.amount ?? null
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
        throw new Error('Amount must be a non-negative number.')
      }

      let volumeMl: number
      let pourSizeId: string | null

      if (input.pourSizeId) {
        const { data: pourSize, error: pourSizeError } = await supabase
          .from('wine_pour_sizes')
          .select('id, volume_ml')
          .eq('id', input.pourSizeId)
          .maybeSingle()
        throwIfError(pourSizeError)
        if (!pourSize) throw new Error('Pour size not found.')
        volumeMl = (pourSize as { volume_ml: number }).volume_ml
        pourSizeId = input.pourSizeId
      } else {
        if (!input.volumeMl || !Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
          throw new Error('Volume must be a positive number.')
        }
        volumeMl = Math.round(input.volumeMl)
        pourSizeId = null
      }

      const { data, error } = await supabase
        .from('wine_sales')
        .insert({
          wine_id: input.wineId,
          pour_size_id: pourSizeId,
          volume_ml: volumeMl,
          quantity,
          amount,
          sold_at: input.soldAt,
          source: 'manual',
        })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23503') throw new Error('Wine not found.')
        throw new Error(error.message)
      }
      return fromRow(data as SaleRow)
    },

    async delete(id: string): Promise<void> {
      const { error } = await supabase.from('wine_sales').delete().eq('id', id)
      throwIfError(error)
    },
  }
}
