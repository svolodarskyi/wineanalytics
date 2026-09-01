// Full historical demo dataset for the real Supabase project: wines,
// vendors, pour sizes, ~5 months of approved invoices, and months of
// manually-recorded sales - so there's real data to build inventory/sales
// analytics against. Mirrors src/services/mock/seedActivity.ts's logic,
// but writes directly to the real wine_* tables via the service-role key
// (bypasses RLS) instead of the in-memory mock store.
//
// DESTRUCTIVE: wipes every row in the tables below before reseeding, so the
// dataset is internally coherent (sales reference real purchased quantities,
// etc.) rather than layered on top of whatever was there before. Does NOT
// touch wine_openai_logs (unrelated to this seed) or Supabase Auth users.
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
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function randomPick(items) {
  return items[Math.floor(Math.random() * items.length)]
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function daysAgoAt(days, hour, minute) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return date
}

function baseCostForCategory(category) {
  switch (category) {
    case 'sparkling':
      return 24
    case 'dessert':
      return 30
    case 'fortified':
      return 26
    case 'red':
      return 20
    case 'rose':
      return 16
    case 'white':
      return 15
    default:
      return 18
  }
}

function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const WINES = [
  { name: 'Chateau Ste. Michelle Riesling', country: 'USA', category: 'white', volume_ml: 750 },
  { name: 'Caymus Cabernet Sauvignon', country: 'USA', category: 'red', volume_ml: 750 },
  { name: 'Kim Crawford Sauvignon Blanc', country: 'New Zealand', category: 'white', volume_ml: 750 },
  { name: 'Veuve Clicquot Brut', country: 'France', category: 'sparkling', volume_ml: 750 },
  { name: 'Antinori Tignanello', country: 'Italy', category: 'red', volume_ml: 750 },
  { name: 'La Crema Pinot Noir', country: 'USA', category: 'red', volume_ml: 750 },
  { name: 'Whispering Angel Rose', country: 'France', category: 'rose', volume_ml: 750 },
  { name: "Chateau d'Yquem Sauternes", country: 'France', category: 'dessert', volume_ml: 375 },
  { name: 'Taylor Fladgate 20 Year Tawny Port', country: 'Portugal', category: 'fortified', volume_ml: 750 },
  { name: 'Domaine Serene Pinot Noir', country: 'USA', category: 'red', volume_ml: 750 },
  { name: 'Josh Cellars Cabernet', country: 'USA', category: 'red', volume_ml: 750 },
  // No volume_ml - exercises the data-quality alert and the purchased-only balance fallback.
  { name: 'Chandon Brut Rose', country: 'USA', category: 'sparkling', volume_ml: null },
]

const VENDORS = ['Winebow Imports', "Southern Glazer's Wine & Spirits", 'Vintner Select', 'Empire Merchants']

const POUR_SIZES = [
  { name: 'Taste', volume_ml: 75 },
  { name: 'Glass', volume_ml: 150 },
]

/**
 * Probes whether wine_sales.amount exists yet (migration
 * 20260907000000_wine_sales_amount.sql may not be applied). Inserts and
 * immediately deletes a throwaway row rather than querying information_schema,
 * since the anon/service client has no direct SQL access.
 */
async function hasAmountColumn() {
  const probeId = crypto.randomUUID()
  const { error } = await supabase
    .from('wine_sales')
    .insert({ id: probeId, wine_id: NIL_UUID, volume_ml: 1, quantity: 1, amount: 1, sold_at: new Date().toISOString(), source: 'manual' })
  // A FK violation means the row shape (incl. amount) was accepted - only a
  // missing-column/schema-cache error means the column truly doesn't exist.
  if (!error) {
    await supabase.from('wine_sales').delete().eq('id', probeId)
    return true
  }
  return !/could not find the 'amount' column/i.test(error.message)
}

async function wipe() {
  const tables = [
    'wine_invoice_additional_charges',
    'wine_invoice_line_items',
    'wine_sales',
    'wine_alert_thresholds',
    'wine_sales_alert_settings',
    'wine_invoices',
    'wine_wines',
    'wine_vendors',
    'wine_pour_sizes',
  ]
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().neq('id', NIL_UUID)
    if (error) throw new Error(`Wiping ${table} failed: ${error.message}`)
  }
  console.log('Wiped existing rows in:', tables.join(', '))
}

