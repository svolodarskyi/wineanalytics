import { describe, expect, it } from 'vitest'
import { confidenceFromScore, findBestMatch, stringSimilarity } from '../similarity'

describe('stringSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(stringSimilarity('Caymus Cabernet Sauvignon', 'Caymus Cabernet Sauvignon')).toBe(1)
  })

  it('is case- and punctuation-insensitive', () => {
    expect(stringSimilarity('CAYMUS cabernet-sauvignon', 'Caymus Cabernet Sauvignon')).toBe(1)
  })

  it('returns 0 when either string is empty', () => {
    expect(stringSimilarity('', 'Caymus')).toBe(0)
    expect(stringSimilarity('Caymus', '')).toBe(0)
  })

  it('scores unrelated strings low', () => {
    expect(stringSimilarity('Caymus Cabernet Sauvignon', 'zzz qqq')).toBeLessThan(0.2)
  })

  it('scores near-matches high but not perfect', () => {
    const score = stringSimilarity('Kim Crawford Sauv Blanc', 'Kim Crawford Sauvignon Blanc')
    expect(score).toBeGreaterThan(0.7)
    expect(score).toBeLessThan(1)
  })
})

describe('confidenceFromScore', () => {
  it('buckets scores into high/medium/low/none', () => {
    expect(confidenceFromScore(0.95)).toBe('high')
    expect(confidenceFromScore(0.7)).toBe('high')
    expect(confidenceFromScore(0.5)).toBe('medium')
    expect(confidenceFromScore(0.3)).toBe('low')
    expect(confidenceFromScore(0.1)).toBeNull()
  })
})

describe('findBestMatch', () => {
  const candidates = [
    { id: '1', name: 'Caymus Cabernet Sauvignon', active: true },
    { id: '2', name: 'Kim Crawford Sauvignon Blanc', active: true },
    { id: '3', name: 'Retired Wine', active: false },
  ]

  it('picks the closest active candidate', () => {
    const best = findBestMatch('Caymus Cabernet Sauvignon', candidates)
    expect(best?.id).toBe('1')
    expect(best?.score).toBe(1)
  })

  it('ignores inactive candidates even if they would score higher', () => {
    const best = findBestMatch('Retired Wine', candidates)
    expect(best?.id).not.toBe('3')
  })

  it('returns null when there are no candidates', () => {
    expect(findBestMatch('anything', [])).toBeNull()
  })

  it('matches against invoiceName when it scores better than the display name', () => {
    const withInvoiceName = [
      { id: '1', name: 'Caymus Vineyards Cabernet Sauvignon Napa Valley', active: true, invoiceName: 'CAYMUS CAB 750' },
    ]
    const best = findBestMatch('CAYMUS CAB 750', withInvoiceName)
    expect(best?.id).toBe('1')
    expect(best?.score).toBe(1)
  })
})
