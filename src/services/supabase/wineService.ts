import type { SupabaseClient } from '@supabase/supabase-js'
import type { PurchaseHistoryEntry, Wine, WineBalance } from '../../types'
import type { WineListOptions, WineService } from '../types'
import { resolveSignedUrl, uploadDataUrl } from './storage'

const PHOTOS_BUCKET = 'wine-photos'

interface WineRow {
  id: string
  name: string
  invoice_name: string | null
  country: string | null
  volume: string | null
  category: Wine['category']
  image_url: string | null
  active: boolean
  created_at: string
}

async function toWine(supabase: SupabaseClient, row: WineRow): Promise<Wine> {
  return {
    id: row.id,
    name: row.name,
    invoiceName: row.invoice_name,
    country: row.country,
    volume: row.volume,
    category: row.category,
    imageDataUrl: await resolveSignedUrl(supabase, PHOTOS_BUCKET, row.image_url),
    active: row.active,
    createdAt: row.created_at,
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/**
 * Reconciles the incoming imageDataUrl against what the wine already has:
 * - undefined -> unchanged (field wasn't touched)
 * - null -> photo removed
 * - "data:..." -> a new photo was picked, needs uploading
 * - anything else (an already-resolved signed URL from a prior read) -> unchanged
 */
async function resolveImagePath(
  supabase: SupabaseClient,
  wineId: string,
  imageDataUrl: string | null | undefined,
  currentPath: string | null | undefined,
): Promise<string | null | undefined> {
  if (imageDataUrl === undefined) return undefined
  if (imageDataUrl === null) return null
  if (imageDataUrl.startsWith('data:')) {
    return uploadDataUrl(supabase, PHOTOS_BUCKET, wineId, imageDataUrl)
  }
  return currentPath
}

export function createSupabaseWineService(supabase: SupabaseClient): WineService {
  return {
    async list(options?: WineListOptions): Promise<Wine[]> {
      let query = supabase.from('wine_wines').select('*').order('name', { ascending: true })
      if (!options?.includeInactive) {
        query = query.eq('active', true)
      }
      if (options?.query?.trim()) {
        query = query.ilike('name', `%${options.query.trim()}%`)
      }
      const { data, error } = await query
      throwIfError(error)
      return Promise.all((data as WineRow[]).map((row) => toWine(supabase, row)))
    },

    async get(id: string): Promise<Wine | null> {
      const { data, error } = await supabase.from('wine_wines').select('*').eq('id', id).maybeSingle()
      throwIfError(error)
      return data ? toWine(supabase, data as WineRow) : null
    },

    async create(input: {
      name: string
      invoiceName?: string | null
      country?: string | null
      volume?: string | null
      category?: Wine['category']
      imageDataUrl?: string | null
    }): Promise<Wine> {
      const name = input.name.trim()
      if (!name) throw new Error('Wine name is required.')

      const id = crypto.randomUUID()
      const imagePath =
        input.imageDataUrl && input.imageDataUrl.startsWith('data:')
          ? await uploadDataUrl(supabase, PHOTOS_BUCKET, id, input.imageDataUrl)
          : null

      const { data, error } = await supabase
        .from('wine_wines')
        .insert({
          id,
          name,
          invoice_name: input.invoiceName?.trim() || null,
          country: input.country?.trim() || null,
          volume: input.volume?.trim() || null,
          category: input.category ?? null,
          image_url: imagePath,
        })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error(`A wine named "${name}" already exists.`)
        throw new Error(error.message)
      }
      return toWine(supabase, data as WineRow)
    },

    async update(
      id: string,
      input: {
        name: string
        invoiceName?: string | null
        country?: string | null
        volume?: string | null
        category?: Wine['category']
        imageDataUrl?: string | null
      },
    ): Promise<Wine> {
      const name = input.name.trim()
      if (!name) throw new Error('Wine name is required.')

      const { data: current, error: currentError } = await supabase
        .from('wine_wines')
        .select('image_url')
        .eq('id', id)
        .maybeSingle()
      throwIfError(currentError)
      if (!current) throw new Error('Wine not found.')

      const imagePath = await resolveImagePath(supabase, id, input.imageDataUrl, (current as WineRow).image_url)

      const { data, error } = await supabase
        .from('wine_wines')
        .update({
          name,
          invoice_name: input.invoiceName?.trim() || null,
          country: input.country?.trim() || null,
          volume: input.volume?.trim() || null,
          category: input.category ?? null,
          ...(imagePath !== undefined ? { image_url: imagePath } : {}),
        })
        .eq('id', id)
        .select('*')
        .maybeSingle()
      if (error) {
        if (error.code === '23505') throw new Error(`A wine named "${name}" already exists.`)
        throw new Error(error.message)
      }
      if (!data) throw new Error('Wine not found.')
      return toWine(supabase, data as WineRow)
    },

    async setActive(id: string, active: boolean): Promise<Wine> {
      const { data, error } = await supabase.from('wine_wines').update({ active }).eq('id', id).select('*').maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Wine not found.')
      return toWine(supabase, data as WineRow)
    },

    async delete(id: string): Promise<void> {
      const { count, error: countError } = await supabase
        .from('wine_invoice_line_items')
        .select('id', { count: 'exact', head: true })
        .eq('wine_id', id)
      throwIfError(countError)
      if (count && count > 0) {
        throw new Error('This wine has invoice history and cannot be deleted. Deactivate it instead.')
      }
      const { error } = await supabase.from('wine_wines').delete().eq('id', id)
      throwIfError(error)
    },

    async getBalances(): Promise<WineBalance[]> {
      const { data: wineRows, error: winesError } = await supabase
        .from('wine_wines')
        .select('*')
        .eq('active', true)
        .order('name', { ascending: true })
      throwIfError(winesError)

      const { data: lineRows, error: linesError } = await supabase
        .from('wine_invoice_line_items')
        .select('wine_id, quantity, wine_invoices!inner(status)')
        .eq('wine_invoices.status', 'approved')
      throwIfError(linesError)

      const balanceByWineId = new Map<string, number>()
      for (const line of (lineRows ?? []) as { wine_id: string | null; quantity: number }[]) {
        if (!line.wine_id) continue
        balanceByWineId.set(line.wine_id, (balanceByWineId.get(line.wine_id) ?? 0) + Number(line.quantity))
      }

      const wines = await Promise.all((wineRows as WineRow[]).map((row) => toWine(supabase, row)))
      return wines.map((wine) => ({ wine, balanceInBottles: balanceByWineId.get(wine.id) ?? 0 }))
    },

    async getPurchaseHistory(id: string): Promise<PurchaseHistoryEntry[]> {
      const { data, error } = await supabase
        .from('wine_invoice_line_items')
        .select(
          'quantity, unit_price, line_total, wine_invoices!inner(id, status, invoice_date, vendor_name_raw, wine_vendors(name))',
        )
        .eq('wine_id', id)
        .eq('wine_invoices.status', 'approved')
      throwIfError(error)

      interface Row {
        quantity: number
        unit_price: number
        line_total: number
        wine_invoices: {
          id: string
          invoice_date: string | null
          vendor_name_raw: string
          wine_vendors: { name: string } | null
        }
      }

      return (data as unknown as Row[])
        .map((row) => ({
          invoiceId: row.wine_invoices.id,
          date: row.wine_invoices.invoice_date,
          vendorName: row.wine_invoices.wine_vendors?.name ?? row.wine_invoices.vendor_name_raw,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unit_price),
          lineTotal: Number(row.line_total),
        }))
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    },
  }
}
