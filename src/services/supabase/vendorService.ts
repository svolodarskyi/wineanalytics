import type { SupabaseClient } from '@supabase/supabase-js'
import type { Vendor } from '../../types'
import type { ListOptions, VendorService } from '../types'

interface VendorRow {
  id: string
  name: string
  invoice_name: string | null
  active: boolean
  created_at: string
}

function fromRow(row: VendorRow): Vendor {
  return {
    id: row.id,
    name: row.name,
    invoiceName: row.invoice_name,
    active: row.active,
    createdAt: row.created_at,
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseVendorService(supabase: SupabaseClient): VendorService {
  return {
    async list(options?: ListOptions): Promise<Vendor[]> {
      let query = supabase.from('wine_vendors').select('*').order('name', { ascending: true })
      if (!options?.includeInactive) {
        query = query.eq('active', true)
      }
      if (options?.query?.trim()) {
        query = query.ilike('name', `%${options.query.trim()}%`)
      }
      const { data, error } = await query
      throwIfError(error)
      return (data as VendorRow[]).map(fromRow)
    },

    async get(id: string): Promise<Vendor | null> {
      const { data, error } = await supabase.from('wine_vendors').select('*').eq('id', id).maybeSingle()
      throwIfError(error)
      return data ? fromRow(data as VendorRow) : null
    },

    async create(input: { name: string; invoiceName?: string | null }): Promise<Vendor> {
      const name = input.name.trim()
      if (!name) throw new Error('Vendor name is required.')
      const { data, error } = await supabase
        .from('wine_vendors')
        .insert({ name, invoice_name: input.invoiceName?.trim() || null })
        .select('*')
        .single()
      if (error) {
        if (error.code === '23505') throw new Error(`A vendor named "${name}" already exists.`)
        throw new Error(error.message)
      }
      return fromRow(data as VendorRow)
    },

    async update(id: string, input: { name: string; invoiceName?: string | null }): Promise<Vendor> {
      const name = input.name.trim()
      if (!name) throw new Error('Vendor name is required.')
      const { data, error } = await supabase
        .from('wine_vendors')
        .update({ name, invoice_name: input.invoiceName?.trim() || null })
        .eq('id', id)
        .select('*')
        .maybeSingle()
      if (error) {
        if (error.code === '23505') throw new Error(`A vendor named "${name}" already exists.`)
        throw new Error(error.message)
      }
      if (!data) throw new Error('Vendor not found.')
      return fromRow(data as VendorRow)
    },

    async setActive(id: string, active: boolean): Promise<Vendor> {
      const { data, error } = await supabase.from('wine_vendors').update({ active }).eq('id', id).select('*').maybeSingle()
      throwIfError(error)
      if (!data) throw new Error('Vendor not found.')
      return fromRow(data as VendorRow)
    },

    async delete(id: string): Promise<void> {
      const { count, error: countError } = await supabase
        .from('wine_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('vendor_id', id)
      throwIfError(countError)
      if (count && count > 0) {
        throw new Error('This vendor has invoice history and cannot be deleted. Deactivate it instead.')
      }
      const { error } = await supabase.from('wine_vendors').delete().eq('id', id)
      throwIfError(error)
    },
  }
}
