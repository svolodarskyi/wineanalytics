import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseVendorService } from '../vendorService'
import { fakeQueryBuilder } from './testHelpers'

const ROW = {
  id: 'v1',
  name: 'Winebow Imports',
  invoice_name: 'WINEBOW',
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

function supabaseWith(from: (table: string) => unknown): SupabaseClient {
  return { from } as unknown as SupabaseClient
}

describe('supabase vendor service', () => {
  it('lists vendors, mapping snake_case columns to the app shape', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: [ROW] }))
    const vendors = createSupabaseVendorService(supabaseWith(from))
    const result = await vendors.list()
    expect(result).toEqual([{ id: 'v1', name: 'Winebow Imports', invoiceName: 'WINEBOW', active: true, createdAt: ROW.created_at }])
    expect(from).toHaveBeenCalledWith('wine_vendors')
  })

  it('get returns null when no row matches', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: null }))
    const vendors = createSupabaseVendorService(supabaseWith(from))
    expect(await vendors.get('missing')).toBeNull()
  })

  it('create rejects a blank name without hitting the database', async () => {
    const from = vi.fn()
    const vendors = createSupabaseVendorService(supabaseWith(from))
    await expect(vendors.create({ name: '   ' })).rejects.toThrow(/required/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('create surfaces a friendly error on a unique-constraint violation', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ error: { message: 'duplicate key', code: '23505' } }))
    const vendors = createSupabaseVendorService(supabaseWith(from))
    await expect(vendors.create({ name: 'Winebow Imports' })).rejects.toThrow(/already exists/i)
  })

  it('update maps the row back after a successful update', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: { ...ROW, name: 'Renamed' } }))
    const vendors = createSupabaseVendorService(supabaseWith(from))
    const updated = await vendors.update('v1', { name: 'Renamed' })
    expect(updated.name).toBe('Renamed')
  })

  it('delete blocks when the vendor has invoice history, without deleting', async () => {
    const countBuilder = fakeQueryBuilder({ count: 2 })
    const from = vi.fn(() => countBuilder)
    const vendors = createSupabaseVendorService(supabaseWith(from))
    await expect(vendors.delete('v1')).rejects.toThrow(/invoice history/i)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('wine_invoices')
  })

  it('delete proceeds when there is no invoice history', async () => {
    const countBuilder = fakeQueryBuilder({ count: 0 })
    const deleteBuilder = fakeQueryBuilder({})
    const from = vi.fn().mockReturnValueOnce(countBuilder).mockReturnValueOnce(deleteBuilder)
    const vendors = createSupabaseVendorService(supabaseWith(from))
    await vendors.delete('v1')
    expect(from).toHaveBeenNthCalledWith(1, 'wine_invoices')
    expect(from).toHaveBeenNthCalledWith(2, 'wine_vendors')
    expect(deleteBuilder.delete).toHaveBeenCalled()
  })
})
