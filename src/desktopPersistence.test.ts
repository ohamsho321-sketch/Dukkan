import { beforeEach, expect, it, vi } from 'vitest'
import { emptyData } from './lib/data'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

beforeEach(() => {
  vi.resetModules()
  invoke.mockReset()
})

it('uses revision -1 when saving the first administrator to a fresh SQLite database', async () => {
  let local = ''
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
  vi.stubGlobal('localStorage', {
    getItem: () => local || null,
    setItem: (_key: string, value: string) => { local = value },
  })
  invoke.mockImplementation(async (command: string) => {
    if (command === 'load_app_state') return null
    return null
  })

  const { initializeDesktopPersistence, useAppStore } = await import('./store')
  await initializeDesktopPersistence()
  await useAppStore.getState().completeSetup(
    { ...emptyData.business, name: 'Dukkan' },
    { name: 'Admin', username: 'admin', password: 'test-only-123' },
  )

  const save = invoke.mock.calls.find(([command]) => command === 'save_app_state')
  expect(save?.[1]).toMatchObject({ expectedRevision: -1, revision: 0 })
  expect(invoke).toHaveBeenCalledWith('dashboard_login', {
    username: 'admin',
    password: 'test-only-123',
  })
})
