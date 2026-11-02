import { config } from './config'
import { canMse, quality } from './env'
import type { InstantSource, Kind, Rendition, Size } from './types'

export const mimeOf = (r: Rendition) => `video/mp4; codecs="${r.codec}"`

// AV1 only when MediaCapabilities says it decodes smoothly *and* power-efficiently (hardware); otherwise
// H.264, which every device decodes in hardware. Resolved once, off the hover path.
const av1: Partial<Record<Size, boolean>> = {}

export function probeCodecs(src: InstantSource) {
  const mc = navigator.mediaCapabilities
  for (const size of ['m', 's'] as Size[]) {
    const r = src.r[size]?.av1
    if (!r || size in av1) continue
    av1[size] = false
    if (!mc || !canMse(mimeOf(r))) continue
    mc.decodingInfo({
      type: 'media-source',
      video: { contentType: mimeOf(r), width: src.w, height: src.h, bitrate: Math.round(((r.headBytes + r.tailBytes) * 8) / src.dur), framerate: 25 },
    })
      .then((i) => (av1[size] = i.supported && i.smooth && i.powerEfficient))
      .catch(() => {})
  }
}

export interface Pick {
  size: Size
  kind: Kind
  r: Rendition
  /** true when MSE can play this rendition, false when only the progressive file will do */
  mse: boolean
}

export function pick(src: InstantSource): Pick | null {
  const q = quality()
  if (q === 'off') return null
  const sizes: Size[] = q === 's' ? ['s', 'm'] : ['m', 's']
  for (const size of sizes) {
    const set = src.r[size]
    if (!set) continue
    const kinds: Kind[] = config.codec === 'av1' || (config.codec === 'auto' && av1[size]) ? ['av1', 'avc'] : config.codec === 'avc' ? ['avc'] : ['avc', 'av1']
    for (const kind of kinds) {
      const r = set[kind]
      if (!r) continue
      if (canMse(mimeOf(r))) return { size, kind, r, mse: true }
      if (r.full) return { size, kind, r, mse: false }
    }
  }
  return null
}
