import type { PourSize, Vendor, Wine } from '../../types'
import { createId } from './ids'

export function seedWines(): Wine[] {
  const now = new Date().toISOString()
  const wines: {
    name: string
    category: Wine['category']
    style: Wine['style']
    country: Wine['country']
    volumeMl: number | null
  }[] = [
    { name: 'Chateau Ste. Michelle Riesling', category: 'wine', style: 'white', country: 'usa', volumeMl: 750 },
    { name: 'Caymus Cabernet Sauvignon', category: 'wine', style: 'red', country: 'usa', volumeMl: 750 },
    { name: 'Kim Crawford Sauvignon Blanc', category: 'wine', style: 'white', country: 'new_zealand', volumeMl: 750 },
    { name: 'Veuve Clicquot Brut', category: 'wine', style: 'sparkling', country: 'france', volumeMl: 750 },
    { name: 'Antinori Tignanello', category: 'wine', style: 'red', country: 'italy', volumeMl: 750 },
    { name: 'La Crema Pinot Noir', category: 'wine', style: 'red', country: 'usa', volumeMl: 750 },
    { name: 'Whispering Angel Rose', category: 'wine', style: 'other', country: 'france', volumeMl: 750 },
    { name: 'Chateau d\'Yquem Sauternes', category: 'wine', style: 'white', country: 'france', volumeMl: 375 },
    { name: 'Taylor Fladgate 20 Year Tawny Port', category: 'wine', style: 'other', country: 'portugal', volumeMl: 750 },
    { name: 'Domaine Serene Pinot Noir', category: 'wine', style: 'red', country: 'usa', volumeMl: 750 },
    { name: 'Josh Cellars Cabernet', category: 'wine', style: 'red', country: 'usa', volumeMl: 750 },
    // No volumeMl yet - exercises the data-quality alert and the
    // purchased-only balance fallback for a wine that can't convert sales.
    { name: 'Chandon Brut Rose', category: 'wine', style: 'sparkling', country: 'usa', volumeMl: null },
  ]
  return wines.map(({ name, category, style, country, volumeMl }) => ({
    id: createId('wine'),
    name,
    invoiceName: null,
    volumeMl,
    category,
    style,
    country,
    imageDataUrls: [],
    active: true,
    createdAt: now,
  }))
}

export function seedVendors(): Vendor[] {
  const now = new Date().toISOString()
  // Deliberately excludes "New Wine Distributors LLC" - sampleInvoices.ts
  // uses that exact name as its one demo case for an unresolved vendor match.
  const names = ['Winebow Imports', "Southern Glazer's Wine & Spirits", 'Vintner Select', 'Empire Merchants']
  return names.map((name) => ({ id: createId('vendor'), name, invoiceName: null, active: true, createdAt: now }))
}

export function seedPourSizes(): PourSize[] {
  const now = new Date().toISOString()
  const sizes: { name: string; volumeMl: number }[] = [
    { name: 'Taste', volumeMl: 75 },
    { name: 'Glass', volumeMl: 150 },
  ]
  return sizes.map(({ name, volumeMl }) => ({ id: createId('pour'), name, volumeMl, active: true, createdAt: now }))
}
