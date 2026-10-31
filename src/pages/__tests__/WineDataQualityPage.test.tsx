import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { WineDataQualityPage } from '../WineDataQualityPage'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

describe('WineDataQualityPage', () => {
  beforeEach(() => {
    resetTestServices({ seed: false })
  })

  it('lists each missing tracked field for this wine', async () => {
    const wine = await testServicesState.current.wines.create({ name: 'Incomplete Wine' })
    renderWithProviders(<WineDataQualityPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    expect(await screen.findByText('Volume')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
  })

  it('shows an all-clear message when every tracked field is filled in', async () => {
    const wine = await testServicesState.current.wines.create({
      name: 'Complete Wine',
      volumeMl: 750,
      category: 'wine',
      country: 'france',
    })
    renderWithProviders(<WineDataQualityPage />, { route: `/wines/${wine.id}`, path: '/wines/:wineId' })

    expect(await screen.findByText(/all tracked fields are filled in/i)).toBeInTheDocument()
  })
})
