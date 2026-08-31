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

async function createWine(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: /new wine/i }))
  await user.type(await screen.findByLabelText('Name'), name)
  await user.click(screen.getByRole('button', { name: /create wine/i }))
}

describe('SettingsWinesPage', () => {
  beforeEach(() => {
    resetTestServices()
  })

  it('opens a detail popup on row click to edit and deactivate a wine', async () => {
    const user = userEvent.setup()
    renderWithProviders(<SettingsWinesPage />)

    await createWine(user, 'Test Wine XYZ')
    const row = (await screen.findByText('Test Wine XYZ')).closest('tr') as HTMLElement

    // Clicking the row opens the detail popup directly - no separate Edit click needed.
    await user.click(row)
    const modal = screen.getByRole('dialog')
    const nameInput = within(modal).getByLabelText('Name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Test Wine Renamed')
    await user.click(within(modal).getByRole('button', { name: /^save$/i }))
    expect(await screen.findByText('Test Wine Renamed')).toBeInTheDocument()

    const renamedRow = screen.getByText('Test Wine Renamed').closest('tr') as HTMLElement
    await user.click(renamedRow)
    const modal2 = screen.getByRole('dialog')
    await user.click(within(modal2).getByRole('button', { name: /deactivate/i }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByText('Test Wine Renamed')).not.toBeInTheDocument())

    await user.click(screen.getByLabelText(/show inactive/i))
    const reappeared = await screen.findByText('Test Wine Renamed')
    expect(reappeared.closest('tr')).toHaveTextContent('Inactive')
  })

  it('deletes a wine that has never been used, from the detail popup', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithProviders(<SettingsWinesPage />)

    await createWine(user, 'Deletable Wine')
    const row = (await screen.findByText('Deletable Wine')).closest('tr') as HTMLElement
    await user.click(row)
    const modal = screen.getByRole('dialog')
    await user.click(within(modal).getByRole('button', { name: /delete/i }))

    await waitFor(() => expect(screen.queryByText('Deletable Wine')).not.toBeInTheDocument())
  })

  it('rejects creating a wine with a duplicate name', async () => {
    const user = userEvent.setup()
    await testServicesState.current.wines.create({ name: 'Existing Wine' })
    renderWithProviders(<SettingsWinesPage />)

    await createWine(user, 'Existing Wine')

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
