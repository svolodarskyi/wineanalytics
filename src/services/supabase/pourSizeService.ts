import type { SupabaseClient } from '@supabase/supabase-js'
import type { PourSize } from '../../types'
import type { ListOptions, PourSizeService } from '../types'

interface PourSizeRow {
  id: string
  name: string
  volume_ml: number
  active: boolean
  created_at: string
}

function fromRow(row: PourSizeRow): PourSize {
  return { id: row.id, name: row.name, volumeMl: row.volume_ml, active: row.active, createdAt: row.created_at }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabasePourSizeService(supabase: SupabaseClient): PourSizeService {
  return {
    async list(options?: ListOptions): Promise<PourSize[]> {
      let query = supabase.from('wine_pour_sizes').select('*').order('volume_ml', { ascending: true })
      if (!options?.includeInactive) {
        query = query.eq('active', true)
      }
      if (options?.query?.trim()) {
        query = query.ilike('name', `%${options.query.trim()}%`)
      }
      const { data, error } = await query
      throwIfError(error)
      return (data as PourSizeRow[]).map(fromRow)
    },

    async get(id: string): Promise<PourSize | null> {
      const { data, error } = await supabase.from('wine_pour_sizes').select('*').eq('id', id).maybeSingle()
      throwIfError(error)
      return data ? fromRow(data as PourSizeRow) : null
    },

    async create(input: { name: string; volumeMl: number }): Promise<PourSize> {
      const name = input.name.trim()
      if (!name) throw new Error('Pour size name is required.')
      if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
        throw new Error('Volume must be a positive number.')
      }
      const { data, error } = await supabase
        .from('wine_pour_sizes')
        .insert({ name, volume_ml: Math.round(input.volumeMl) })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error(`A pour size named "${name}" already exists.`)
        throw new Error(error.message)
      }
      return fromRow(data as PourSizeRow)
    },

    async update(id: string, input: { name: string; volumeMl: number }): Promise<PourSize> {
      const name = input.name.trim()
      if (!name) throw new Error('Pour size name is required.')
      if (!Number.isFinite(input.volumeMl) || input.volumeMl <= 0) {
        throw new Error('Volume must be a positive number.')
      }
      const { data, error } = await supabase
        .from('wine_pour_sizes')
        .update({ name, volume_ml: Math.round(input.volumeMl) })
        .eq('id', id)
        .select('*')
        .maybeSingle()
      if (error) {
        if (error.code === '23505') throw new Error(`A pour size named "${name}" already exists.`)
        throw new Error(error.message)
      }
      if (!data) throw new Error('Pour size not found.')
      return fromRow(data as PourSizeRow)
    },

    async setActive(id: string, active: boolean): Promise<PourSize> {
      const { data, error } = await supabase
        .from('wine_pour_sizes')
        .update({ active })
        .eq('id', id)
        .select('*')
        .maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Pour size not found.')
      return fromRow(data as PourSizeRow)
    },

    async delete(id: string): Promise<void> {
      const { count, error: countError } = await supabase
        .from('wine_sales')
        .select('id', { count: 'exact', head: true })
        .eq('pour_size_id', id)
      throwIfError(countError)
      if (count && count > 0) {
        throw new Error('This pour size has sale history and cannot be deleted. Deactivate it instead.')
      }
      const { error } = await supabase.from('wine_pour_sizes').delete().eq('id', id)
      throwIfError(error)
    },
  }
}
