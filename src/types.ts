export type Size = 'm' | 's'
export type Kind = 'avc' | 'av1'

/** One encoded rendition: fMP4 init+head, the remaining fragments, and a progressive fallback (H.264 only). */
export interface Rendition {
  codec: string
  head: string
  tail: string
  full?: string
  headDur: number
  dur: number
  headBytes: number
  tailBytes: number
  fullBytes?: number
}

/** The manifest written by `instant-video encode` (stored on whatever record owns the clip). */
export interface InstantSource {
  v: number
  dur: number
  fps?: number
  gop?: number
  w: number
  h: number
  poster?: { avif?: string; webp?: string; jpg?: string }
  r: Partial<Record<Size, Partial<Record<Kind, Rendition>>>>
}

export interface Config {
  /** Warm the card the pointer is heading to before it arrives. */
  predict: boolean
  /** Fetch heads of cards near the viewport while idle. */
  prefetch: boolean
  /** Warm players kept alive (elements with a MediaSource at frame 0). 0 disables warming. */
  poolSize: number
  /** How far ahead (ms) the pointer is projected. */
  lookaheadMs: number
  /** Force a rendition size; 'auto' follows Save-Data / connection. */
  size: 'auto' | Size
  /** Force a codec; 'auto' uses MediaCapabilities. */
  codec: 'auto' | Kind
  /** Use MediaSource when available; false forces the progressive fallback. */
  mse: boolean
}
