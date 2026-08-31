import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

interface RenderOptions {
  /** Current URL, e.g. "/wines/wine_1". Defaults to "/". */
  route?: string
  /** Route pattern to match `route` against, e.g. "/wines/:wineId". Required when the page reads useParams. */
  path?: string
}

export function renderWithProviders(ui: ReactElement, { route = '/', path }: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        {path ? (
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
