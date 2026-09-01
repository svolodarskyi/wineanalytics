import type { SupabaseClient } from '@supabase/supabase-js'
import type { DataQualityAlert, InventoryAlert, Wine, WineAlertThreshold } from '../../types'
import { DATA_QUALITY_FIELDS, isDataQualityFieldMissing } from '../../utils/dataQuality'
import type { AlertService } from '../types'
import { fetchBalanceByWineId } from './balances'

interface ThresholdRow {
  id: string
  wine_id: string
  min_bottles: number
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
  return { id: row.id, wineId: row.wine_id, minBottles: row.min_bottles, createdAt: row.created_at }
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
    country: row.country,
    volumeMl: row.volume_ml,
    category: row.category,
    imageDataUrl: null,
    active: row.active,
    createdAt: row.created_at,
  }
}

function compareByWineName(a: { wine: { name: string } }, b: { wine: { name: string } }): number {
  return a.wine.name.localeCompare(b.wine.name)
}

export function createSupabaseAlertService(supabase: SupabaseClient): AlertService {
  return {
    async listInventoryAlerts(): Promise<InventoryAlert[]> {
      const { data, error } = await supabase.from('wine_alert_thresholds').select('*, wine_wines(*)')
      throwIfError(error)

      const balanceByWineId = await fetchBalanceByWineId(supabase)

      const alerts: InventoryAlert[] = []
      for (const row of (data ?? []) as (ThresholdRow & { wine_wines: WineRow | null })[]) {
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
        .upsert({ wine_id: wineId, min_bottles: Math.round(minBottles) }, { onConflict: 'wine_id' })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23503') throw new Error('Wine not found.')
        throw new Error(error.message)
      }
      return toThreshold(data as ThresholdRow)
    },

    async deleteThreshold(wineId: string): Promise<void> {
      const { error } = await supabase.from('wine_alert_thresholds').delete().eq('wine_id', wineId)
      throwIfError(error)
    },
  }
}
