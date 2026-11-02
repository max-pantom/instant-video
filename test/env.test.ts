import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config'
import { prefetchLimit } from '../src/env'

const original = config.prefetch
afterEach(() => { config.prefetch = original; vi.unstubAllGlobals() })

describe('prefetch budget', () => {
  it('defaults viewport prefetching to four desktop requests', () => {
    config.prefetch = 'viewport'
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    vi.stubGlobal('navigator', {})
    expect(prefetchLimit()).toBe(4)
  })

  it('disables speculative work on coarse pointers and Save-Data', () => {
    config.prefetch = 'viewport'
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
    vi.stubGlobal('navigator', {})
    expect(prefetchLimit()).toBe(0)
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    expect(prefetchLimit()).toBe(0)
  })

  it('accepts an explicit desktop concurrency limit', () => {
    config.prefetch = 2
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    vi.stubGlobal('navigator', {})
    expect(prefetchLimit()).toBe(2)
  })
})
