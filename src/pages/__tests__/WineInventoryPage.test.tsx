import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { WineInventoryPage } from '../WineInventoryPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('WineInventoryPage', () => {
  beforeEach(() => {
    resetTestServices()
  })

  it('lists the seeded wines with a zero balance when nothing has been approved', async () => {
    renderWithProviders(<WineInventoryPage />)

    expect(await screen.findByText('Caymus Cabernet Sauvignon')).toBeInTheDocument()
    const balanceCells = screen.getAllByRole('cell', { name: '0' })
    expect(balanceCells.length).toBeGreaterThan(0)
  })

  it('shows a notice when invoices are waiting for approval', async () => {
    const invoice = await testServicesState.current.invoices.upload({
      fileName: 'pending.pdf',
      fileType: 'pdf',
      fileDataUrl: 'data:application/pdf;base64,AA==',
    })
    await waitFor(async () => {
      const current = await testServicesState.current.invoices.get(invoice.id)
      expect(current?.status).toBe('not_approved')
    })

    renderWithProviders(<WineInventoryPage />)

    expect(await screen.findByText(/waiting for approval/i)).toBeInTheDocument()
  })

  it('reflects an approved invoice as a nonzero balance', async () => {
    resetTestServices({ seed: false })
    const wine = await testServicesState.current.wines.create({ name: 'Balance Test Wine' })
    const vendor = await testServicesState.current.vendors.create({ name: 'Balance Test Vendor' })
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

    renderWithProviders(<WineInventoryPage />)

    const row = await screen.findByText('Balance Test Wine')
    const expectedBottles = processed!.lineItems.reduce((sum, l) => sum + l.quantity, 0)
    expect(row.closest('tr')).toHaveTextContent(String(expectedBottles))
  })
})
