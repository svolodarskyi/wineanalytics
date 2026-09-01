import type { DataQualityField, Wine } from '../types'

/**
 * Single source of truth for which wine fields count toward data-quality
 * alerts. Both the mock and Supabase alert services check exactly this list,
 * and the Alerts page renders it as a visible note - update it here to
 * change what's tracked everywhere at once.
 */
export const DATA_QUALITY_FIELDS: { field: DataQualityField; label: string }[] = [
  { field: 'country', label: 'Country' },
  { field: 'volumeMl', label: 'Volume' },
  { field: 'category', label: 'Category' },
]

export function isDataQualityFieldMissing(wine: Wine, field: DataQualityField): boolean {
  switch (field) {
    case 'country':
      return wine.country == null
    case 'volumeMl':
      return wine.volumeMl == null
    case 'category':
      return wine.category == null
  }
}
