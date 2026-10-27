import type { WineCategory } from '../types'

export const WINE_CATEGORY_OPTIONS: { value: WineCategory; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'rose', label: 'Rosé' },
  { value: 'sparkling', label: 'Sparkling' },
  { value: 'dessert', label: 'Dessert' },
  { value: 'fortified', label: 'Fortified' },
  { value: 'beer', label: 'Beer' },
  { value: 'spirits', label: 'Spirits' },
  { value: 'cider', label: 'Cider' },
  { value: 'non_alcoholic', label: 'Non-Alcoholic' },
  { value: 'other', label: 'Other' },
]
