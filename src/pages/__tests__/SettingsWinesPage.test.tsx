import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { SettingsWinesPage } from '../SettingsWinesPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('SettingsWinesPage', () => {
  beforeEach(() => {
    resetTestServices()
  })

  it('creates, edits, and deactivates a wine', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsWinesPage />)

    await user.type(screen.getByLabelText(/new wine name/i), 'Test Wine XYZ')
    await user.click(screen.getByRole('button', { name: /create wine/i }))
    const row = (await screen.findByText('Test Wine XYZ')).closest('tr') as HTMLElement
    expect(row).toBeInTheDocument()

    await user.click(within(row).getByRole('button', { name: /edit/i }))
    const input = within(row).getAllByRole('textbox')[0]
    await user.clear(input)
    await user.type(input, 'Test Wine Renamed')
    await user.click(within(row).getByRole('button', { name: /save/i }))
    expect(await screen.findByText('Test Wine Renamed')).toBeInTheDocument()

    const renamedRow = screen.getByText('Test Wine Renamed').closest('tr') as HTMLElement
    await user.click(within(renamedRow).getByRole('button', { name: /deactivate/i }))
    await waitFor(() => expect(screen.queryByText('Test Wine Renamed')).not.toBeInTheDocument())

    await user.click(screen.getByLabelText(/show inactive/i))
    const reappeared = await screen.findByText('Test Wine Renamed')
    expect(reappeared.closest('tr')).toHaveTextContent('Inactive')
  })

  it('rejects creating a wine with a duplicate name', async () => {
    const user = userEvent.setup()
    await testServicesState.current.wines.create({ name: 'Existing Wine' })
    renderWithProviders(<SettingsWinesPage />)

    await user.type(screen.getByLabelText(/new wine name/i), 'Existing Wine')
    await user.click(screen.getByRole('button', { name: /create wine/i }))

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('filters the list via the search box', async () => {
    const user = userEvent.setup()
    await testServicesState.current.wines.create({ name: 'Zinfandel Reserve' })
    renderWithProviders(<SettingsWinesPage />)

    await screen.findByText('Zinfandel Reserve')
    await user.type(screen.getByLabelText(/search wines/i), 'Zinfandel')

    await waitFor(() => expect(screen.queryByText('Caymus Cabernet Sauvignon')).not.toBeInTheDocument())
    expect(screen.getByText('Zinfandel Reserve')).toBeInTheDocument()
  })
})
