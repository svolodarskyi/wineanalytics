import { describe, expect, it } from 'vitest'
import { formatCurrency, formatDate } from '../format'

describe('formatCurrency', () => {
  it('formats a number as USD', () => {
    expect(formatCurrency(42)).toBe('$42.00')
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
  })

  it('returns a dash for null', () => {
    expect(formatCurrency(null)).toBe('-')
  })
})

describe('formatDate', () => {
  it('formats an ISO string', () => {
    expect(formatDate('2026-01-15T00:00:00.000Z')).toMatch(/Jan 1[45], 2026/)
  })

  it('returns a dash for null or invalid input', () => {
    expect(formatDate(null)).toBe('-')
    expect(formatDate('not-a-date')).toBe('-')
  })
})
