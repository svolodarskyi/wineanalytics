import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabaseSaleService } from '../saleService'
import { fakeQueryBuilder } from './testHelpers'

const SALE_ROW = {
  id: 's1',
  wine_id: 'w1',
  pour_size_id: null,
  volume_ml: 750,
  quantity: 1,
  amount: null,
  sold_at: '2026-01-01T00:00:00.000Z',
  source: 'manual' as const,
  created_at: '2026-01-01T00:00:00.000Z',
}

function supabaseWith(from: (table: string) => unknown): SupabaseClient {
  return { from } as unknown as SupabaseClient
}

describe('supabase sale service', () => {
  it('lists a wine\'s sales, mapping snake_case columns to the app shape', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: [SALE_ROW] }))
    const sales = createSupabaseSaleService(supabaseWith(from))
    const result = await sales.list('w1')
    expect(result).toEqual([
      {
        id: 's1',
        wineId: 'w1',
        pourSizeId: null,
        volumeMl: 750,
        quantity: 1,
        amount: null,
        soldAt: SALE_ROW.sold_at,
        source: 'manual',
        createdAt: SALE_ROW.created_at,
      },
    ])
    expect(from).toHaveBeenCalledWith('wine_sales')
  })

  it('create resolves the pour size\'s own volume when pourSizeId is given', async () => {
    const pourSizeLookup = fakeQueryBuilder({ data: { id: 'p1', volume_ml: 150 } })
    const insertBuilder = fakeQueryBuilder({ data: { ...SALE_ROW, pour_size_id: 'p1', volume_ml: 150 } })
    const from = vi.fn().mockReturnValueOnce(pourSizeLookup).mockReturnValueOnce(insertBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))

    const sale = await sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, pourSizeId: 'p1' })
    expect(sale.volumeMl).toBe(150)
    expect(from).toHaveBeenNthCalledWith(1, 'wine_pour_sizes')
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ pour_size_id: 'p1', volume_ml: 150, quantity: 1, source: 'manual' }),
    )
  })

  it('create rejects when the given pour size does not exist', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: null }))
    const sales = createSupabaseSaleService(supabaseWith(from))
    await expect(sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, pourSizeId: 'missing' })).rejects.toThrow(
      /pour size not found/i,
    )
  })

  it('create uses a raw volumeMl directly when no pourSizeId is given', async () => {
    const insertBuilder = fakeQueryBuilder({ data: SALE_ROW })
    const from = vi.fn(() => insertBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))
    await sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 750 })
    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({ pour_size_id: null, volume_ml: 750, quantity: 1 }),
    )
  })

  it('create passes a given quantity through to the insert payload', async () => {
    const insertBuilder = fakeQueryBuilder({ data: { ...SALE_ROW, quantity: 3 } })
    const from = vi.fn(() => insertBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))
    const sale = await sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 150, quantity: 3 })
    expect(sale.quantity).toBe(3)
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ quantity: 3 }))
  })

  it('create passes a given amount through to the insert payload, mapping it back as a number', async () => {
    const insertBuilder = fakeQueryBuilder({ data: { ...SALE_ROW, amount: '42.50' } })
    const from = vi.fn(() => insertBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))
    const sale = await sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 750, amount: 42.5 })
    expect(sale.amount).toBe(42.5)
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 42.5 }))
  })

  it('create defaults amount to null when not given', async () => {
    const insertBuilder = fakeQueryBuilder({ data: SALE_ROW })
    const from = vi.fn(() => insertBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))
    await sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 750 })
    expect(insertBuilder.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: null }))
  })

  it('create rejects a negative amount without hitting the database', async () => {
    const from = vi.fn()
    const sales = createSupabaseSaleService(supabaseWith(from))
    await expect(
      sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 750, amount: -5 }),
    ).rejects.toThrow(/non-negative/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('create rejects a non-positive or non-integer quantity without hitting the database', async () => {
    const from = vi.fn()
    const sales = createSupabaseSaleService(supabaseWith(from))
    await expect(
      sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 750, quantity: 0 }),
    ).rejects.toThrow(/positive whole number/i)
    await expect(
      sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 750, quantity: 1.5 }),
    ).rejects.toThrow(/positive whole number/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('create rejects a non-positive custom volume', async () => {
    const sales = createSupabaseSaleService(supabaseWith(vi.fn()))
    await expect(sales.create({ wineId: 'w1', soldAt: SALE_ROW.sold_at, volumeMl: 0 })).rejects.toThrow(
      /positive number/i,
    )
  })

  it('create maps a foreign-key violation to "Wine not found."', async () => {
    const insertBuilder = fakeQueryBuilder({ error: { message: 'violates foreign key constraint', code: '23503' } })
    const from = vi.fn(() => insertBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))
    await expect(sales.create({ wineId: 'missing-wine', soldAt: SALE_ROW.sold_at, volumeMl: 750 })).rejects.toThrow(
      /wine not found/i,
    )
  })

  it('deletes a sale by id', async () => {
    const deleteBuilder = fakeQueryBuilder({})
    const from = vi.fn(() => deleteBuilder)
    const sales = createSupabaseSaleService(supabaseWith(from))
    await sales.delete('s1')
    expect(deleteBuilder.delete).toHaveBeenCalled()
    expect(deleteBuilder.eq).toHaveBeenCalledWith('id', 's1')
  })
})
