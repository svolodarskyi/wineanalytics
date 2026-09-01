import type { DataQualityAlert, InventoryAlert, WineAlertThreshold } from '../../types'
import { DATA_QUALITY_FIELDS, isDataQualityFieldMissing } from '../../utils/dataQuality'
import type { AlertService } from '../types'
import { delay } from './delay'
import type { MockStore } from './store'

function compareByWineName(a: { wine: { name: string } }, b: { wine: { name: string } }): number {
  return a.wine.name.localeCompare(b.wine.name)
}

export function createMockAlertService(store: MockStore, latencyMs: number): AlertService {
  return {
    async listInventoryAlerts(): Promise<InventoryAlert[]> {
      await delay(latencyMs)
      const alerts: InventoryAlert[] = []
      for (const threshold of store.alertThresholds) {
        const wine = store.findWine(threshold.wineId)
        if (!wine || !wine.active) continue
        const balanceInBottles = store.balanceInBottles(wine.id)
        if (balanceInBottles < threshold.minBottles) {
          alerts.push({ wine, balanceInBottles, minBottles: threshold.minBottles })
        }
      }
      return alerts.sort(compareByWineName)
    },

    async listDataQualityAlerts(): Promise<DataQualityAlert[]> {
      await delay(latencyMs)
      const alerts: DataQualityAlert[] = []
      for (const wine of store.wines) {
        if (!wine.active) continue
        for (const { field } of DATA_QUALITY_FIELDS) {
          if (isDataQualityFieldMissing(wine, field)) {
            alerts.push({ wine, field })
          }
        }
      }
      return alerts.sort(compareByWineName)
    },

    async listThresholds(): Promise<WineAlertThreshold[]> {
      await delay(latencyMs)
      return store.alertThresholds
    },

    async setThreshold(wineId: string, minBottles: number): Promise<WineAlertThreshold> {
      await delay(latencyMs)
      if (!store.findWine(wineId)) throw new Error('Wine not found.')
      if (!Number.isFinite(minBottles) || minBottles < 0) {
        throw new Error('Alert level must be a non-negative number.')
      }
      return store.upsertThreshold(wineId, Math.round(minBottles))
    },

    async deleteThreshold(wineId: string): Promise<void> {
      await delay(latencyMs)
      store.deleteThreshold(wineId)
    },
  }
}
