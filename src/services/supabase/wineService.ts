import type { SupabaseClient } from '@supabase/supabase-js'
import type { PurchaseHistoryEntry, Wine, WineBalance } from '../../types'
import type { WineListOptions, WineService } from '../types'
import { fetchBalanceByWineId } from './balances'
import { removeObject, resolveSignedUrl, uploadDataUrl } from './storage'

const PHOTOS_BUCKET = 'wine-photos'
const MAX_PHOTOS = 3

interface WineRow {
  id: string
  name: string
  invoice_name: string | null
  producer: string | null
  country: string | null
  volume_ml: number | null
  category: Wine['category']
  image_urls: string[] | null
  active: boolean
  created_at: string
}

async function toWine(supabase: SupabaseClient, row: WineRow): Promise<Wine> {
  const resolved = await Promise.all((row.image_urls ?? []).map((path) => resolveSignedUrl(supabase, PHOTOS_BUCKET, path)))
  return {
    id: row.id,
    name: row.name,
    invoiceName: row.invoice_name,
    producer: row.producer,
    country: row.country,
    volumeMl: row.volume_ml,
    category: row.category,
    // A signing failure drops that one photo rather than failing the whole wine.
    imageDataUrls: resolved.filter((url): url is string => url !== null),
    active: row.active,
    createdAt: row.created_at,
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** 0 or an unparseable value isn't a real bottle size, so normalize to null rather than 0. */
function normalizeVolumeMl(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

/**
 * Reconciles the incoming photo set against what's currently stored.
 * `imageDataUrls` is undefined when the field wasn't touched (left alone),
 * otherwise it fully replaces the photo set (0-3 entries, always `data:`
 * URLs - the caller is responsible for re-encoding any kept-as-is existing
 * photo back into a data: URL before calling create/update, since a signed
 * URL string alone can't be mapped back to its storage object). Wipe-and-
 * replace rather than positional diffing: with reordering/removal possible
 * at any position, there's no reliable way to tell which surviving entry
 * corresponds to which existing stored path from the data alone.
 */
async function resolveImagePaths(
  supabase: SupabaseClient,
  wineId: string,
  imageDataUrls: string[] | undefined,
  currentPaths: string[],
): Promise<string[] | undefined> {
  if (imageDataUrls === undefined) return undefined
  await Promise.all(currentPaths.map((path) => removeObject(supabase, PHOTOS_BUCKET, path)))
  return Promise.all(
    imageDataUrls.slice(0, MAX_PHOTOS).map((dataUrl, index) => uploadDataUrl(supabase, PHOTOS_BUCKET, `${wineId}-${index}`, dataUrl)),
  )
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
      producer?: string | null
      country?: string | null
      volumeMl?: number | null
      category?: Wine['category']
      imageDataUrls?: string[]
    }): Promise<Wine> {
      const name = input.name.trim()
      if (!name) throw new Error('Wine name is required.')

      const id = crypto.randomUUID()
      const imagePaths = (await resolveImagePaths(supabase, id, input.imageDataUrls, [])) ?? []

      const { data, error } = await supabase
        .from('wine_wines')
        .insert({
          id,
          name,
          invoice_name: input.invoiceName?.trim() || null,
          producer: input.producer?.trim() || null,
          country: input.country?.trim() || null,
          volume_ml: normalizeVolumeMl(input.volumeMl),
          category: input.category ?? null,
          image_urls: imagePaths,
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
        producer?: string | null
        country?: string | null
        volumeMl?: number | null
        category?: Wine['category']
        imageDataUrls?: string[]
      },
    ): Promise<Wine> {
      const name = input.name.trim()
      if (!name) throw new Error('Wine name is required.')

      const { data: current, error: currentError } = await supabase
        .from('wine_wines')
        .select('image_urls')
        .eq('id', id)
        .maybeSingle()
      throwIfError(currentError)
      if (!current) throw new Error('Wine not found.')

      const imagePaths = await resolveImagePaths(supabase, id, input.imageDataUrls, (current as WineRow).image_urls ?? [])

      const { data, error } = await supabase
        .from('wine_wines')
        .update({
          name,
          invoice_name: input.invoiceName?.trim() || null,
          producer: input.producer?.trim() || null,
          country: input.country?.trim() || null,
          volume_ml: normalizeVolumeMl(input.volumeMl),
          category: input.category ?? null,
          ...(imagePaths !== undefined ? { image_urls: imagePaths } : {}),
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

      const wines = await Promise.all((wineRows as WineRow[]).map((row) => toWine(supabase, row)))
      const balanceByWineId = await fetchBalanceByWineId(
        supabase,
        wines.map((wine) => ({ id: wine.id, volumeMl: wine.volumeMl })),
      )
      return wines.map((wine) => ({ wine, balanceInBottles: balanceByWineId.get(wine.id) ?? 0 }))
    },

    async getPurchaseHistory(id: string): Promise<PurchaseHistoryEntry[]> {
      const { data, error } = await supabase
        .from('wine_invoice_line_items')
        .select(
          'quantity, unit_price, line_total, pack_size, wine_invoices!inner(id, status, invoice_date, vendor_name_raw, wine_vendors(name))',
        )
        .eq('wine_id', id)
        .eq('wine_invoices.status', 'approved')
        .eq('excluded', false)
      throwIfError(error)

      interface Row {
        quantity: number
        unit_price: number
        line_total: number
        pack_size: number
        wine_invoices: {
          id: string
          invoice_date: string | null
          vendor_name_raw: string
          wine_vendors: { name: string } | null
        }
      }

      return (data as unknown as Row[])
        .map((row) => {
          const packSize = Number(row.pack_size)
          return {
            invoiceId: row.wine_invoices.id,
            date: row.wine_invoices.invoice_date,
            vendorName: row.wine_invoices.wine_vendors?.name ?? row.wine_invoices.vendor_name_raw,
            // Folds pack size in here so callers get real per-bottle quantity/price without knowing about packs - lineTotal is untouched, still the actual dollar amount.
            quantity: Number(row.quantity) * packSize,
            unitPrice: Number(row.unit_price) / packSize,
            lineTotal: Number(row.line_total),
          }
        })
        .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    },
  }
}
