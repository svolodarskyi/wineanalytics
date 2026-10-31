import type { Invoice, InvoiceLineItem, PourSize, Vendor, Wine, WineAlertThreshold, WineCategory, WineSale } from '../../types'
import { createId } from './ids'

function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function randomPick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function daysAgoAt(days: number, hour: number, minute: number): Date {
  const date = new Date()
  date.setDate(date.getDate() - days)
  date.setHours(hour, minute, 0, 0)
  return date
}

/** What a wine of this category roughly costs per bottle on an invoice - just enough variety for realistic-looking analytics, not a real price list. */
function baseCostForCategory(category: WineCategory | null): number {
  switch (category) {
    case 'wine':
      return 20
    case 'hard_liquor':
      return 26
    case 'sake':
      return 22
    case 'beer':
      return 15
    default:
      return 18
  }
}

/**
 * Generates a few months of already-approved invoices and manually-recorded
 * sales against the seeded wine/vendor/pour-size master data, so the app has
 * something to build inventory and sales analytics against out of the box.
 * Only used when MockStoreOptions.seedActivity is true - the default `seed`
 * flag alone still yields empty invoices/sales, which several tests rely on.
 */
export function seedInvoicesAndSales(
  wines: Wine[],
  vendors: Vendor[],
  pourSizes: PourSize[],
): { invoices: Invoice[]; sales: WineSale[]; alertThresholds: WineAlertThreshold[] } {
  if (wines.length === 0 || vendors.length === 0) return { invoices: [], sales: [], alertThresholds: [] }

  const unitCostByWineId = new Map(wines.map((wine) => [wine.id, baseCostForCategory(wine.category) * (0.85 + Math.random() * 0.3)]))
  const purchasedBottlesByWineId = new Map<string, number>()

  // Roughly one delivery a week for the last ~20 weeks plus one already this
  // week, 2-4 wines per invoice - the week-0 delivery keeps "spend this
  // month" non-empty out of the box instead of only ever showing prior months.
  const invoices: Invoice[] = []
  const weekCount = 20
  for (let week = weekCount; week >= 0; week--) {
    const vendor = vendors[week % vendors.length]
    const invoiceWines = shuffle(wines).slice(0, randomInt(2, 4))
    const lineItems: InvoiceLineItem[] = invoiceWines.map((wine) => {
      const quantity = randomInt(3, 12)
      const unitPrice = round2(unitCostByWineId.get(wine.id)! * (0.95 + Math.random() * 0.1))
      purchasedBottlesByWineId.set(wine.id, (purchasedBottlesByWineId.get(wine.id) ?? 0) + quantity)
      return {
        id: createId('line'),
        itemNameRaw: wine.invoiceName ?? wine.name,
        volumeMlRaw: wine.volumeMl,
        categoryRaw: wine.category,
        quantity,
        unitPrice,
        lineTotal: round2(quantity * unitPrice),
        packSize: 1,
        skuMatch: { wineId: wine.id, confidence: 'high', status: 'confirmed' },
        excluded: false,
      }
    })

    const invoiceDate = daysAgoAt(Math.max(0, week * 7 - randomInt(0, 2)), randomInt(8, 11), randomInt(0, 59))
    const invoiceDateIso = invoiceDate.toISOString()
    invoices.push({
      id: createId('invoice'),
      fileName: `invoice-${week}.pdf`,
      fileType: 'pdf',
      fileDataUrl: 'data:application/pdf;base64,AA==',
      uploadedAt: invoiceDateIso,
      status: 'approved',
      approvedAt: invoiceDateIso,
      extracted: {
        invoiceDate: invoiceDateIso,
        totalAmount: round2(lineItems.reduce((sum, line) => sum + line.lineTotal, 0)),
        vendorMatch: { vendorNameRaw: vendor.name, vendorId: vendor.id, confidence: 'high', status: 'confirmed' },
        additionalCharges: [],
      },
      lineItems,
    })
  }

  // One recent upload still waiting on approval, so the "invoices waiting for approval" notice has something to show.
  const pendingWine = randomPick(wines)
  const pendingDate = daysAgoAt(2, 14, 30).toISOString()
  invoices.push({
    id: createId('invoice'),
    fileName: 'invoice-pending.pdf',
    fileType: 'pdf',
    fileDataUrl: 'data:application/pdf;base64,AA==',
    uploadedAt: pendingDate,
    status: 'not_approved',
    approvedAt: null,
    extracted: {
      invoiceDate: pendingDate,
      totalAmount: 210,
      vendorMatch: { vendorNameRaw: vendors[0].name, vendorId: vendors[0].id, confidence: 'high', status: 'suggested' },
      additionalCharges: [],
    },
    lineItems: [
      {
        id: createId('line'),
        itemNameRaw: pendingWine.invoiceName ?? pendingWine.name,
        volumeMlRaw: pendingWine.volumeMl,
        categoryRaw: pendingWine.category,
        quantity: 6,
        unitPrice: 35,
        lineTotal: 210,
        packSize: 1,
        skuMatch: { wineId: pendingWine.id, confidence: 'high', status: 'suggested' },
        excluded: false,
      },
    ],
  })

  const tastePourSize = pourSizes.find((p) => p.name === 'Taste') ?? null
  const glassPourSize = pourSizes.find((p) => p.name === 'Glass') ?? null

  // Sell most of each wine's purchased volume back off over ~90 days, so
  // Ending Bottles settles at a plausible non-zero (sometimes low, sometimes
  // negative) number instead of the full purchased amount. One wine is
  // deliberately oversold to give the Inventory Alerts demo something to flag.
  const oversoldWineId = wines[0]?.id
  const sales: WineSale[] = []

  for (const wine of wines) {
    const purchasedBottles = purchasedBottlesByWineId.get(wine.id) ?? 0
    if (purchasedBottles === 0) continue

    const sellThroughRate = wine.id === oversoldWineId ? 1.15 : 0.35 + Math.random() * 0.45
    const bottleMenuPrice = round2(unitCostByWineId.get(wine.id)! * (2.2 + Math.random() * 0.4))
    const wineVolumeMl = wine.volumeMl ?? 750

    let remainingMl = purchasedBottles * sellThroughRate * wineVolumeMl
    let guard = 0
    while (remainingMl > 0 && guard < 400) {
      guard += 1
      const daysBack = randomInt(0, 89)
      const isEvening = Math.random() < 0.7
      const hour = isEvening ? randomInt(17, 22) : randomInt(11, 16)
      const soldAt = daysAgoAt(daysBack, hour, randomInt(0, 59)).toISOString()

      // Wines with no volumeMl can't offer a "full bottle" shortcut, so they only ever get poured/custom sales.
      const mode = wine.volumeMl
        ? randomPick<'taste' | 'glass' | 'bottle'>(['taste', 'glass', 'glass', 'bottle'])
        : randomPick<'taste' | 'glass'>(['taste', 'glass'])
      const quantity = Math.random() < 0.85 ? 1 : 2

      let volumeMl: number
      let pourSizeId: string | null
      let unitPrice: number
      if (mode === 'taste' && tastePourSize) {
        volumeMl = tastePourSize.volumeMl
        pourSizeId = tastePourSize.id
        unitPrice = round2(bottleMenuPrice / 8)
      } else if (mode === 'glass' && glassPourSize) {
        volumeMl = glassPourSize.volumeMl
        pourSizeId = glassPourSize.id
        unitPrice = round2(bottleMenuPrice / 4.2)
      } else {
        volumeMl = wineVolumeMl
        pourSizeId = null
        unitPrice = bottleMenuPrice
      }

      sales.push({
        id: createId('sale'),
        wineId: wine.id,
        pourSizeId,
        volumeMl,
        quantity,
        amount: round2(unitPrice * quantity),
        soldAt,
        source: 'manual',
        createdAt: soldAt,
      })

      remainingMl -= volumeMl * quantity
    }
  }

  // A couple of deliberately out-of-range pours, so configuring the Sales
  // Quality threshold has something to actually flag.
  const anomalyWine = wines.find((w) => w.id !== oversoldWineId) ?? wines[0]
  if (anomalyWine) {
    const tinyPourAt = daysAgoAt(5, 19, 15).toISOString()
    const hugePourAt = daysAgoAt(12, 20, 45).toISOString()
    sales.push(
      {
        id: createId('sale'),
        wineId: anomalyWine.id,
        pourSizeId: null,
        volumeMl: 10,
        quantity: 1,
        amount: 4,
        soldAt: tinyPourAt,
        source: 'manual',
        createdAt: tinyPourAt,
      },
      {
        id: createId('sale'),
        wineId: anomalyWine.id,
        pourSizeId: null,
        volumeMl: 2500,
        quantity: 1,
        amount: round2((unitCostByWineId.get(anomalyWine.id) ?? 20) * 2.4 * (2500 / (anomalyWine.volumeMl ?? 750))),
        soldAt: hugePourAt,
        source: 'manual',
        createdAt: hugePourAt,
      },
    )
  }

  sales.sort((a, b) => b.soldAt.localeCompare(a.soldAt))

  // Give the oversold wine a visible alert level so Alerts > Inventory has something to show immediately.
  const alertThresholds: WineAlertThreshold[] = oversoldWineId
    ? [{ id: createId('threshold'), wineId: oversoldWineId, minBottles: 6, active: true, createdAt: new Date().toISOString() }]
    : []

  return { invoices, sales, alertThresholds }
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
