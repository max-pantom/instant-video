import { config } from './config'
import type { Size } from './types'

type Conn = { saveData?: boolean; effectiveType?: string; downlink?: number }
const conn = (): Conn | undefined => (navigator as Navigator & { connection?: Conn }).connection

/** Speculative request concurrency. Actual playback is never disabled. */
export function prefetchLimit() {
  const value = config.prefetch
  if (value === false || value === 'none' || value === 0 || typeof matchMedia === 'undefined') return 0
  const c = conn()
  if (c?.saveData || (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType))) return 0
  if (matchMedia('(hover: none), (pointer: coarse)').matches) return 0
  return typeof value === 'number' ? Math.max(0, Math.floor(value)) : 4
}

/** 'off' = posters only (reduced motion, Save-Data, 2g); 's' = small rendition on slow links. */
export function quality(): Size | 'off' {
  if (typeof matchMedia === 'undefined') return 'off'
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off'
  const c = conn()
  if (c?.saveData) return 'off'
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return 'off'
  if (config.size !== 'auto') return config.size
  if (c?.effectiveType === '3g' || (c?.downlink !== undefined && c.downlink > 0 && c.downlink < 1.5)) return 's'
  return 'm'
}

type MSCtor = typeof MediaSource
export const MS: MSCtor | undefined =
  typeof window === 'undefined' ? undefined : (window as unknown as { ManagedMediaSource?: MSCtor }).ManagedMediaSource ?? window.MediaSource

export const canMse = (mime: string) => config.mse && !!MS && MS.isTypeSupported(mime)
