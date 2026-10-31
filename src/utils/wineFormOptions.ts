import type { WineCategory, WineCountry, WineStyle } from '../types'

export const WINE_CATEGORY_OPTIONS: { value: WineCategory; label: string }[] = [
  { value: 'wine', label: 'Wine' },
  { value: 'hard_liquor', label: 'Hard Liquor' },
  { value: 'beer', label: 'Beer' },
  { value: 'sake', label: 'Sake' },
  { value: 'other', label: 'Other' },
]

export const WINE_STYLE_OPTIONS: { value: WineStyle; label: string }[] = [
  { value: 'red', label: 'Red' },
  { value: 'white', label: 'White' },
  { value: 'sparkling', label: 'Sparkling' },
  { value: 'other', label: 'Other' },
]

export const WINE_COUNTRY_OPTIONS: { value: WineCountry; label: string }[] = [
  { value: 'france', label: 'France' },
  { value: 'italy', label: 'Italy' },
  { value: 'usa', label: 'USA' },
  { value: 'spain', label: 'Spain' },
  { value: 'germany', label: 'Germany' },
  { value: 'argentina', label: 'Argentina' },
  { value: 'chile', label: 'Chile' },
  { value: 'australia', label: 'Australia' },
  { value: 'new_zealand', label: 'New Zealand' },
  { value: 'portugal', label: 'Portugal' },
  { value: 'south_africa', label: 'South Africa' },
  { value: 'other', label: 'Other' },
]
