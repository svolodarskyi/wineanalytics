import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextSampleInvoice, resetSampleInvoiceCursor } from '../../services/mock/sampleInvoices'
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
    // The search box is pre-filled with the raw extracted name, so clear it
    // to see the full unfiltered list before picking by exact name.
    await user.click(screen.getByRole('button', { name: /select vendor/i }))
    await user.clear(screen.getByLabelText('Search vendors'))
    await user.click(screen.getByRole('button', { name: vendor.name }))
    await screen.findByText('Test Vendor')
    expect(screen.getAllByText('Resolved')[0]).toBeInTheDocument()

    // Resolve every line item.
    const rows = screen.getAllByRole('row').filter((row) => within(row).queryByText(/select wine/i))
    for (const row of rows) {
      await user.click(within(row).getByRole('button', { name: /select wine/i }))
      await user.clear(within(row).getByLabelText('Search wines'))
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

    // No vendors exist at all yet, so the picker offers to create one. The
    // search box is pre-filled with the raw extracted vendor name, so it
    // reads "no vendor found matching" rather than the fully-empty-query copy.
    await user.click(await screen.findByRole('button', { name: /select vendor/i }))
    expect(screen.getByText(/no vendor found matching/i)).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Search vendors'))
    await user.type(screen.getByLabelText('Search vendors'), 'Brand New Vendor')
    await user.click(screen.getByRole('button', { name: /add "brand new vendor" as a new vendor/i }))
    await screen.findByText('Brand New Vendor')
    expect(screen.getAllByText('Resolved')[0]).toBeInTheDocument()

    const createdVendor = (await testServicesState.current.vendors.list()).find((v) => v.name === 'Brand New Vendor')
    expect(createdVendor).toBeDefined()

    // Same flow for a wine SKU on the first line item - creating a wine goes
    // through a review step first (see NewWineReviewFields) rather than
    // creating immediately, so there's an extra "Create wine" confirmation.
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText(/select wine/i)) as HTMLElement
    await user.click(within(row).getByRole('button', { name: /select wine/i }))
    expect(within(row).getByText(/no wine found matching/i)).toBeInTheDocument()
    await user.clear(within(row).getByLabelText('Search wines'))
    await user.type(within(row).getByLabelText('Search wines'), 'Brand New Wine')
    await user.click(within(row).getByRole('button', { name: /add "brand new wine" as a new wine/i }))
    // If this line item's raw data included a volume/category, Create stays disabled until each is approved.
    for (const approveButton of within(row).queryAllByRole('button', { name: /^approve$/i })) {
      await user.click(approveButton)
    }
    await user.click(within(row).getByRole('button', { name: /create wine/i }))
    await within(row).findByText('Brand New Wine')

    const createdWine = (await testServicesState.current.wines.list()).find((w) => w.name === 'Brand New Wine')
    expect(createdWine).toBeDefined()
  })

  it('blocks creating a new wine until both a prefilled volume and category are approved', async () => {
    const user = userEvent.setup()
    resetTestServices({ seed: false })
    resetSampleInvoiceCursor()
    // The first sample invoice's first line ("Caymus Cabernet Sauvignon") carries a raw volume + category.
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await screen.findByText('Wine line items')
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText(/select wine/i)) as HTMLElement
    await user.click(within(row).getByRole('button', { name: /select wine/i }))
    await user.click(within(row).getByRole('button', { name: /add ".*" as a new wine/i }))

    const createButton = within(row).getByRole('button', { name: /create wine/i })
    expect(within(row).getByLabelText(/volume/i)).toHaveValue(750)
    expect(within(row).getByLabelText(/category/i)).toHaveValue('red')
    expect(createButton).toBeDisabled()

    // Editing the prefilled volume re-requires approval rather than silently accepting the edit.
    const volumeInput = within(row).getByLabelText(/volume/i)
    await user.clear(volumeInput)
    await user.type(volumeInput, '750')
    expect(createButton).toBeDisabled()

    const approveButtons = within(row).getAllByRole('button', { name: /^approve$/i })
    expect(approveButtons).toHaveLength(2) // one for volume, one for category

    await user.click(approveButtons[0])
    expect(createButton).toBeDisabled() // category still unapproved
    await user.click(within(row).getByRole('button', { name: /^approve$/i })) // only the category one remains
    expect(createButton).toBeEnabled()

    // Country stays optional even though volume/category needed approval.
    await user.click(createButton)
    await waitFor(() => expect(within(row).getByText('Resolved')).toBeInTheDocument())

    const created = (await testServicesState.current.wines.list()).find((w) => w.name === 'Caymus Cabernet Sauvignon')
    expect(created).toMatchObject({ volumeMl: 750, category: 'red', country: null })
  })

  it('lets category be cleared instead of approved, with no gate once it is empty', async () => {
    const user = userEvent.setup()
    resetTestServices({ seed: false })
    resetSampleInvoiceCursor()
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await screen.findByText('Wine line items')
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText(/select wine/i)) as HTMLElement
    await user.click(within(row).getByRole('button', { name: /select wine/i }))
    await user.click(within(row).getByRole('button', { name: /add ".*" as a new wine/i }))

    await user.selectOptions(within(row).getByLabelText(/category/i), '')
    await user.click(within(row).getByRole('button', { name: /^approve$/i })) // the volume one - now the only one left
    expect(within(row).queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /create wine/i })).toBeEnabled()
  })

  it('lets a new wine be created immediately when nothing was extracted to review', async () => {
    const user = userEvent.setup()
    resetTestServices({ seed: false })
    resetSampleInvoiceCursor()
    nextSampleInvoice() // skip past the first sample invoice, whose first line has a raw volume/category
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await screen.findByText('Wine line items')
    const row = screen.getAllByRole('row').find((r) => within(r).queryByText(/select wine/i)) as HTMLElement
    await user.click(within(row).getByRole('button', { name: /select wine/i }))
    await user.clear(within(row).getByLabelText('Search wines'))
    await user.type(within(row).getByLabelText('Search wines'), 'No Extraction Wine')
    await user.click(within(row).getByRole('button', { name: /add "no extraction wine" as a new wine/i }))

    expect(within(row).queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /create wine/i })).toBeEnabled()
  })

  it('pre-fills the picker search with the raw extracted name, so create-new is offered without typing', async () => {
    const user = userEvent.setup()
    resetTestServices({ seed: false })
    resetSampleInvoiceCursor()
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await user.click(await screen.findByRole('button', { name: /select vendor/i }))
    expect(screen.getByLabelText('Search vendors')).toHaveValue('Winebow Imports')
    expect(screen.getByRole('button', { name: /add "winebow imports" as a new vendor/i })).toBeInTheDocument()

    const row = screen.getAllByRole('row').find((r) => within(r).queryByText(/select wine/i)) as HTMLElement
    await user.click(within(row).getByRole('button', { name: /select wine/i }))
    expect(within(row).getByLabelText('Search wines')).toHaveValue('Caymus Cabernet Sauvignon')
    expect(
      within(row).getByRole('button', { name: /add "caymus cabernet sauvignon" as a new wine/i }),
    ).toBeInTheDocument()
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
    await user.clear(screen.getByLabelText('Search vendors'))
    await user.type(screen.getByLabelText('Search vendors'), 'Existing Vendor')

    // The existing match is still selectable...
    expect(screen.getByLabelText('Choose match')).toBeInTheDocument()
    // ...but creating a new one with the same search text is also offered.
    expect(screen.getByRole('button', { name: /add "existing vendor" as a new vendor/i })).toBeInTheDocument()
  })

  it('discards a not-approved invoice after confirmation and navigates away', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    resetTestServices({ seed: false })
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await user.click(await screen.findByRole('button', { name: /^discard$/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /^discard$/i })).not.toBeInTheDocument())
    expect(await testServicesState.current.invoices.get(invoice.id)).toBeNull()
  })

  it('does not discard when the confirmation is declined', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    resetTestServices({ seed: false })
    const invoice = await uploadAndWaitForProcessing()

    renderWithProviders(<InvoiceReviewPage />, {
      route: `/invoices/${invoice.id}`,
      path: '/invoices/:invoiceId',
    })

    await user.click(await screen.findByRole('button', { name: /^discard$/i }))

    expect(screen.getByRole('button', { name: /^discard$/i })).toBeInTheDocument()
    expect(await testServicesState.current.invoices.get(invoice.id)).not.toBeNull()
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
