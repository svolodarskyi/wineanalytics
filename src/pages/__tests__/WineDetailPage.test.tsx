import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { WineDetailPage } from '../WineDetailPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('WineDetailPage', () => {
  beforeEach(() => {
    resetTestServices({ seed: false })
  })

  it('shows the wine name, a zero ending balance, and links to both tabs', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Untouched Wine' })

    renderWithProviders(<WineDetailPage />, {
      route: `/wines/${wine.id}`,
      path: '/wines/:wineId',
    })

    expect(await screen.findByRole('heading', { name: 'Untouched Wine' })).toBeInTheDocument()
    expect(await screen.findByText('0 bottles')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Purchases' })).toHaveAttribute('href', `/wines/${wine.id}/purchases`)
    expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', `/wines/${wine.id}/sales`)
  })

  it('reflects purchases minus sales in the ending balance', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Sold Wine', volumeMl: 750 })
    const vendor = await testServicesState.current.vendors.create({ name: 'Vendor' })
    const invoice = await testServicesState.current.invoices.upload({
      fileName: 'inv.pdf',
      fileType: 'pdf',
      fileDataUrl: 'data:application/pdf;base64,AA==',
    })
    await vi.waitFor(async () => {
      const current = await testServicesState.current.invoices.get(invoice.id)
      expect(current?.status).toBe('not_approved')
    })
    const processed = await testServicesState.current.invoices.get(invoice.id)
    await testServicesState.current.invoices.selectVendorMatch(invoice.id, vendor.id)
    for (const line of processed!.lineItems) {
      await testServicesState.current.invoices.selectSkuMatch(invoice.id, line.id, wine.id)
    }
    await testServicesState.current.invoices.approve(invoice.id)
    await testServicesState.current.sales.create({ wineId: wine.id, soldAt: '2026-01-01T00:00:00.000Z', volumeMl: 750 })

    renderWithProviders(<WineDetailPage />, {
      route: `/wines/${wine.id}`,
      path: '/wines/:wineId',
    })

    const totalBottles = processed!.lineItems.reduce((sum, l) => sum + l.quantity, 0)
    expect(await screen.findByText(`${totalBottles - 1} bottles`)).toBeInTheDocument()
  })
})
