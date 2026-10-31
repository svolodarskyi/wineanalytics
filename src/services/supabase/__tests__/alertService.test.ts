import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseAlertService } from '../alertService'
import { routedSupabaseFrom } from './testHelpers'

const WINE_ROW = {
  id: 'w1',
  name: 'Caymus Cabernet Sauvignon',
  invoice_name: null,
  volume_ml: 750,
  category: 'red',
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

function supabaseWith(from: ReturnType<typeof routedSupabaseFrom>): SupabaseClient {
  return { from } as unknown as SupabaseClient
}

describe('supabase alert service', () => {
  describe('listInventoryAlerts', () => {
    it('flags a wine whose balance is below its threshold, mapping the joined row', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          { data: [{ id: 't1', wine_id: 'w1', min_bottles: 5, active: true, created_at: '2026-01-01T00:00:00.000Z', wine_wines: WINE_ROW }] },
        ],
        wine_invoice_line_items: [{ data: [{ wine_id: 'w1', quantity: 2, pack_size: 1 }] }],
        wine_sales: [{ data: [] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))

      const result = await alerts.listInventoryAlerts()
      expect(result).toEqual([
        {
          wine: expect.objectContaining({ id: 'w1', name: 'Caymus Cabernet Sauvignon', volumeMl: 750, category: 'red' }),
          balanceInBottles: 2,
          minBottles: 5,
        },
      ])
    })

    it('excludes wines that meet their threshold', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          { data: [{ id: 't1', wine_id: 'w1', min_bottles: 5, active: true, created_at: '2026-01-01T00:00:00.000Z', wine_wines: WINE_ROW }] },
        ],
        wine_invoice_line_items: [{ data: [{ wine_id: 'w1', quantity: 10, pack_size: 1 }] }],
        wine_sales: [{ data: [] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listInventoryAlerts()).toEqual([])
    })

    it('excludes a threshold whose wine has since been deactivated', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          {
            data: [
              { id: 't1', wine_id: 'w1', min_bottles: 5, active: true, created_at: '2026-01-01T00:00:00.000Z', wine_wines: { ...WINE_ROW, active: false } },
            ],
          },
        ],
        wine_invoice_line_items: [{ data: [] }],
        wine_sales: [{ data: [] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listInventoryAlerts()).toEqual([])
    })

    it('excludes a deactivated threshold even when the wine is understocked', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          {
            data: [
              { id: 't1', wine_id: 'w1', min_bottles: 5, active: false, created_at: '2026-01-01T00:00:00.000Z', wine_wines: WINE_ROW },
            ],
          },
        ],
        wine_invoice_line_items: [{ data: [{ wine_id: 'w1', quantity: 2, pack_size: 1 }] }],
        wine_sales: [{ data: [] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listInventoryAlerts()).toEqual([])
    })
  })

  describe('listDataQualityAlerts', () => {
    it('emits one alert per missing tracked field', async () => {
      const from = routedSupabaseFrom({
        wine_wines: [{ data: [{ ...WINE_ROW, category: null }] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))

      const result = await alerts.listDataQualityAlerts()
      expect(result).toEqual([{ wine: expect.objectContaining({ id: 'w1' }), field: 'category' }])
    })

    it('is empty for a fully filled-in wine', async () => {
      const from = routedSupabaseFrom({ wine_wines: [{ data: [WINE_ROW] }] })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listDataQualityAlerts()).toEqual([])
    })
  })

  describe('thresholds CRUD', () => {
    it('listThresholds maps rows to the app shape', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          { data: [{ id: 't1', wine_id: 'w1', min_bottles: 5, active: true, created_at: '2026-01-01T00:00:00.000Z' }] },
        ],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listThresholds()).toEqual([
        { id: 't1', wineId: 'w1', minBottles: 5, active: true, createdAt: '2026-01-01T00:00:00.000Z' },
      ])
    })

    it('setThreshold rejects a negative level without hitting the database', async () => {
      const from = routedSupabaseFrom({})
      const alerts = createSupabaseAlertService(supabaseWith(from))
      await expect(alerts.setThreshold('w1', -1)).rejects.toThrow(/non-negative/i)
      expect(from).not.toHaveBeenCalled()
    })

    it('setThreshold upserts via wine_id and maps a foreign-key violation to "Wine not found."', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [{ error: { message: 'violates foreign key constraint', code: '23503' } }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      await expect(alerts.setThreshold('missing-wine', 5)).rejects.toThrow(/wine not found/i)
    })

    it('setThreshold succeeds and maps the upserted row', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          { data: { id: 't1', wine_id: 'w1', min_bottles: 5, active: true, created_at: '2026-01-01T00:00:00.000Z' } },
        ],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      const result = await alerts.setThreshold('w1', 5)
      expect(result).toEqual({ id: 't1', wineId: 'w1', minBottles: 5, active: true, createdAt: '2026-01-01T00:00:00.000Z' })
      const builder = from.mock.results[0].value
      expect(builder.upsert).toHaveBeenCalledWith(
        { wine_id: 'w1', min_bottles: 5, active: true },
        { onConflict: 'wine_id' },
      )
    })

    it('setThresholdActive pauses an existing threshold without changing its level', async () => {
      const from = routedSupabaseFrom({
        wine_alert_thresholds: [
          { data: { id: 't1', wine_id: 'w1', min_bottles: 5, active: false, created_at: '2026-01-01T00:00:00.000Z' } },
        ],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      const result = await alerts.setThresholdActive('w1', false)
      expect(result).toEqual({ id: 't1', wineId: 'w1', minBottles: 5, active: false, createdAt: '2026-01-01T00:00:00.000Z' })
      const builder = from.mock.results[0].value
      expect(builder.update).toHaveBeenCalledWith({ active: false })
      expect(builder.eq).toHaveBeenCalledWith('wine_id', 'w1')
    })

    it('setThresholdActive rejects an unknown wine', async () => {
      const from = routedSupabaseFrom({ wine_alert_thresholds: [{ data: null }] })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      await expect(alerts.setThresholdActive('missing-wine', false)).rejects.toThrow(/not found/i)
    })

    it('deleteThreshold deletes by wine_id', async () => {
      const from = routedSupabaseFrom({ wine_alert_thresholds: [{ error: null }] })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      await alerts.deleteThreshold('w1')
      const builder = from.mock.results[0].value
      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('wine_id', 'w1')
    })
  })

  describe('sales quality alerts', () => {
    const SALE_ROW = {
      id: 's1',
      wine_id: 'w1',
      pour_size_id: null,
      volume_ml: 5,
      quantity: 1,
      sold_at: '2026-01-01T00:00:00.000Z',
      source: 'manual',
      created_at: '2026-01-01T00:00:00.000Z',
      wine_wines: WINE_ROW,
    }

    it('getSalesAlertThreshold maps the most recent row, defaulting to unbounded when none exists', async () => {
      const from = routedSupabaseFrom({ wine_sales_alert_settings: [{ data: null }] })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.getSalesAlertThreshold()).toEqual({ minVolumeMl: null, maxVolumeMl: null })
    })

    it('setSalesAlertThreshold rejects a negative bound or min greater than max, without hitting the database', async () => {
      const from = routedSupabaseFrom({})
      const alerts = createSupabaseAlertService(supabaseWith(from))
      await expect(alerts.setSalesAlertThreshold({ minVolumeMl: -1, maxVolumeMl: null })).rejects.toThrow(
        /non-negative/i,
      )
      await expect(alerts.setSalesAlertThreshold({ minVolumeMl: 100, maxVolumeMl: 50 })).rejects.toThrow(
        /greater than/i,
      )
      expect(from).not.toHaveBeenCalled()
    })

    it('setSalesAlertThreshold inserts and returns the new row', async () => {
      const from = routedSupabaseFrom({
        wine_sales_alert_settings: [{ data: { min_volume_ml: 20, max_volume_ml: 1500 } }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      const result = await alerts.setSalesAlertThreshold({ minVolumeMl: 20, maxVolumeMl: 1500 })
      expect(result).toEqual({ minVolumeMl: 20, maxVolumeMl: 1500 })
    })

    it('returns nothing when no threshold is configured', async () => {
      const from = routedSupabaseFrom({ wine_sales_alert_settings: [{ data: null }] })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listSalesQualityAlerts()).toEqual([])
    })

    it('flags a sale below the configured minimum', async () => {
      const from = routedSupabaseFrom({
        wine_sales_alert_settings: [{ data: { min_volume_ml: 20, max_volume_ml: null } }],
        wine_sales: [{ data: [SALE_ROW] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      const result = await alerts.listSalesQualityAlerts()
      expect(result).toEqual([
        {
          sale: expect.objectContaining({ id: 's1', volumeMl: 5 }),
          wine: expect.objectContaining({ id: 'w1' }),
          reason: 'below_minimum',
        },
      ])
    })

    it('flags a sale above the configured maximum', async () => {
      const from = routedSupabaseFrom({
        wine_sales_alert_settings: [{ data: { min_volume_ml: null, max_volume_ml: 1 } }],
        wine_sales: [{ data: [{ ...SALE_ROW, volume_ml: 5000 }] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      const result = await alerts.listSalesQualityAlerts()
      expect(result[0]).toMatchObject({ reason: 'above_maximum' })
    })

    it('does not flag a sale within range', async () => {
      const from = routedSupabaseFrom({
        wine_sales_alert_settings: [{ data: { min_volume_ml: 1, max_volume_ml: 10000 } }],
        wine_sales: [{ data: [SALE_ROW] }],
      })
      const alerts = createSupabaseAlertService(supabaseWith(from))
      expect(await alerts.listSalesQualityAlerts()).toEqual([])
    })
  })
})
