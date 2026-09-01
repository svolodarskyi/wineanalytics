// One-time seed: ports src/services/mock/seedData.ts's demo wines/vendors
// into the real wine_wines/wine_vendors tables. Uses SUPABASE_SECRET_KEY
// (server-side only, bypasses RLS) - never run this from client code.
//
// Usage: node scripts/seed-supabase.mjs

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const match = line.match(/^([A-Z_]+)=(.*)$/)
  if (match) process.env[match[1]] = match[2]
}

const url = process.env.VITE_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!url || !secretKey) {
  console.error('VITE_SUPABASE_URL and SUPABASE_SECRET_KEY must both be set in .env')
  process.exit(1)
}

const supabase = createClient(url, secretKey)

const WINES = [
  { name: 'Chateau Ste. Michelle Riesling', country: 'USA' },
  { name: 'Caymus Cabernet Sauvignon', country: 'USA' },
  { name: 'Kim Crawford Sauvignon Blanc', country: 'New Zealand' },
  { name: 'Veuve Clicquot Brut', country: 'France' },
  { name: 'Antinori Tignanello', country: 'Italy' },
  { name: 'La Crema Pinot Noir', country: 'USA' },
]

const VENDORS = ["Winebow Imports", "Southern Glazer's Wine & Spirits", 'Vintner Select']

const { data: existingWines, error: existingWinesError } = await supabase.from('wine_wines').select('id')
if (existingWinesError) throw new Error(`Checking existing wines failed: ${existingWinesError.message}`)
const { data: existingVendors, error: existingVendorsError } = await supabase.from('wine_vendors').select('id')
if (existingVendorsError) throw new Error(`Checking existing vendors failed: ${existingVendorsError.message}`)

if (existingWines.length > 0 || existingVendors.length > 0) {
  console.log(
    `Tables already have data (${existingWines.length} wines, ${existingVendors.length} vendors) - skipping to avoid duplicates. Delete existing rows first if you want to reseed.`,
  )
  process.exit(0)
}

const { error: wineError } = await supabase.from('wine_wines').insert(WINES.map((w) => ({ ...w, active: true })))
if (wineError) throw new Error(`Seeding wines failed: ${wineError.message}`)
console.log(`Seeded ${WINES.length} wines.`)

const { error: vendorError } = await supabase.from('wine_vendors').insert(VENDORS.map((name) => ({ name, active: true })))
if (vendorError) throw new Error(`Seeding vendors failed: ${vendorError.message}`)
console.log(`Seeded ${VENDORS.length} vendors.`)
