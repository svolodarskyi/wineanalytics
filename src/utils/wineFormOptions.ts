import type { WineCategory } from '../types'

export const WINE_CATEGORY_OPTIONS: { value: WineCategory; label: string }[] = [
  { value: 'wine', label: 'Wine' },
  { value: 'hard_liquor', label: 'Hard Liquor' },
  { value: 'beer', label: 'Beer' },
  { value: 'sake', label: 'Sake' },
  { value: 'other', label: 'Other' },
]
