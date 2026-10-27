import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractWinePhotos } from '../client'

function fakeOpenAiResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }),
  }
}

describe('extractWinePhotos', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'test-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends every photo as its own image_url content part alongside the wine-scan prompt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeOpenAiResponse({ name: 'Cabernet Sauvignon', producer: 'Caymus', volumeMl: 750, country: 'USA', category: 'red' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await extractWinePhotos(['data:image/png;base64,AAAA', 'data:image/png;base64,BBBB'])

    const [, requestInit] = fetchMock.mock.calls[0]
    const body = JSON.parse(requestInit.body)
    const imageParts = body.messages[1].content.filter((part: { type: string }) => part.type === 'image_url')
    expect(imageParts).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
    ])
  })

  it('coerces a well-formed response into the extracted wine shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeOpenAiResponse({ name: 'Cabernet Sauvignon', producer: 'Caymus Vineyards', volumeMl: 750, country: 'USA', category: 'red' }),
      ),
    )

    const result = await extractWinePhotos(['data:image/png;base64,AAAA'])

    expect(result.parsed).toEqual({
      name: 'Cabernet Sauvignon',
      producer: 'Caymus Vineyards',
      volumeMl: 750,
      country: 'USA',
      category: 'red',
    })
    expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 20, totalTokens: 120 })
  })

  it('falls back to null for missing/invalid fields rather than guessing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(fakeOpenAiResponse({ name: 'Some Wine', category: 'not-a-real-category', volumeMl: -5 })),
    )

    const result = await extractWinePhotos(['data:image/png;base64,AAAA'])

    expect(result.parsed).toEqual({ name: 'Some Wine', producer: null, volumeMl: null, country: null, category: null })
  })

  it('throws when the API key is not configured', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', '')
    await expect(extractWinePhotos(['data:image/png;base64,AAAA'])).rejects.toThrow(/VITE_OPENAI_API_KEY/)
  })

  it('surfaces the API error message on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'Invalid API key' } }) }),
    )
    await expect(extractWinePhotos(['data:image/png;base64,AAAA'])).rejects.toThrow('Invalid API key')
  })
})
