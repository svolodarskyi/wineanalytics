import type { Vendor, Wine } from '../../types'
import { createId } from './ids'

export function seedWines(): Wine[] {
  const now = new Date().toISOString()
  const wines: { name: string; country: string; category: Wine['category'] }[] = [
    { name: 'Chateau Ste. Michelle Riesling', country: 'USA', category: 'white' },
    { name: 'Caymus Cabernet Sauvignon', country: 'USA', category: 'red' },
    { name: 'Kim Crawford Sauvignon Blanc', country: 'New Zealand', category: 'white' },
    { name: 'Veuve Clicquot Brut', country: 'France', category: 'sparkling' },
    { name: 'Antinori Tignanello', country: 'Italy', category: 'red' },
    { name: 'La Crema Pinot Noir', country: 'USA', category: 'red' },
  ]
  return wines.map(({ name, country, category }) => ({
    id: createId('wine'),
    name,
    invoiceName: null,
    country,
    volumeMl: 750,
    category,
    imageDataUrl: null,
    active: true,
    createdAt: now,
  }))
}

export function seedVendors(): Vendor[] {
  const now = new Date().toISOString()
  const names = ["Winebow Imports", "Southern Glazer's Wine & Spirits", 'Vintner Select']
  return names.map((name) => ({ id: createId('vendor'), name, invoiceName: null, active: true, createdAt: now }))
}
