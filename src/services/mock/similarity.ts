import type { Confidence } from '../../types'

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function bigrams(value: string): string[] {
  const padded = ` ${value} `
  const grams: string[] = []
  for (let i = 0; i < padded.length - 1; i += 1) {
    grams.push(padded.slice(i, i + 2))
  }
  return grams
}

/** Sorensen-Dice coefficient over character bigrams, 0 (no overlap) to 1 (identical). */
export function stringSimilarity(a: string, b: string): number {
  const normA = normalize(a)
  const normB = normalize(b)
  if (!normA || !normB) return 0
  if (normA === normB) return 1

  const bigramsA = bigrams(normA)
  const bigramsB = bigrams(normB)
  const counts = new Map<string, number>()
  for (const gram of bigramsA) {
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }

  let matches = 0
  for (const gram of bigramsB) {
    const remaining = counts.get(gram) ?? 0
    if (remaining > 0) {
      matches += 1
      counts.set(gram, remaining - 1)
    }
  }

  return (2 * matches) / (bigramsA.length + bigramsB.length)
}

export interface BestMatch {
  id: string
  score: number
}

/** Simulates an AI matching suggestion by picking the closest-named candidate. */
export function findBestMatch<T extends { id: string; name: string; active: boolean }>(
  rawName: string,
  candidates: T[],
): BestMatch | null {
  let best: BestMatch | null = null
  for (const candidate of candidates) {
    if (!candidate.active) continue
    const score = stringSimilarity(rawName, candidate.name)
    if (!best || score > best.score) {
      best = { id: candidate.id, score }
    }
  }
  return best
}

const HIGH_THRESHOLD = 0.7
const MEDIUM_THRESHOLD = 0.45
const UNRESOLVED_THRESHOLD = 0.25

export function confidenceFromScore(score: number): Confidence | null {
  if (score >= HIGH_THRESHOLD) return 'high'
  if (score >= MEDIUM_THRESHOLD) return 'medium'
  if (score >= UNRESOLVED_THRESHOLD) return 'low'
  return null
}
