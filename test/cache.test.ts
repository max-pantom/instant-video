import { afterEach, describe, expect, it, vi } from 'vitest'
import { head, prefetchHead, tail } from '../src/cache'
import { config } from '../src/config'

const originalPrefetch = config.prefetch
afterEach(() => { config.prefetch = originalPrefetch; vi.unstubAllGlobals() })

describe('ranged preview cache', () => {
  it('requests the head and tail byte ranges', async () => {
    const seen: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get('Range') ?? '')
      return new Response(new Uint8Array([1, 2, 3, 4]), { status: 206 })
    }))
    await head('https://media.example/a.mp4', 99)
    await tail('https://media.example/a.mp4', 100)
    expect(seen).toEqual(['bytes=0-99', 'bytes=100-'])
  })

  it('slices a full 200 response when a host ignores Range', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0, 1, 2, 3, 4]), { status: 200 })))
    expect([...new Uint8Array(await head('https://media.example/b.mp4', 1))]).toEqual([0, 1])
    expect([...new Uint8Array(await tail('https://media.example/b.mp4', 2))]).toEqual([2, 3, 4])
  })

  it('retries with a range-specific URL when a CDN serves the wrong cached range', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url)
      if (urls.length === 1) {
        return new Response(new Uint8Array([0, 1]), { status: 206, headers: { 'Content-Range': 'bytes 0-1/100' } })
      }
      return new Response(new Uint8Array([0, 1, 2, 3]), { status: 206, headers: { 'Content-Range': 'bytes 0-3/100' } })
    }))
    expect([...new Uint8Array(await head('https://media.example/poisoned.mp4', 3))]).toEqual([0, 1, 2, 3])
    expect(urls).toEqual([
      'https://media.example/poisoned.mp4',
      'https://media.example/poisoned.mp4?__iv_range=0-3',
    ])
  })

  it('caps speculative viewport requests at the configured budget', async () => {
    config.prefetch = 2
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })))
    const releases: Array<() => void> = []
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => releases.push(() => resolve(new Response(new Uint8Array([1]), { status: 206 }))))))
    for (let i = 0; i < 4; i++) prefetchHead(`https://media.example/p${i}.mp4`, 9)
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.splice(0, 2).forEach((release) => release())
    await vi.waitFor(() => expect(releases).toHaveLength(2))
    releases.splice(0).forEach((release) => release())
  })
})
