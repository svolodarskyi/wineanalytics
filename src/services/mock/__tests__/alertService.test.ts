import { describe, expect, it } from 'vitest'
import type { Invoice } from '../../../types'
import { createMockAlertService } from '../alertService'
import { createId } from '../ids'
import { MockStore } from '../store'

function pushApprovedInvoice(store: MockStore, wineId: string, quantity: number): void {
  const invoice: Invoice = {
    id: createId('invoice'),
    fileName: 'invoice.pdf',
    fileType: 'pdf',
    fileDataUrl: 'data:application/pdf;base64,AA==',
    uploadedAt: new Date().toISOString(),
    status: 'approved',
    approvedAt: new Date().toISOString(),
    extracted: {
      invoiceDate: null,
      totalAmount: null,
      vendorMatch: { vendorNameRaw: 'Test Vendor', vendorId: null, confidence: null, status: 'unresolved' },
      additionalCharges: [],
    },
    lineItems: [
      {
        id: createId('line'),
        itemNameRaw: 'Test Wine',
        volumeMlRaw: null,
        categoryRaw: null,
        quantity,
        unitPrice: 10,
        lineTotal: quantity * 10,
        skuMatch: { wineId, confidence: null, status: 'confirmed' },
      },
    ],
  }
  store.invoices.push(invoice)
}

describe('mock alert service', () => {
  describe('inventory alerts', () => {
    it('flags a wine whose balance is below its configured threshold', async () => {
      const store = new MockStore({ seed: false })
      const wine = {
        id: createId('wine'),
        name: 'Low Stock Wine',
        invoiceName: null,
        country: null,
        volumeMl: null,
        category: null,
        imageDataUrl: null,
        active: true,
        createdAt: new Date().toISOString(),
      }
      store.wines.push(wine)

      const alerts = createMockAlertService(store, 0)
      pushApprovedInvoice(store, wine.id, 2)
      await alerts.setThreshold(wine.id, 5)

      const inventoryAlerts = await alerts.listInventoryAlerts()
      expect(inventoryAlerts).toEqual([{ wine, balanceInBottles: 2, minBottles: 5 }])
    })

    it('does not flag a wine whose balance meets or exceeds its threshold', async () => {
      const store = new MockStore({ seed: false })
      const wine = { id: createId('wine'), name: 'Well Stocked Wine', invoiceName: null, country: null, volumeMl: null, category: null, imageDataUrl: null, active: true, createdAt: new Date().toISOString() }
      store.wines.push(wine)

      const alerts = createMockAlertService(store, 0)
      pushApprovedInvoice(store, wine.id, 10)
      await alerts.setThreshold(wine.id, 5)

      expect(await alerts.listInventoryAlerts()).toEqual([])
    })

    it('ignores wines with no configured threshold', async () => {
      const store = new MockStore({ seed: false })
      const wine = { id: createId('wine'), name: 'No Threshold Wine', invoiceName: null, country: null, volumeMl: null, category: null, imageDataUrl: null, active: true, createdAt: new Date().toISOString() }
      store.wines.push(wine)

      const alerts = createMockAlertService(store, 0)
      expect(await alerts.listInventoryAlerts()).toEqual([])
    })

    it('setThreshold upserts - a second call for the same wine updates rather than duplicating', async () => {
      const store = new MockStore({ seed: false })
      const wine = { id: createId('wine'), name: 'Wine', invoiceName: null, country: null, volumeMl: null, category: null, imageDataUrl: null, active: true, createdAt: new Date().toISOString() }
      store.wines.push(wine)
      const alerts = createMockAlertService(store, 0)

      const first = await alerts.setThreshold(wine.id, 5)
      const second = await alerts.setThreshold(wine.id, 10)

      expect(second.id).toBe(first.id)
      const thresholds = await alerts.listThresholds()
      expect(thresholds).toHaveLength(1)
      expect(thresholds[0].minBottles).toBe(10)
    })

    it('setThreshold rejects an unknown wine and a negative level', async () => {
      const store = new MockStore({ seed: false })
      const alerts = createMockAlertService(store, 0)
      await expect(alerts.setThreshold('missing-wine', 5)).rejects.toThrow(/wine not found/i)

      const wine = { id: createId('wine'), name: 'Wine', invoiceName: null, country: null, volumeMl: null, category: null, imageDataUrl: null, active: true, createdAt: new Date().toISOString() }
      store.wines.push(wine)
      await expect(alerts.setThreshold(wine.id, -1)).rejects.toThrow(/non-negative/i)
    })

    it('deleteThreshold removes it, so the wine no longer appears even if understocked', async () => {
      const store = new MockStore({ seed: false })
      const wine = { id: createId('wine'), name: 'Wine', invoiceName: null, country: null, volumeMl: null, category: null, imageDataUrl: null, active: true, createdAt: new Date().toISOString() }
      store.wines.push(wine)
      const alerts = createMockAlertService(store, 0)
      await alerts.setThreshold(wine.id, 5)

      await alerts.deleteThreshold(wine.id)
      expect(await alerts.listThresholds()).toEqual([])
      expect(await alerts.listInventoryAlerts()).toEqual([])
    })
  })

  describe('data quality alerts', () => {
    it('emits one alert per missing tracked field, and none for fully filled-in wines', async () => {
      const store = new MockStore({ seed: false })
      const complete = {
        id: createId('wine'),
        name: 'Complete Wine',
        invoiceName: null,
        country: 'USA',
        volumeMl: 750,
        category: 'red' as const,
        imageDataUrl: null,
        active: true,
        createdAt: new Date().toISOString(),
      }
      const incomplete = {
        id: createId('wine'),
        name: 'Incomplete Wine',
        invoiceName: null,
        country: null,
        volumeMl: 750,
        category: null,
        imageDataUrl: null,
        active: true,
        createdAt: new Date().toISOString(),
      }
      store.wines.push(complete, incomplete)

      const alerts = createMockAlertService(store, 0)
      const dataQualityAlerts = await alerts.listDataQualityAlerts()

      expect(dataQualityAlerts).toEqual([
        { wine: incomplete, field: 'country' },
        { wine: incomplete, field: 'category' },
      ])
    })

    it('skips inactive wines', async () => {
      const store = new MockStore({ seed: false })
      const inactive = {
        id: createId('wine'),
        name: 'Retired Wine',
        invoiceName: null,
        country: null,
        volumeMl: null,
        category: null,
        imageDataUrl: null,
        active: false,
        createdAt: new Date().toISOString(),
      }
      store.wines.push(inactive)

      const alerts = createMockAlertService(store, 0)
      expect(await alerts.listDataQualityAlerts()).toEqual([])
    })
  })
})
