import { screen, waitFor } from '@testing-library/react'
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

  it('shows a zero balance and an empty purchase history for a wine with no approved invoices', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Untouched Wine' })

    renderWithProviders(<WineDetailPage />, {
      route: `/wines/${wine.id}`,
      path: '/wines/:wineId',
    })

    expect(await screen.findByText('0 bottles')).toBeInTheDocument()
    expect(await screen.findByText(/no approved purchases yet/i)).toBeInTheDocument()
  })

  it('shows the running balance and a purchase history row with a link back to the invoice', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Purchased Wine' })
    const vendor = await testServicesState.current.vendors.create({ name: 'History Vendor' })
    const invoice = await testServicesState.current.invoices.upload({
      fileName: 'inv.pdf',
      fileType: 'pdf',
      fileDataUrl: 'data:application/pdf;base64,AA==',
    })
    await waitFor(async () => {
      const current = await testServicesState.current.invoices.get(invoice.id)
      expect(current?.status).toBe('not_approved')
    })
    const processed = await testServicesState.current.invoices.get(invoice.id)
    await testServicesState.current.invoices.selectVendorMatch(invoice.id, vendor.id)
    for (const line of processed!.lineItems) {
      await testServicesState.current.invoices.selectSkuMatch(invoice.id, line.id, wine.id)
    }
    await testServicesState.current.invoices.approve(invoice.id)

    renderWithProviders(<WineDetailPage />, {
      route: `/wines/${wine.id}`,
      path: '/wines/:wineId',
    })

    const totalBottles = processed!.lineItems.reduce((sum, l) => sum + l.quantity, 0)
    expect(await screen.findByText(`${totalBottles} bottles`)).toBeInTheDocument()
    expect(screen.getAllByText('History Vendor').length).toBe(processed!.lineItems.length)

    const invoiceLinks = screen.getAllByRole('link', { name: /view invoice/i })
    for (const link of invoiceLinks) {
      expect(link).toHaveAttribute('href', `/invoices/${invoice.id}`)
    }
  })
})
