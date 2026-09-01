import { describe, expect, it, vi } from 'vitest'
import { extractInvoiceImage } from '../../openai/client'
import { createOpenAiService } from '../openAiService'
import { MockStore } from '../store'

vi.mock('../../openai/client', () => ({
  extractInvoiceImage: vi.fn(),
}))

describe('mock OpenAI service', () => {
  it('maps a successful extraction and logs the request with its cost', async () => {
    vi.mocked(extractInvoiceImage).mockResolvedValue({
      parsed: {
        vendorName: 'Vino Co',
        invoiceDate: '2026-02-01',
        totalAmount: 100,
        lineItems: [{ itemName: 'Wine A', quantity: 1, unitPrice: 100, lineTotal: 100 }],
        additionalCharges: [{ description: 'Sales Tax', amount: 8.5 }],
      },
      responseJson: { id: 'resp_1' },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      costUsd: 0.001,
    })

    const store = new MockStore({ seed: false })
    const openai = createOpenAiService(store, 0)

    const result = await openai.extractInvoice({ fileName: 'a.jpg', imageDataUrl: 'data:image/jpeg;base64,AA==' })
    expect(result).toEqual({
      vendorNameRaw: 'Vino Co',
      invoiceDate: '2026-02-01',
      totalAmount: 100,
      lines: [{ itemNameRaw: 'Wine A', quantity: 1, unitPrice: 100, lineTotal: 100 }],
      additionalCharges: [{ description: 'Sales Tax', amount: 8.5 }],
    })

    const logs = await openai.listLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ fileName: 'a.jpg', costUsd: 0.001, error: null, responseJson: { id: 'resp_1' } })
  })

  it('logs a failed request with the error and rethrows', async () => {
    vi.mocked(extractInvoiceImage).mockRejectedValue(new Error('no key'))

    const store = new MockStore({ seed: false })
    const openai = createOpenAiService(store, 0)

    await expect(
      openai.extractInvoice({ fileName: 'b.jpg', imageDataUrl: 'data:image/jpeg;base64,AA==' }),
    ).rejects.toThrow('no key')

    const logs = await openai.listLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ fileName: 'b.jpg', error: 'no key', responseJson: null, costUsd: 0 })
  })

  it('keeps logs newest-first', async () => {
    vi.mocked(extractInvoiceImage).mockResolvedValue({
      parsed: { vendorName: null, invoiceDate: null, totalAmount: 0, lineItems: [], additionalCharges: [] },
      responseJson: {},
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      costUsd: 0,
    })
    const store = new MockStore({ seed: false })
    const openai = createOpenAiService(store, 0)

    await openai.extractInvoice({ fileName: 'first.jpg', imageDataUrl: 'data:image/jpeg;base64,AA==' })
    await openai.extractInvoice({ fileName: 'second.jpg', imageDataUrl: 'data:image/jpeg;base64,AA==' })

    const logs = await openai.listLogs()
    expect(logs.map((l) => l.fileName)).toEqual(['second.jpg', 'first.jpg'])
  })
})
