import type { PourSize, Vendor, Wine } from '../../types'
import { createId } from './ids'

export function seedWines(): Wine[] {
  const now = new Date().toISOString()
  const wines: { name: string; country: string; category: Wine['category']; volumeMl: number | null }[] = [
    { name: 'Chateau Ste. Michelle Riesling', country: 'USA', category: 'white', volumeMl: 750 },
    { name: 'Caymus Cabernet Sauvignon', country: 'USA', category: 'red', volumeMl: 750 },
    { name: 'Kim Crawford Sauvignon Blanc', country: 'New Zealand', category: 'white', volumeMl: 750 },
    { name: 'Veuve Clicquot Brut', country: 'France', category: 'sparkling', volumeMl: 750 },
    { name: 'Antinori Tignanello', country: 'Italy', category: 'red', volumeMl: 750 },
    { name: 'La Crema Pinot Noir', country: 'USA', category: 'red', volumeMl: 750 },
    { name: 'Whispering Angel Rose', country: 'France', category: 'rose', volumeMl: 750 },
    { name: 'Chateau d\'Yquem Sauternes', country: 'France', category: 'dessert', volumeMl: 375 },
    { name: 'Taylor Fladgate 20 Year Tawny Port', country: 'Portugal', category: 'fortified', volumeMl: 750 },
    { name: 'Domaine Serene Pinot Noir', country: 'USA', category: 'red', volumeMl: 750 },
    { name: 'Josh Cellars Cabernet', country: 'USA', category: 'red', volumeMl: 750 },
    // No volumeMl yet - exercises the data-quality alert and the
    // purchased-only balance fallback for a wine that can't convert sales.
    { name: 'Chandon Brut Rose', country: 'USA', category: 'sparkling', volumeMl: null },
  ]
  return wines.map(({ name, country, category, volumeMl }) => ({
    id: createId('wine'),
    name,
    invoiceName: null,
    producer: null,
    country,
    volumeMl,
    category,
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
