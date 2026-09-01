import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { AlertsInventoryPage } from '../AlertsInventoryPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('AlertsInventoryPage', () => {
  beforeEach(() => {
    resetTestServices({ seed: false })
  })

  it('deactivating a threshold clears the flagged alert without deleting the configured level', async () => {
    const user = userEvent.setup()
    const wine = await testServicesState.current.wines.create({ name: 'Low Stock Wine' })
    await testServicesState.current.alerts.setThreshold(wine.id, 5)

    renderWithProviders(<AlertsInventoryPage />)

    // Appears twice: once flagged as low stock, once in the Alert Levels list.
    const nameOccurrences = await screen.findAllByText('Low Stock Wine')
    expect(nameOccurrences).toHaveLength(2)
    expect(screen.getByText('Low stock')).toBeInTheDocument()

    const levelRow = screen.getAllByText('Low Stock Wine')[1].closest('tr') as HTMLElement
    await user.click(levelRow)
    const modal = screen.getByRole('dialog')
    expect(within(modal).getByText('Active')).toBeInTheDocument()
    await user.click(within(modal).getByRole('button', { name: /deactivate/i }))

    await waitFor(() => expect(within(modal).getByText('Inactive')).toBeInTheDocument())
    await user.keyboard('{Escape}')

    // The flagged section clears, but the configured level remains listed (with an Inactive badge) rather than being deleted.
    await waitFor(() => expect(screen.queryByText('Low stock')).not.toBeInTheDocument())
    expect(screen.getByText(/no wines are currently below/i)).toBeInTheDocument()
    const remainingRow = screen.getByText('Low Stock Wine').closest('tr') as HTMLElement
    expect(within(remainingRow).getByLabelText('Deactivated')).toBeInTheDocument()

    const stored = await testServicesState.current.alerts.listThresholds()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ wineId: wine.id, minBottles: 5, active: false })
  })

  it('reactivating restores the flagged alert', async () => {
    const user = userEvent.setup()
    await testServicesState.current.wines.create({ name: 'Paused Wine' })
    const wine = (await testServicesState.current.wines.list())[0]
    await testServicesState.current.alerts.setThreshold(wine.id, 5)
    await testServicesState.current.alerts.setThresholdActive(wine.id, false)

    renderWithProviders(<AlertsInventoryPage />)

    expect(await screen.findByText(/no wines are currently below/i)).toBeInTheDocument()

    const row = screen.getByText('Paused Wine').closest('tr') as HTMLElement
    await user.click(row)
    const modal = screen.getByRole('dialog')
    await user.click(within(modal).getByRole('button', { name: /activate/i }))

    await waitFor(() => expect(screen.queryByText(/no wines are currently below/i)).not.toBeInTheDocument())
    expect(screen.getByText('Low stock')).toBeInTheDocument()
  })
})
