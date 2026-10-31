import type { DataQualityField, Wine } from '../types'

/**
 * Single source of truth for which wine fields count toward data-quality
 * alerts. Both the mock and Supabase alert services check exactly this list,
 * and the Alerts page renders it as a visible note - update it here to
 * change what's tracked everywhere at once.
 */
export const DATA_QUALITY_FIELDS: { field: DataQualityField; label: string }[] = [
  { field: 'volumeMl', label: 'Volume' },
  { field: 'category', label: 'Category' },
  { field: 'country', label: 'Country' },
]

export function isDataQualityFieldMissing(wine: Wine, field: DataQualityField): boolean {
  switch (field) {
    case 'volumeMl':
      return wine.volumeMl == null
    case 'category':
      return wine.category == null
    // Country only applies once a wine is categorized as 'wine' - no alert for beer/hard liquor/sake/other.
    case 'country':
      return wine.category === 'wine' && wine.country == null
  }
}
