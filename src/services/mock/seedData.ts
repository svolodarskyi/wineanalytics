import type { Vendor, Wine } from '../../types'
import { createId } from './ids'

export function seedWines(): Wine[] {
  const now = new Date().toISOString()
  const wines = [
    { name: 'Chateau Ste. Michelle Riesling', country: 'USA' },
    { name: 'Caymus Cabernet Sauvignon', country: 'USA' },
    { name: 'Kim Crawford Sauvignon Blanc', country: 'New Zealand' },
    { name: 'Veuve Clicquot Brut', country: 'France' },
    { name: 'Antinori Tignanello', country: 'Italy' },
    { name: 'La Crema Pinot Noir', country: 'USA' },
  ]
  return wines.map(({ name, country }) => ({
    id: createId('wine'),
    name,
    invoiceName: null,
    country,
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