async function insertMasterData() {
  const { data: wines, error: wineError } = await supabase
    .from('wine_wines')
    .insert(WINES.map((w) => ({ ...w, active: true })))
    .select('id, name, category, volume_ml')
  if (wineError) throw new Error(`Seeding wines failed: ${wineError.message}`)

  const { data: vendors, error: vendorError } = await supabase
    .from('wine_vendors')
    .insert(VENDORS.map((name) => ({ name, active: true })))
    .select('id, name')
  if (vendorError) throw new Error(`Seeding vendors failed: ${vendorError.message}`)

  const { data: pourSizes, error: pourSizeError } = await supabase
    .from('wine_pour_sizes')
    .insert(POUR_SIZES.map((p) => ({ ...p, active: true })))
    .select('id, name, volume_ml')
  if (pourSizeError) throw new Error(`Seeding pour sizes failed: ${pourSizeError.message}`)

  console.log(`Seeded ${wines.length} wines, ${vendors.length} vendors, ${pourSizes.length} pour sizes.`)
  return { wines, vendors, pourSizes }
}

async function insertInvoicesAndCollectPurchases(wines, vendors) {
  const unitCostByWineId = new Map(wines.map((w) => [w.id, baseCostForCategory(w.category) * (0.85 + Math.random() * 0.3)]))
  const purchasedBottlesByWineId = new Map()

  const weekCount = 20
  for (let week = weekCount; week >= 1; week--) {
    const vendor = vendors[week % vendors.length]
    const invoiceWines = shuffle(wines).slice(0, randomInt(2, 4))
    const lineItems = invoiceWines.map((wine) => {
      const quantity = randomInt(3, 12)
      const unitPrice = round2(unitCostByWineId.get(wine.id) * (0.95 + Math.random() * 0.1))
      purchasedBottlesByWineId.set(wine.id, (purchasedBottlesByWineId.get(wine.id) ?? 0) + quantity)
      return { wine, quantity, unitPrice, lineTotal: round2(quantity * unitPrice) }
    })

    const invoiceDate = daysAgoAt(week * 7 - randomInt(0, 2), randomInt(8, 11), randomInt(0, 59))
    const invoiceDateIso = invoiceDate.toISOString()

    const { data: invoiceRow, error: invoiceError } = await supabase
      .from('wine_invoices')
      .insert({
        file_name: `invoice-${week}.pdf`,
        file_type: 'pdf',
        file_path: `seed/invoice-${week}.pdf`,
        uploaded_at: invoiceDateIso,
        status: 'approved',
        approved_at: invoiceDateIso,
        invoice_date: invoiceDateIso.slice(0, 10),
        total_amount: round2(lineItems.reduce((sum, l) => sum + l.lineTotal, 0)),
        vendor_name_raw: vendor.name,
        vendor_id: vendor.id,
        vendor_confidence: 'high',
        vendor_match_status: 'confirmed',
      })
      .select('id')
      .single()
    if (invoiceError) throw new Error(`Seeding invoice failed: ${invoiceError.message}`)

    const { error: lineError } = await supabase.from('wine_invoice_line_items').insert(
      lineItems.map((l) => ({
        invoice_id: invoiceRow.id,
        item_name_raw: l.wine.name,
        volume_ml_raw: l.wine.volume_ml,
        category_raw: l.wine.category,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        line_total: l.lineTotal,
        wine_id: l.wine.id,
        sku_confidence: 'high',
        sku_match_status: 'confirmed',
      })),
    )
    if (lineError) throw new Error(`Seeding invoice line items failed: ${lineError.message}`)
  }

  // One recent upload still waiting on approval.
  const pendingWine = randomPick(wines)
  const pendingDate = daysAgoAt(2, 14, 30).toISOString()
  const { data: pendingInvoice, error: pendingInvoiceError } = await supabase
    .from('wine_invoices')
    .insert({
      file_name: 'invoice-pending.pdf',
      file_type: 'pdf',
      file_path: 'seed/invoice-pending.pdf',
      uploaded_at: pendingDate,
      status: 'not_approved',
      invoice_date: pendingDate.slice(0, 10),
      total_amount: 210,
      vendor_name_raw: vendors[0].name,
      vendor_id: vendors[0].id,
      vendor_confidence: 'high',
      vendor_match_status: 'suggested',
    })
    .select('id')
    .single()
  if (pendingInvoiceError) throw new Error(`Seeding pending invoice failed: ${pendingInvoiceError.message}`)

  const { error: pendingLineError } = await supabase.from('wine_invoice_line_items').insert({
    invoice_id: pendingInvoice.id,
    item_name_raw: pendingWine.name,
    volume_ml_raw: pendingWine.volume_ml,
    category_raw: pendingWine.category,
    quantity: 6,
    unit_price: 35,
    line_total: 210,
    wine_id: pendingWine.id,
    sku_confidence: 'high',
    sku_match_status: 'suggested',
  })
  if (pendingLineError) throw new Error(`Seeding pending invoice line item failed: ${pendingLineError.message}`)

  console.log(`Seeded ${weekCount} approved invoices + 1 pending invoice.`)
  return { unitCostByWineId, purchasedBottlesByWineId }
}

