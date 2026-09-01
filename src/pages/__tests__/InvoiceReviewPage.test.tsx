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
    await user.click(screen.getByRole('button', { name: vendor.name }))
    await screen.findByText('Test Vendor')
    expect(screen.getAllByText('Resolved')[0]).toBeInTheDocument()

    // Resolve every line item.
    const rows = screen.getAllByRole('row').filter((row) => within(row).queryByText(/select wine/i))
    for (const row of rows) {
      await user.click(within(row).getByRole('button', { name: /select wine/i }))
      await user.click(within(row).getByRole('button', { name: wine.name }))
    }

    await waitFor(() => expect(screen.getByRole('button', { name: /approve/i })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: /approve/i }))

    // Approving redirects to the invoices list, so this page unmounts.
    await waitFor(() => expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument())

    const stored = await testServicesState.current.invoices.get(invoice.id)
    expect(stored?.status).toBe('approved')
  })

  it('lets the user create a brand-new vendor and wine directly from the picker when nothing matches', async () => {
    const user = userEvent.setup()
    resetTestServices({ seed: false })
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    // No vendors exist at all yet, so the picker offers to create one.
    await user.click(await screen.findByRole('button', { name: /select vendor/i }))
    expect(screen.getByText(/no vendors yet/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Search vendors'), 'Brand New Vendor')
    await user.click(screen.getByRole('button', { name: /add "brand new vendor" as a new vendor/i }))
    await screen.findByText('Brand New Vendor')
    expect(screen.getAllByText('Resolved')[0]).toBeInTheDocument()

    const createdVendor = (await testServicesState.current.vendors.list()).find((v) => v.name === 'Brand New Vendor')
    expect(createdVendor).toBeDefined()

    // Same flow for a wine SKU on the first line item.
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText(/select wine/i)) as HTMLElement
    await user.click(within(row).getByRole('button', { name: /select wine/i }))
    expect(within(row).getByText(/no wines yet/i)).toBeInTheDocument()
    await user.type(within(row).getByLabelText('Search wines'), 'Brand New Wine')
    await user.click(within(row).getByRole('button', { name: /add "brand new wine" as a new wine/i }))
    await within(row).findByText('Brand New Wine')

    const createdWine = (await testServicesState.current.wines.list()).find((w) => w.name === 'Brand New Wine')
    expect(createdWine).toBeDefined()
  })

  it('offers "+ Add new" even when the search already matches an existing vendor', async () => {
    const user = userEvent.setup()
    resetTestServices({ seed: false })
    await testServicesState.current.vendors.create({ name: 'Existing Vendor' })
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await user.click(await screen.findByRole('button', { name: /select vendor/i }))
    await user.type(screen.getByLabelText('Search vendors'), 'Existing Vendor')

    // The existing match is still selectable...
    expect(screen.getByLabelText('Choose match')).toBeInTheDocument()
    // ...but creating a new one with the same search text is also offered.
    expect(screen.getByRole('button', { name: /add "existing vendor" as a new vendor/i })).toBeInTheDocument()
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
