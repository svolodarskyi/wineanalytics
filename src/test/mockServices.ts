import { createMockServices, type MockServicesOptions } from '../services/mock'
import type { Services } from '../services/types'

/**
 * Component tests exercise the real mock backend (never a hand-rolled test
 * double) so they double as an integration check of the services layer.
 *
 * Vitest only hoists `vi.mock(...)` calls that appear directly in a test
 * file, so each component test file must still write its own:
 *
 *   vi.mock('../../services', () => ({ get services() { return testServicesState.current } }))
 *
 * `resetTestServices()` in `beforeEach` then swaps in a fresh, isolated
 * backend per test without needing to re-import React on every test.
 */
export const testServicesState: { current: Services } = { current: createMockServices() }

export function resetTestServices(options: MockServicesOptions = {}): Services {
  testServicesState.current = createMockServices({ latencyMs: 0, processingDelayMs: 10, ...options })
  return testServicesState.current
}
