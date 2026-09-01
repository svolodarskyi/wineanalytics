import { beforeEach, describe, expect, it } from 'vitest'
import type { Services } from '../../types'
import { createMockServices } from '../index'

describe('mock vendor service', () => {
  let services: Services

  beforeEach(() => {
    services = createMockServices({ latencyMs: 0 })
  })

  it('lists only active vendors by default, seeded from the demo master data', async () => {
    const vendors = await services.vendors.list()
    expect(vendors.length).toBeGreaterThan(0)
    expect(vendors.every((vendor) => vendor.active)).toBe(true)
  })

  it('creates a vendor and rejects duplicate names case-insensitively', async () => {
    const vendor = await services.vendors.create({ name: 'Acme Wine Co' })
    expect(vendor.active).toBe(true)
    await expect(services.vendors.create({ name: 'acme wine co' })).rejects.toThrow(/already exists/i)
  })

  it('updates a vendor name', async () => {
    const vendor = await services.vendors.create({ name: 'Old Name' })
    const updated = await services.vendors.update(vendor.id, { name: 'New Name' })
    expect(updated.name).toBe('New Name')
  })

  it('stores an invoice name distinct from the display name, defaulting to null', async () => {
    const withoutInvoiceName = await services.vendors.create({ name: 'Plain Vendor' })
    expect(withoutInvoiceName.invoiceName).toBeNull()

    const withInvoiceName = await services.vendors.create({ name: 'Rutherford Imports', invoiceName: 'RUTHERFORD INC' })
    expect(withInvoiceName.invoiceName).toBe('RUTHERFORD INC')

    const updated = await services.vendors.update(withInvoiceName.id, {
      name: 'Rutherford Imports',
      invoiceName: 'RUTHERFORD IMPORTS LLC',
    })
    expect(updated.invoiceName).toBe('RUTHERFORD IMPORTS LLC')
  })

  it('deactivating hides a vendor from the default list', async () => {
    const vendor = await services.vendors.create({ name: 'Fading Vendor' })
    await services.vendors.setActive(vendor.id, false)

    const activeOnly = await services.vendors.list()
    expect(activeOnly.find((v) => v.id === vendor.id)).toBeUndefined()

    const withInactive = await services.vendors.list({ includeInactive: true })
    expect(withInactive.find((v) => v.id === vendor.id)?.active).toBe(false)
  })

  it('every write returns a new object reference', async () => {
    const vendor = await services.vendors.create({ name: 'Reference Check' })
    const updated = await services.vendors.update(vendor.id, { name: 'Reference Check 2' })
    expect(updated).not.toBe(vendor)
  })
})
