import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createSupabasePourSizeService } from '../pourSizeService'
import { fakeQueryBuilder } from './testHelpers'

const ROW = {
  id: 'p1',
  name: 'Glass',
  volume_ml: 150,
  active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

function supabaseWith(from: (table: string) => unknown): SupabaseClient {
  return { from } as unknown as SupabaseClient
}

describe('supabase pour size service', () => {
  it('lists pour sizes, mapping snake_case columns to the app shape', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: [ROW] }))
    const pourSizes = createSupabasePourSizeService(supabaseWith(from))
    const result = await pourSizes.list()
    expect(result).toEqual([{ id: 'p1', name: 'Glass', volumeMl: 150, active: true, createdAt: ROW.created_at }])
    expect(from).toHaveBeenCalledWith('wine_pour_sizes')
  })

  it('create rejects a blank name or non-positive volume without hitting the database', async () => {
    const from = vi.fn()
    const pourSizes = createSupabasePourSizeService(supabaseWith(from))
    await expect(pourSizes.create({ name: '  ', volumeMl: 150 })).rejects.toThrow(/required/i)
    await expect(pourSizes.create({ name: 'Glass', volumeMl: 0 })).rejects.toThrow(/positive/i)
    expect(from).not.toHaveBeenCalled()
  })

  it('create surfaces a friendly error on a unique-constraint violation', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ error: { message: 'duplicate key', code: '23505' } }))
    const pourSizes = createSupabasePourSizeService(supabaseWith(from))
    await expect(pourSizes.create({ name: 'Glass', volumeMl: 150 })).rejects.toThrow(/already exists/i)
  })

  it('update maps the row back after a successful update', async () => {
    const from = vi.fn(() => fakeQueryBuilder({ data: { ...ROW, volume_ml: 200 } }))
    const pourSizes = createSupabasePourSizeService(supabaseWith(from))
    const updated = await pourSizes.update('p1', { name: 'Glass', volumeMl: 200 })
    expect(updated.volumeMl).toBe(200)
  })

  it('delete blocks when the pour size has sale history, without deleting', async () => {
    const countBuilder = fakeQueryBuilder({ count: 2 })
    const from = vi.fn(() => countBuilder)
    const pourSizes = createSupabasePourSizeService(supabaseWith(from))
    await expect(pourSizes.delete('p1')).rejects.toThrow(/sale history/i)
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('wine_sales')
  })

  it('delete proceeds when there is no sale history', async () => {
    const countBuilder = fakeQueryBuilder({ count: 0 })
    const deleteBuilder = fakeQueryBuilder({})
    const from = vi.fn().mockReturnValueOnce(countBuilder).mockReturnValueOnce(deleteBuilder)
    const pourSizes = createSupabasePourSizeService(supabaseWith(from))
    await pourSizes.delete('p1')
    expect(from).toHaveBeenNthCalledWith(1, 'wine_sales')
    expect(from).toHaveBeenNthCalledWith(2, 'wine_pour_sizes')
    expect(deleteBuilder.delete).toHaveBeenCalled()
  })
})
