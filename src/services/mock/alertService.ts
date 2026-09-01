import type { DataQualityAlert, InventoryAlert, SalesAlertThreshold, SalesQualityAlert, WineAlertThreshold } from '../../types'
import { DATA_QUALITY_FIELDS, isDataQualityFieldMissing } from '../../utils/dataQuality'
import type { AlertService } from '../types'
import { delay } from './delay'
import type { MockStore } from './store'

function compareByWineName(a: { wine: { name: string } }, b: { wine: { name: string } }): number {
  return a.wine.name.localeCompare(b.wine.name)
}

function compareBySoldAtDesc(a: SalesQualityAlert, b: SalesQualityAlert): number {
  return b.sale.soldAt.localeCompare(a.sale.soldAt)
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

    async listSalesQualityAlerts(): Promise<SalesQualityAlert[]> {
      await delay(latencyMs)
      const { minVolumeMl, maxVolumeMl } = store.salesAlertThreshold
      if (minVolumeMl === null && maxVolumeMl === null) return []

      const alerts: SalesQualityAlert[] = []
      for (const sale of store.sales) {
        const wine = store.findWine(sale.wineId)
        if (!wine) continue
        if (minVolumeMl !== null && sale.volumeMl < minVolumeMl) {
          alerts.push({ sale, wine, reason: 'below_minimum' })
        } else if (maxVolumeMl !== null && sale.volumeMl > maxVolumeMl) {
          alerts.push({ sale, wine, reason: 'above_maximum' })
        }
      }
      return alerts.sort(compareBySoldAtDesc)
    },

    async getSalesAlertThreshold(): Promise<SalesAlertThreshold> {
      await delay(latencyMs)
      return store.salesAlertThreshold
    },

    async setSalesAlertThreshold(input: SalesAlertThreshold): Promise<SalesAlertThreshold> {
      await delay(latencyMs)
      if (input.minVolumeMl !== null && (!Number.isFinite(input.minVolumeMl) || input.minVolumeMl < 0)) {
        throw new Error('Minimum volume must be a non-negative number.')
      }
      if (input.maxVolumeMl !== null && (!Number.isFinite(input.maxVolumeMl) || input.maxVolumeMl < 0)) {
        throw new Error('Maximum volume must be a non-negative number.')
      }
      if (input.minVolumeMl !== null && input.maxVolumeMl !== null && input.minVolumeMl > input.maxVolumeMl) {
        throw new Error('Minimum volume cannot be greater than maximum volume.')
      }
      store.setSalesAlertThreshold(input)
      return store.salesAlertThreshold
    },
  }
}
