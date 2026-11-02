export type Size = 'm' | 's'
export type Kind = 'avc' | 'av1'
export type FullQuality = 720 | 1080

/** One preview rendition. New manifests use `src` + byte ranges; legacy manifests use `head` + `tail`. */
export interface Rendition {
  codec: string
  /** Single-file fMP4. Bytes `0..headBytes-1` contain init + the first fragments. */
  src?: string
  /** Legacy two-file init + first fragments. */
  head?: string
  /** Legacy two-file remaining fragments. */
  tail?: string
  full?: string
  headDur: number
  dur: number
  headBytes: number
  tailBytes: number
  fullBytes?: number
}

/** A high-quality player rendition. `src` is fMP4; H.264 also carries a progressive fallback. */
export interface FullRendition {
  codec: string
  src: string
  fallback?: string
  w: number
  h: number
  dur: number
  bytes: number
  fallbackBytes?: number
}

/** Contact sheet used by the player's scrub tooltip. */
export interface ThumbnailSprite {
  src: string
  width: number
  height: number
  columns: number
  rows: number
  count: number
  interval: number
}

export interface FullSource {
  r: Partial<Record<FullQuality, Partial<Record<Kind, FullRendition>>>>
  sprite?: ThumbnailSprite
}

export interface PosterCatalogItem { x: number; y: number; width: number; height: number }
export interface PosterCatalog {
  v: 1
  src: string
  width: number
  height: number
  columns: number
  rows: number
  items: Record<string, PosterCatalogItem>
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
  /** Optional high-quality player renditions produced with `instant-video encode --full …`. */
  full?: FullSource
}

export interface Config {
  /** Warm the card the pointer is heading to before it arrives. */
  predict: boolean
  /** Speculative head loading: viewport (default), a concurrency limit, or disabled. */
  prefetch: 'viewport' | 'none' | number | boolean
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
