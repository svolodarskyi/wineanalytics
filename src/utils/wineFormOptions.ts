import type { WineCategory } from '../types'

export const WINE_CATEGORY_OPTIONS: { value: WineCategory; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'rose', label: 'Rosé' },
  { value: 'sparkling', label: 'Sparkling' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'fortified', label: 'Fortified' },
  { value: 'other', label: 'Other' },
]

export const VOLUME_ML_PRESETS = [187, 375, 500, 750, 1000, 1500, 3000]
