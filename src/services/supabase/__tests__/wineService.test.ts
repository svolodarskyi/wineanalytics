import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseWineService } from '../wineService'
import { fakeQueryBuilder, fakeStorage } from './testHelpers'

const ROW = {
  id: 'w1',
  name: 'Caymus Cabernet Sauvignon',
  invoice_name: null,
  country: 'USA',
  volume_ml: null,
  category: null,
  image_url: null,
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

function supabaseWith(from: (table: string) => unknown, storage = fakeStorage()): SupabaseClient {
  return { from, storage: storage as unknown } as unknown as SupabaseClient
}

describe('supabase wine service', () => {
  it('lists wines without a photo, never touching storage', async () => {
    const storage = fakeStorage()
    const from = vi.fn(() => fakeQueryBuilder({ data: [ROW] }))
    const wines = createSupabaseWineService(supabaseWith(from, storage))
    const result = await wines.list()
    expect(result).toEqual([
      {
        id: 'w1',
        name: 'Caymus Cabernet Sauvignon',
        invoiceName: null,
        country: 'USA',
        volumeMl: null,
        category: null,
        imageDataUrl: null,
        active: true,
        createdAt: ROW.created_at,
      },
    ])
    expect(storage.from).not.toHaveBeenCalled()
  })

  it('resolves a signed URL for a wine that has a photo', async () => {
    const storage = fakeStorage({ signedUrl: 'https://signed.example/w1.png' })
    const from = vi.fn(() => fakeQueryBuilder({ data: [{ ...ROW, image_url: 'w1.png' }] }))
    const wines = createSupabaseWineService(supabaseWith(from, storage))
    const [wine] = await wines.list()
    expect(wine.imageDataUrl).toBe('https://signed.example/w1.png')
    expect(storage.bucketApi.createSignedUrl).toHaveBeenCalledWith('w1.png', 3600)
  })

  it('create rejects a blank name without hitting the database', async () => {
    const from = vi.fn()
    const wines = createSupabaseWineService(supabaseWith(from))
    await expect(wines.create({ name: '  ' })).rejects.toThrow(/required/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('create uploads a data: URL photo before inserting the row', async () => {
    const storage = fakeStorage()
    const from = vi.fn(() => fakeQueryBuilder({ data: { ...ROW, image_url: 'some-id.png' } }))
    const wines = createSupabaseWineService(supabaseWith(from, storage))
    await wines.create({ name: 'New Wine', imageDataUrl: 'data:image/png;base64,AAAA' })
    expect(storage.bucketApi.upload).toHaveBeenCalled()
    const [path] = storage.bucketApi.upload.mock.calls[0]
    expect(path).toMatch(/\.png$/)
  })

  it('create surfaces a friendly error on a unique-constraint violation', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ error: { message: 'duplicate key', code: '23505' } }))
    const wines = createSupabaseWineService(supabaseWith(from))
    await expect(wines.create({ name: 'Caymus Cabernet Sauvignon' })).rejects.toThrow(/already exists/i)
  })

  it('update leaves the photo untouched when imageDataUrl is an already-resolved URL', async () => {
    const storage = fakeStorage()
    const from = vi
      .fn()
      .mockReturnValueOnce(fakeQueryBuilder({ data: { image_url: 'existing.png' } }))
      .mockReturnValueOnce(fakeQueryBuilder({ data: { ...ROW, image_url: 'existing.png' } }))
    const wines = createSupabaseWineService(supabaseWith(from, storage))
    await wines.update('w1', { name: 'Caymus Cabernet Sauvignon', imageDataUrl: 'https://signed.example/existing.png' })
    expect(storage.bucketApi.upload).not.toHaveBeenCalled()
  })

  it('update clears the photo when imageDataUrl is explicitly null', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(fakeQueryBuilder({ data: { image_url: 'existing.png' } }))
      .mockReturnValueOnce(fakeQueryBuilder({ data: { ...ROW, image_url: null } }))
    const wines = createSupabaseWineService(supabaseWith(from))
    await wines.update('w1', { name: 'Caymus Cabernet Sauvignon', imageDataUrl: null })
    const updateBuilder = from.mock.results[1].value
    expect(updateBuilder.update).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }))
  })

  it('create sends volumeMl and category through to the insert payload', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: { ...ROW, volume_ml: 750, category: 'red' } }))
    const wines = createSupabaseWineService(supabaseWith(from))
    const wine = await wines.create({ name: 'New Wine', volumeMl: 750, category: 'red' })
    expect(wine.volumeMl).toBe(750)
    expect(wine.category).toBe('red')
    const insertBuilder = from.mock.results[0].value
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ volume_ml: 750, category: 'red' }))
  })

  it('delete blocks when the wine has invoice history', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ count: 3 }))
    const wines = createSupabaseWineService(supabaseWith(from))
    await expect(wines.delete('w1')).rejects.toThrow(/invoice history/i)
  })

  it('getBalances aggregates approved-invoice quantities per wine', async () => {
    const from = vi
      .fn()
      .mockReturnValueOnce(fakeQueryBuilder({ data: [ROW, { ...ROW, id: 'w2', name: 'Other Wine' }] }))
      .mockReturnValueOnce(
        fakeQueryBuilder({
          data: [
            { wine_id: 'w1', quantity: 6 },
            { wine_id: 'w1', quantity: 4 },
            { wine_id: 'w2', quantity: 12 },
          ],
        }),
      )
    const wines = createSupabaseWineService(supabaseWith(from))
    const balances = await wines.getBalances()
    expect(balances).toEqual([
      { wine: expect.objectContaining({ id: 'w1' }), balanceInBottles: 10 },
      { wine: expect.objectContaining({ id: 'w2' }), balanceInBottles: 12 },
    ])
  })

  it('getPurchaseHistory maps and sorts by date descending', async () => {
    const from = vi.fn(() =>
      fakeQueryBuilder({
        data: [
          {
            quantity: 6,
            unit_price: 20,
            line_total: 120,
            wine_invoices: { id: 'inv1', invoice_date: '2026-01-01', vendor_name_raw: 'Raw', wine_vendors: { name: 'Real Vendor' } },
          },
          {
            quantity: 3,
            unit_price: 20,
            line_total: 60,
            wine_invoices: { id: 'inv2', invoice_date: '2026-02-01', vendor_name_raw: 'Raw', wine_vendors: null },
          },
        ],
      }),
    )
    const wines = createSupabaseWineService(supabaseWith(from))
    const history = await wines.getPurchaseHistory('w1')
    expect(history.map((h) => h.invoiceId)).toEqual(['inv2', 'inv1'])
    expect(history[0].vendorName).toBe('Raw')
    expect(history[1].vendorName).toBe('Real Vendor')
  })
})
