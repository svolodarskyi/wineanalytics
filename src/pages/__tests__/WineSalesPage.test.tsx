import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { WineSalesPage } from '../WineSalesPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('WineSalesPage', () => {
  beforeEach(() => {
    resetTestServices({ seed: false })
  })

  it('shows an empty state for a wine with no sales yet', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Untouched Wine' })
    renderWithProviders(<WineSalesPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })
    expect(await screen.findByText(/no sales recorded yet/i)).toBeInTheDocument()
  })

  it('records a sale via a named pour size, defaulting to a quantity of 1', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Poured Wine', volumeMl: 750 })
    await testServicesState.current.pourSizes.create({ name: 'Glass', volumeMl: 150 })
    const user = userEvent.setup()
    renderWithProviders(<WineSalesPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    await user.click(await screen.findByRole('button', { name: /record sale/i }))
    const modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText(/sold at/i), { target: { value: '2026-01-01T12:00' } })
    await user.selectOptions(within(modal).getByLabelText(/pour size/i), 'Glass (150ml)')
    await user.click(within(modal).getByRole('button', { name: /^record sale$/i }))

    const row = (await screen.findByText('Glass')).closest('tr') as HTMLElement
    expect(within(row).getByText('1')).toBeInTheDocument()
    expect(within(row).getAllByText('150ml')).toHaveLength(2) // per-unit volume and total match when quantity is 1
  })

  it('records multiple glasses in one entry and totals the volume', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Poured Wine', volumeMl: 750 })
    await testServicesState.current.pourSizes.create({ name: 'Glass', volumeMl: 150 })
    const user = userEvent.setup()
    renderWithProviders(<WineSalesPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    await user.click(await screen.findByRole('button', { name: /record sale/i }))
    const modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText(/sold at/i), { target: { value: '2026-01-01T12:00' } })
    await user.selectOptions(within(modal).getByLabelText(/pour size/i), 'Glass (150ml)')
    const quantityInput = within(modal).getByLabelText(/quantity/i)
    await user.clear(quantityInput)
    await user.type(quantityInput, '3')
    await user.click(within(modal).getByRole('button', { name: /^record sale$/i }))

    const row = (await screen.findByText('Glass')).closest('tr') as HTMLElement
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(within(row).getByText('150ml')).toBeInTheDocument()
    expect(within(row).getByText('450ml')).toBeInTheDocument()
  })

  it("records a full-bottle sale using the wine's own volume", async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Bottle Wine', volumeMl: 750 })
    const user = userEvent.setup()
    renderWithProviders(<WineSalesPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    await user.click(await screen.findByRole('button', { name: /record sale/i }))
    const modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText(/sold at/i), { target: { value: '2026-01-01T12:00' } })
    await user.selectOptions(within(modal).getByLabelText(/volume entry/i), 'full-bottle')
    await user.click(within(modal).getByRole('button', { name: /^record sale$/i }))

    expect(await screen.findByText('Full bottle')).toBeInTheDocument()
    expect(screen.getAllByText('750ml')).toHaveLength(2)
  })

  it('records an optional dollar amount alongside the sale, showing a dash when omitted', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Bottle Wine', volumeMl: 750 })
    const user = userEvent.setup()
    renderWithProviders(<WineSalesPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    // First sale: no amount entered.
    await user.click(await screen.findByRole('button', { name: /record sale/i }))
    let modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText(/sold at/i), { target: { value: '2026-01-01T12:00' } })
    await user.selectOptions(within(modal).getByLabelText(/volume entry/i), 'full-bottle')
    await user.click(within(modal).getByRole('button', { name: /^record sale$/i }))
    expect(await screen.findByText('-')).toBeInTheDocument()

    // Second sale: with an amount.
    await user.click(screen.getByRole('button', { name: /record sale/i }))
    modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText(/sold at/i), { target: { value: '2026-01-02T12:00' } })
    await user.selectOptions(within(modal).getByLabelText(/volume entry/i), 'full-bottle')
    await user.type(within(modal).getByLabelText(/amount/i), '45.5')
    await user.click(within(modal).getByRole('button', { name: /^record sale$/i }))

    expect(await screen.findByText('$45.50')).toBeInTheDocument()
  })

  it('records a custom-ml sale and can delete it', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Custom Wine' })
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithProviders(<WineSalesPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    await user.click(await screen.findByRole('button', { name: /record sale/i }))
    const modal = screen.getByRole('dialog')
    fireEvent.change(within(modal).getByLabelText(/sold at/i), { target: { value: '2026-01-01T12:00' } })
    expect(within(modal).getByLabelText(/volume entry/i)).toHaveValue('custom')
    await user.type(within(modal).getByLabelText(/volume \(ml\)/i), '100')
    await user.click(within(modal).getByRole('button', { name: /^record sale$/i }))

    expect(await screen.findAllByText('100ml')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /delete/i }))
    expect(await screen.findByText(/no sales recorded yet/i)).toBeInTheDocument()
  })
})