async function insertSales(wines, pourSizes, unitCostByWineId, purchasedBottlesByWineId, includeAmount) {
  const tastePourSize = pourSizes.find((p) => p.name === 'Taste') ?? null
  const glassPourSize = pourSizes.find((p) => p.name === 'Glass') ?? null
  const oversoldWineId = wines[0]?.id

  const sales = []
  for (const wine of wines) {
    const purchasedBottles = purchasedBottlesByWineId.get(wine.id) ?? 0
    if (purchasedBottles === 0) continue

    const sellThroughRate = wine.id === oversoldWineId ? 1.15 : 0.35 + Math.random() * 0.45
    const bottleMenuPrice = round2(unitCostByWineId.get(wine.id) * (2.2 + Math.random() * 0.4))
    const wineVolumeMl = wine.volume_ml ?? 750

    let remainingMl = purchasedBottles * sellThroughRate * wineVolumeMl
    let guard = 0
    while (remainingMl > 0 && guard < 400) {
      guard += 1
      const daysBack = randomInt(0, 89)
      const isEvening = Math.random() < 0.7
      const hour = isEvening ? randomInt(17, 22) : randomInt(11, 16)
      const soldAt = daysAgoAt(daysBack, hour, randomInt(0, 59)).toISOString()

      const mode = wine.volume_ml ? randomPick(['taste', 'glass', 'glass', 'bottle']) : randomPick(['taste', 'glass'])
      const quantity = Math.random() < 0.85 ? 1 : 2

      let volumeMl
      let pourSizeId
      let unitPrice
      if (mode === 'taste' && tastePourSize) {
        volumeMl = tastePourSize.volume_ml
        pourSizeId = tastePourSize.id
        unitPrice = round2(bottleMenuPrice / 8)
      } else if (mode === 'glass' && glassPourSize) {
        volumeMl = glassPourSize.volume_ml
        pourSizeId = glassPourSize.id
        unitPrice = round2(bottleMenuPrice / 4.2)
      } else {
        volumeMl = wineVolumeMl
        pourSizeId = null
        unitPrice = bottleMenuPrice
      }

      sales.push({
        wine_id: wine.id,
        pour_size_id: pourSizeId,
        volume_ml: volumeMl,
        quantity,
        ...(includeAmount ? { amount: round2(unitPrice * quantity) } : {}),
        sold_at: soldAt,
        source: 'manual',
      })
      remainingMl -= volumeMl * quantity
    }
  }

  // Two deliberately out-of-range pours, so the Sales Quality threshold has something to flag.
  const anomalyWine = wines.find((w) => w.id !== oversoldWineId) ?? wines[0]
  if (anomalyWine) {
    sales.push(
      {
        wine_id: anomalyWine.id,
        pour_size_id: null,
        volume_ml: 10,
        quantity: 1,
        ...(includeAmount ? { amount: 4 } : {}),
        sold_at: daysAgoAt(5, 19, 15).toISOString(),
        source: 'manual',
      },
      {
        wine_id: anomalyWine.id,
        pour_size_id: null,
        volume_ml: 2500,
        quantity: 1,
        ...(includeAmount
          ? { amount: round2((unitCostByWineId.get(anomalyWine.id) ?? 20) * 2.4 * (2500 / (anomalyWine.volume_ml ?? 750))) }
          : {}),
        sold_at: daysAgoAt(12, 20, 45).toISOString(),
        source: 'manual',
      },
    )
  }

  // Insert in batches - Supabase/PostgREST can choke on very large single inserts.
  const BATCH_SIZE = 200
  for (let i = 0; i < sales.length; i += BATCH_SIZE) {
    const { error } = await supabase.from('wine_sales').insert(sales.slice(i, i + BATCH_SIZE))
    if (error) throw new Error(`Seeding sales failed: ${error.message}`)
  }
  console.log(`Seeded ${sales.length} sales.`)

  if (oversoldWineId) {
    const { error } = await supabase.from('wine_alert_thresholds').insert({ wine_id: oversoldWineId, min_bottles: 6 })
    if (error) throw new Error(`Seeding alert threshold failed: ${error.message}`)
    console.log('Seeded 1 inventory alert threshold on the intentionally oversold wine.')
  }
}

const includeAmount = await hasAmountColumn()
if (!includeAmount) {
  console.warn(
    "wine_sales.amount doesn't exist yet (run supabase/migrations/20260907000000_wine_sales_amount.sql in the SQL Editor) - seeding sales without dollar amounts for now. Re-run this script after applying it to backfill amounts.",
  )
}

await wipe()
const { wines, vendors, pourSizes } = await insertMasterData()
const { unitCostByWineId, purchasedBottlesByWineId } = await insertInvoicesAndCollectPurchases(wines, vendors)
await insertSales(wines, pourSizes, unitCostByWineId, purchasedBottlesByWineId, includeAmount)
console.log('Done.')
