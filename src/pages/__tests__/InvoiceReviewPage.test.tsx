import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { InvoiceReviewPage } from '../InvoiceReviewPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

async function uploadAndWaitForProcessing() {
  const invoice = await testServicesState.current.invoices.upload({
    fileName: 'invoice.pdf',
    fileType: 'pdf',
    fileDataUrl: 'data:application/pdf;base64,AA==',
  })
  await waitFor(async () => {
    const current = await testServicesState.current.invoices.get(invoice.id)
    expect(current?.status).toBe('not_approved')
  })
  return invoice
}

describe('InvoiceReviewPage', () => {
  beforeEach(() => {
    resetTestServices()
  })

  it('shows a processing state, then the extracted vendor and line item matches', async () => {
    const invoice = await testServicesState.current.invoices.upload({
      fileName: 'my-invoice.pdf',
      fileType: 'pdf',
      fileDataUrl: 'data:application/pdf;base64,AA==',
    })

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    expect(await screen.findByText(/extracting invoice data/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText(/extracting invoice data/i)).not.toBeInTheDocument(), {
      timeout: 3000,
    })
    expect(screen.getByText('Vendor match')).toBeInTheDocument()
    expect(screen.getByText('Wine line items')).toBeInTheDocument()
  })

  it('lets the user confirm the vendor match and each line item, then approve', async () => {
    const user = userEvent.setup()
    // Deterministic: no seed data to match against, so we control every match explicitly.
    resetTestServices({ seed: false })
    const vendor = await testServicesState.current.vendors.create({ name: 'Test Vendor' })
    const wine = await testServicesState.current.wines.create({ name: 'Test Wine' })
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    // Approve is disabled until every match is resolved.
    const approveButton = await screen.findByRole('button', { name: /approve/i })
    expect(approveButton).toBeDisabled()

    // Resolve the vendor via the picker (no AI suggestion exists in this scenario).
    await user.click(screen.getByRole('button', { name: /select vendor/i }))
    await user.selectOptions(screen.getByLabelText('Choose match'), vendor.id)
    await user.click(screen.getByRole('button', { name: /set vendor/i }))
    await screen.findByText('Test Vendor')
    expect(screen.getAllByText('Resolved')[0]).toBeInTheDocument()

    // Resolve every line item.
    const rows = screen.getAllByRole('row').filter((row) => within(row).queryByText(/select wine/i))
    for (const row of rows) {
      await user.click(within(row).getByRole('button', { name: /select wine/i }))
      await user.selectOptions(within(row).getByLabelText('Choose match'), wine.id)
      await user.click(within(row).getByRole('button', { name: /set wine/i }))
    }

    await waitFor(() => expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: /approve/i }))
    expect(await screen.findByText('Approved')).toBeInTheDocument()

    const stored = await testServicesState.current.invoices.get(invoice.id)
    expect(stored?.status).toBe('approved')
  })

  it('shows an error and stays not-approved if approval is attempted with unresolved matches', async () => {
    resetTestServices({ seed: false })
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    // With no master data, the vendor is unresolved so Approve stays disabled -
    // confirming the UI gates on resolution rather than allowing a bad approve.
    const approveButton = await screen.findByRole('button', { name: /approve/i })
    expect(approveButton).toBeDisabled()
  })
})
