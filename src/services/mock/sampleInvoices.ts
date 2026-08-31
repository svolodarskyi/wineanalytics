export interface SampleInvoiceLine {
  itemNameRaw: string
  quantity: number
  unitPrice: number
}

export interface SampleInvoice {
  vendorNameRaw: string
  daysAgo: number
  lines: SampleInvoiceLine[]
}

/**
 * Canned "extraction results" the mock OCR cycles through on each upload.
 * Names are deliberately a mix of exact, near, and no matches against the
 * seeded wine/vendor master data so the app can demonstrate high/medium/low
 * confidence matches as well as unresolved vendors and SKUs.
 */
export const SAMPLE_INVOICES: SampleInvoice[] = [
  {
    vendorNameRaw: 'Winebow Imports',
    daysAgo: 3,
    lines: [
      { itemNameRaw: 'Caymus Cabernet Sauvignon', quantity: 6, unitPrice: 42 },
      { itemNameRaw: 'Kim Crawford Sauv Blanc', quantity: 12, unitPrice: 14.5 },
      { itemNameRaw: 'Chandon Brut Rose', quantity: 6, unitPrice: 18 },
    ],
  },
  {
    vendorNameRaw: 'Southern Glazers Wine and Spirits',
    daysAgo: 10,
    lines: [
      { itemNameRaw: 'Chateau Ste Michelle Riesling', quantity: 12, unitPrice: 11 },
      { itemNameRaw: 'La Crema Pinot Noir', quantity: 6, unitPrice: 24 },
      { itemNameRaw: 'Veuve Clicquot Yellow Label', quantity: 3, unitPrice: 55 },
    ],
  },
  {
    vendorNameRaw: 'Vintner Select Distributors',
    daysAgo: 17,
    lines: [
      { itemNameRaw: 'Antinori Tignanello', quantity: 2, unitPrice: 120 },
      { itemNameRaw: 'Domaine Serene Pinot Noir', quantity: 4, unitPrice: 65 },
      { itemNameRaw: 'Kim Crawford Sauvignon Blanc', quantity: 12, unitPrice: 14 },
    ],
  },
  {
    vendorNameRaw: 'New Wine Distributors LLC',
    daysAgo: 1,
    lines: [
      { itemNameRaw: 'Josh Cellars Cabernet', quantity: 6, unitPrice: 13 },
      { itemNameRaw: 'Caymus Cabernet Sauvignon', quantity: 3, unitPrice: 45 },
    ],
  },
]

let cursor = 0

export function nextSampleInvoice(): SampleInvoice {
  const sample = SAMPLE_INVOICES[cursor % SAMPLE_INVOICES.length]
  cursor += 1
  return sample
}

export function resetSampleInvoiceCursor(): void {
  cursor = 0
}
