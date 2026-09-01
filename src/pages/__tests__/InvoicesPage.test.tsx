import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { InvoicesPage } from '../InvoicesPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('InvoicesPage', () => {
  beforeEach(() => {
    resetTestServices({ latencyMs: 0, processingDelayMs: 20 })
  })

  it('surfaces a newly uploaded invoice under Not Approved once background processing finishes, without ever visiting the review page', async () => {
    // Regression test: the Not Approved / Approved tabs are status-filtered
    // queries, so they can never observe a "processing" row themselves and
    // never polled - a newly uploaded invoice only appeared once the user
    // happened to navigate away and back. useUploadInvoice now keeps
    // invalidating the shared invoices cache in the background until the
    // upload leaves "processing", independent of which page is mounted -
    // this test never renders InvoiceReviewPage, matching a user who
    // uploads and immediately leaves rather than watching it process.
    const user = userEvent.setup()
    renderWithProviders(<InvoicesPage />)

    await user.click(screen.getByRole('button', { name: /not approved/i }))
    expect(screen.getByText(/no invoices here yet/i)).toBeInTheDocument()

    const file = new File(['%PDF-1.4 fake'], 'invoice.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('Upload invoice'), file)

    await waitFor(
      () => expect(screen.queryByText(/no invoices here yet/i)).not.toBeInTheDocument(),
      { timeout: 5000 },
    )

    const invoices = await testServicesState.current.invoices.list({ status: 'not_approved' })
    expect(invoices).toHaveLength(1)
  })
})
