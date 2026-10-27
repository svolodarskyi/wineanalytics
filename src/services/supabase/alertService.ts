import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  DataQualityAlert,
  InventoryAlert,
  SalesAlertThreshold,
  SalesQualityAlert,
  Wine,
  WineAlertThreshold,
  WineSale,
} from '../../types'
import { DATA_QUALITY_FIELDS, isDataQualityFieldMissing } from '../../utils/dataQuality'
import type { AlertService } from '../types'
import { fetchBalanceByWineId } from './balances'

interface ThresholdRow {
  id: string
  wine_id: string
  min_bottles: number
  active: boolean
  created_at: string
}

interface WineRow {
  id: string
  name: string
  invoice_name: string | null
  country: string | null
  volume_ml: number | null
  category: Wine['category']
  active: boolean
  created_at: string
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

function toThreshold(row: ThresholdRow): WineAlertThreshold {
  return { id: row.id, wineId: row.wine_id, minBottles: row.min_bottles, active: row.active, createdAt: row.created_at }
}

/**
 * A lighter Wine mapping than wineService.ts's toWine() - alerts only ever
 * display the wine's name/fields, never its photo, so this skips the extra
 * signed-URL round trip per wine.
 */
function toLightWine(row: WineRow): Wine {
  return {
    id: row.id,
    name: row.name,
    invoiceName: row.invoice_name,
    producer: null,
    country: row.country,
    volumeMl: row.volume_ml,
    category: row.category,
    imageDataUrls: [],
    active: row.active,
    createdAt: row.created_at,
  }
}

function compareByWineName(a: { wine: { name: string } }, b: { wine: { name: string } }): number {
  return a.wine.name.localeCompare(b.wine.name)
}

function compareBySoldAtDesc(a: SalesQualityAlert, b: SalesQualityAlert): number {
  return b.sale.soldAt.localeCompare(a.sale.soldAt)
}

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

/** quantity is nullable in the database - rows written before that column existed have no value to backfill, so treat null as 1. */
function toSale(row: SaleRow): WineSale {
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

interface SalesAlertSettingsRow {
  min_volume_ml: number | null
  max_volume_ml: number | null
}

function toSalesAlertThreshold(row: SalesAlertSettingsRow | null): SalesAlertThreshold {
  return { minVolumeMl: row?.min_volume_ml ?? null, maxVolumeMl: row?.max_volume_ml ?? null }
}

export function createSupabaseAlertService(supabase: SupabaseClient): AlertService {
  return {
    async listInventoryAlerts(): Promise<InventoryAlert[]> {
      const { data, error } = await supabase.from('wine_alert_thresholds').select('*, wine_wines(*)')
      throwIfError(error)

      const rows = (data ?? []) as (ThresholdRow & { wine_wines: WineRow | null })[]
      const balanceByWineId = await fetchBalanceByWineId(
        supabase,
        rows
          .filter((row) => row.wine_wines)
          .map((row) => ({ id: row.wine_id, volumeMl: row.wine_wines!.volume_ml })),
      )

      const alerts: InventoryAlert[] = []
      for (const row of rows) {
        if (!row.active) continue
        if (!row.wine_wines || !row.wine_wines.active) continue
        const balanceInBottles = balanceByWineId.get(row.wine_id) ?? 0
        if (balanceInBottles < row.min_bottles) {
          alerts.push({ wine: toLightWine(row.wine_wines), balanceInBottles, minBottles: row.min_bottles })
        }
      }
      return alerts.sort(compareByWineName)
    },

    async listDataQualityAlerts(): Promise<DataQualityAlert[]> {
      const { data, error } = await supabase.from('wine_wines').select('*').eq('active', true)
      throwIfError(error)

      const alerts: DataQualityAlert[] = []
      for (const row of (data ?? []) as WineRow[]) {
        const wine = toLightWine(row)
        for (const { field } of DATA_QUALITY_FIELDS) {
          if (isDataQualityFieldMissing(wine, field)) {
            alerts.push({ wine, field })
          }
        }
      }
      return alerts.sort(compareByWineName)
    },

    async listThresholds(): Promise<WineAlertThreshold[]> {
      const { data, error } = await supabase
        .from('wine_alert_thresholds')
        .select('*')
        .order('created_at', { ascending: false })
      throwIfError(error)
      return (data as ThresholdRow[]).map(toThreshold)
    },

    async setThreshold(wineId: string, minBottles: number): Promise<WineAlertThreshold> {
      if (!Number.isFinite(minBottles) || minBottles < 0) {
        throw new Error('Alert level must be a non-negative number.')
      }
      const { data, error } = await supabase
        .from('wine_alert_thresholds')
        .upsert({ wine_id: wineId, min_bottles: Math.round(minBottles), active: true }, { onConflict: 'wine_id' })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23503') throw new Error('Wine not found.')
        throw new Error(error.message)
      }
      return toThreshold(data as ThresholdRow)
    },

    async setThresholdActive(wineId: string, active: boolean): Promise<WineAlertThreshold> {
      const { data, error } = await supabase
        .from('wine_alert_thresholds')
        .update({ active })
        .eq('wine_id', wineId)
        .select('*')
        .maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Alert level not found.')
      return toThreshold(data as ThresholdRow)
    },

    async deleteThreshold(wineId: string): Promise<void> {
      const { error } = await supabase.from('wine_alert_thresholds').delete().eq('wine_id', wineId)
      throwIfError(error)
    },

    async listSalesQualityAlerts(): Promise<SalesQualityAlert[]> {
      const { minVolumeMl, maxVolumeMl } = await this.getSalesAlertThreshold()
      if (minVolumeMl === null && maxVolumeMl === null) return []

      const { data, error } = await supabase.from('wine_sales').select('*, wine_wines(*)')
      throwIfError(error)

      const alerts: SalesQualityAlert[] = []
      for (const row of (data ?? []) as (SaleRow & { wine_wines: WineRow | null })[]) {
        if (!row.wine_wines) continue
        const sale = toSale(row)
        const wine = toLightWine(row.wine_wines)
        if (minVolumeMl !== null && sale.volumeMl < minVolumeMl) {
          alerts.push({ sale, wine, reason: 'below_minimum' })
        } else if (maxVolumeMl !== null && sale.volumeMl > maxVolumeMl) {
          alerts.push({ sale, wine, reason: 'above_maximum' })
        }
      }
      return alerts.sort(compareBySoldAtDesc)
    },

    async getSalesAlertThreshold(): Promise<SalesAlertThreshold> {
      const { data, error } = await supabase
        .from('wine_sales_alert_settings')
        .select('min_volume_ml, max_volume_ml')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      throwIfError(error)
      return toSalesAlertThreshold(data as SalesAlertSettingsRow | null)
    },

    async setSalesAlertThreshold(input: SalesAlertThreshold): Promise<SalesAlertThreshold> {
      if (input.minVolumeMl !== null && (!Number.isFinite(input.minVolumeMl) || input.minVolumeMl < 0)) {
        throw new Error('Minimum volume must be a non-negative number.')
      }
      if (input.maxVolumeMl !== null && (!Number.isFinite(input.maxVolumeMl) || input.maxVolumeMl < 0)) {
        throw new Error('Maximum volume must be a non-negative number.')
      }
      if (input.minVolumeMl !== null && input.maxVolumeMl !== null && input.minVolumeMl > input.maxVolumeMl) {
        throw new Error('Minimum volume cannot be greater than maximum volume.')
      }
      const { data, error } = await supabase
        .from('wine_sales_alert_settings')
        .insert({ min_volume_ml: input.minVolumeMl, max_volume_ml: input.maxVolumeMl })
        .select('min_volume_ml, max_volume_ml')
        .single()
      throwIfError(error)
      return toSalesAlertThreshold(data as SalesAlertSettingsRow)
    },
  }
}
