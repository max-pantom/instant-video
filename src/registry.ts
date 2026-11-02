import { prefetchHead } from './cache'
import { pick, probeCodecs } from './codec'
import { config } from './config'
import { prefetchLimit } from './env'
import type { InstantSource, Rendition } from './types'

/** What the registry needs from an element. */
export interface Registered {
  source: InstantSource | null
  /** The element whose rect/hover/focus/touch counts as intent (the card). */
  hitTarget: Element
  warm(speculative?: boolean): void
}

const near = new Set<Registered>()
const byEl = new Map<Element, Registered>()
const origins = new Set<string>()
let io: IntersectionObserver | undefined
let installed = false

function preconnect(url: string) {
  try {
    const o = new URL(url, location.href).origin
    if (o === location.origin || origins.has(o)) return
    origins.add(o)
    const l = document.createElement('link')
    l.rel = 'preconnect'
    l.href = o
    l.crossOrigin = 'anonymous'
    document.head.appendChild(l)
  } catch {
    /* ignore */
  }
}

/** Fetch the head for an item if prefetching is on and the item can use MSE. */
export function prefetchFor(it: Registered) {
  if (prefetchLimit() < 1 || !it.source) return
  const pk = pick(it.source)
  if (pk?.mse) {
    const url = pk.r.src ?? pk.r.head
    if (url) prefetchHead(url, pk.r.src ? pk.r.headBytes - 1 : undefined)
  }
}

const renditionUrl = (r: Rendition) => r.src ?? r.head

export function register(it: Registered) {
  byEl.set(it.hitTarget, it)
  if (it.source) {
    probeCodecs(it.source)
    const pk = pick(it.source)
    const url = pk && renditionUrl(pk.r)
    if (url) preconnect(url)
  }
  io ??= new IntersectionObserver(
    (es) => {
      for (const e of es) {
        const it = byEl.get(e.target)
        if (!it) continue
        if (e.isIntersecting) {
          near.add(it)
          prefetchFor(it)
        } else near.delete(it)
      }
    },
    { rootMargin: '600px 0px' },
  )
  io.observe(it.hitTarget)
  install()
}

export function unregister(it: Registered) {
  near.delete(it)
  if (byEl.get(it.hitTarget) === it) byEl.delete(it.hitTarget)
  io?.unobserve(it.hitTarget)
}

const owner = (t: EventTarget | null): Registered | undefined => {
  for (let n = t as Node | null; n; n = n.parentNode) {
    const it = byEl.get(n as Element)
    if (it) return it
  }
}

// ---- intent: pointer heading, keyboard focus, touch ------------------------------------------------------
let trail: { t: number; x: number; y: number }[] = []
let raf = 0

function project() {
  raf = 0
  const now = trail[trail.length - 1]
  if (!config.predict || !now || prefetchLimit() < 1) return
  const from = trail.find((s) => now.t - s.t >= 24 && now.t - s.t <= 140)
  if (!from) return
  const dt = now.t - from.t
  const vx = (now.x - from.x) / dt
  const vy = (now.y - from.y) / dt
  const speed = Math.hypot(vx, vy)
  if (speed < 0.12) return // px/ms: drifting, not heading anywhere
  const len = Math.min(Math.max(speed * config.lookaheadMs, 48), 720)
  const dx = (vx / speed) * len
  const dy = (vy / speed) * len
  let best: Registered | undefined
  let bestT = Infinity
  const PAD = 10
  for (const it of near) {
    if (!it.source) continue
    const r = it.hitTarget.getBoundingClientRect()
    if (r.width === 0 || r.bottom < 0 || r.top > innerHeight) continue
    // pointer already inside is a hover, not a prediction
    if (now.x >= r.left && now.x <= r.right && now.y >= r.top && now.y <= r.bottom) continue
    // slab test of the segment now → now+d against the padded rect
    let t0 = 0
    let t1 = 1
    for (const [p, d, lo, hi] of [
      [now.x, dx, r.left - PAD, r.right + PAD],
      [now.y, dy, r.top - PAD, r.bottom + PAD],
    ] as const) {
      if (d === 0) {
        if (p < lo || p > hi) t1 = -1
      } else {
        const a = (lo - p) / d
        const b = (hi - p) / d
        t0 = Math.max(t0, Math.min(a, b))
        t1 = Math.min(t1, Math.max(a, b))
      }
    }
    if (t0 <= t1 && t0 < bestT) {
      best = it
      bestT = t0
    }
  }
  best?.warm(true)
}

function onMove(e: PointerEvent) {
  if (e.pointerType === 'touch' || !config.predict) return
  trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
  if (trail.length > 12) trail.shift()
  if (!raf) raf = requestAnimationFrame(project)
}

function install() {
  if (installed) return
  installed = true
  addEventListener('pointermove', onMove, { passive: true, capture: true })
  document.documentElement.addEventListener('pointerleave', () => (trail = []), { passive: true })
  addEventListener(
    'focusin',
    (e) => {
      const t = e.target as Element
      if (t.matches?.(':focus-visible')) owner(t)?.warm(true)
    },
    { passive: true },
  )
  addEventListener('pointerdown', (e) => e.pointerType === 'touch' && owner(e.target)?.warm(), { passive: true, capture: true })
}
