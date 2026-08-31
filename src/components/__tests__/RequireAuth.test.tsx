import { screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../../hooks/AuthContext'
import { resetTestServices, testServicesState } from '../../test/mockServices'
import { renderWithProviders } from '../../test/renderWithProviders'
import { RequireAuth } from '../RequireAuth'

vi.mock('../../services', () => ({
  get services() {
    return testServicesState.current
  },
}))

function Protected() {
  return <RequireAuth>{<div>Secret content</div>}</RequireAuth>
}

describe('RequireAuth', () => {
  beforeEach(() => {
    window.localStorage.clear()
    resetTestServices()
  })

  it('redirects to /login when nobody is signed in', async () => {
    renderWithProviders(
      <AuthProvider>
        <Protected />
      </AuthProvider>,
    )

    // RequireAuth issues a <Navigate to="/login" />; with no /login route mounted
    // in this test, we confirm the protected content never renders.
    await waitFor(() => expect(screen.queryByText('Secret content')).not.toBeInTheDocument())
  })

  it('renders the protected content once a session exists', async () => {
    await testServicesState.current.auth.login('demo@restaurant.com', 'password')

    renderWithProviders(
      <AuthProvider>
        <Protected />
      </AuthProvider>,
    )

    expect(await screen.findByText('Secret content')).toBeInTheDocument()
  })
})
