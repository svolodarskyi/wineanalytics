import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { WinePurchasesPage } from '../WinePurchasesPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

const navigateMock = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

describe('WinePurchasesPage', () => {
  beforeEach(() => {
    resetTestServices({ seed: false })
    navigateMock.mockClear()
  })

  it('shows an empty state for a wine with no approved invoices', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Untouched Wine' })

    renderWithProviders(<WinePurchasesPage />, {
      route: `/wines/${wine.id}`,
      path: '/wines/:wineId',
    })

    expect(await screen.findByText(/no approved purchases yet/i)).toBeInTheDocument()
  })

  it('shows a purchase history row and navigates to its invoice when clicked', async () => {
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

    renderWithProviders(<WinePurchasesPage />, {
      route: `/wines/${wine.id}`,
      path: '/wines/:wineId',
    })

    const vendorCells = await screen.findAllByText('History Vendor')
    expect(vendorCells).toHaveLength(processed!.lineItems.length)

    const user = userEvent.setup()
    const row = vendorCells[0].closest('tr')
    expect(row).not.toBeNull()
    await user.click(row!)

    expect(navigateMock).toHaveBeenCalledWith(`/invoices/${invoice.id}`)
  })
})
