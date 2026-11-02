import { pick } from './codec'
import { config } from './config'
import { prefetchFor, register, unregister, type Registered } from './registry'
import { Player } from './player'
import { drop, touch } from './pool'
import type { InstantSource } from './types'

const CSS = `
:host{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;contain:strict}
video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;transition:opacity 180ms var(--ease-out,cubic-bezier(.23,1,.32,1))}
video.on{opacity:1;transition:none}
`

/**
 * <instant-video>  (fires a `playing` event when the clip is playing)
 *   .source  InstantSource (the ad's `iv`)      attr/prop `active`: play (loop, muted)
 *   .target  element that counts as the hit area (default: the parent)      attr/prop `warm`: get ready, don't play
 * Layout: fills its positioned parent, sits above the poster image; hidden until a frame is showing.
 */
// importing on the server (SSR) must not throw: there is no HTMLElement there
const Base = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement

export class InstantVideoElement extends Base implements Registered {
  static observedAttributes = ['active', 'warm', 'mode']
  private _src: InstantSource | null = null
  private _target: Element | null = null
  private player?: Player
  private root!: ShadowRoot
  private on = false
  private scrubRaf = 0
  private scrubProgress = 0
  private boundTarget?: Element
  private readonly onPointerMove = (event: Event) => {
    if (!this.on || this.mode !== 'scrub') return
    const e = event as PointerEvent
    if (e.pointerType === 'touch') return
    const r = this.hitTarget.getBoundingClientRect()
    if (!r.width) return
    this.scrubProgress = (e.clientX - r.left) / r.width
    if (!this.scrubRaf) this.scrubRaf = requestAnimationFrame(() => {
      this.scrubRaf = 0
      this.player?.scrub(this.scrubProgress)
    })
  }

  get source() {
    return this._src
  }
  set source(s: InstantSource | null) {
    if (s === this._src) return
    this._src = s
    this.cool()
    if (this.isConnected) {
      unregister(this)
      register(this)
    }
  }
  get target() {
    return this._target
  }
  set target(t: Element | null) {
    if (t === this._target) return
    if (this.isConnected) unregister(this)
    this._target = t
    if (this.isConnected) {
      register(this)
      this.bindTarget()
    }
  }
  get hitTarget(): Element {
    return this._target ?? this.closest('[data-iv-target]') ?? this.parentElement ?? this
  }
  get active() {
    return this.on
  }
  set active(v: boolean) {
    v ? this.setAttribute('active', '') : this.removeAttribute('active')
  }
  get warmed() {
    return this.hasAttribute('warm')
  }
  set warmed(v: boolean) {
    v ? this.setAttribute('warm', '') : this.removeAttribute('warm')
  }
  /** `play` loops normally; `scrub` maps horizontal pointer position to the clip timeline. */
  get mode(): 'play' | 'scrub' {
    return this.getAttribute('mode') === 'scrub' ? 'scrub' : 'play'
  }
  set mode(v: 'play' | 'scrub') {
    v === 'scrub' ? this.setAttribute('mode', 'scrub') : this.removeAttribute('mode')
  }

  connectedCallback() {
    if (!this.root) {
      this.root = this.attachShadow({ mode: 'open' })
      const s = document.createElement('style')
      s.textContent = CSS
      this.root.appendChild(s)
      this.setAttribute('aria-hidden', 'true')
    }
    register(this)
    this.bindTarget()
    this.sync()
  }

  disconnectedCallback() {
    unregister(this)
    this.unbindTarget()
    drop(this)
    this.cool()
  }

  attributeChangedCallback() {
    if (this.isConnected) this.sync()
  }

  private sync() {
    const want = this.hasAttribute('active')
    if (want) this.play()
    else if (this.on) this.pause()
    if (!want && this.hasAttribute('warm')) this.warm()
  }

  private bindTarget() {
    const target = this.hitTarget
    if (target === this.boundTarget) return
    this.unbindTarget()
    this.boundTarget = target
    target.addEventListener('pointermove', this.onPointerMove, { passive: true })
  }

  private unbindTarget() {
    this.boundTarget?.removeEventListener('pointermove', this.onPointerMove)
    this.boundTarget = undefined
    if (this.scrubRaf) cancelAnimationFrame(this.scrubRaf)
    this.scrubRaf = 0
  }

  /** Get a decoded frame 0 ready without playing (idempotent; counts against the pool). */
  warm() {
    if (!this._src || config.poolSize < 1) return
    const p = this.ensure()
    if (!p) return
    p.start()
    touch(this)
  }

  private ensure(): Player | undefined {
    if (this.player) return this.player
    if (!this._src) return
    const pk = pick(this._src)
    if (!pk) return
    return (this.player = new Player(this.root, pk))
  }

  private play() {
    const p = this.ensure()
    if (!p) return
    this.on = true
    if (this.mode === 'scrub') p.scrub(this.scrubProgress)
    else p.play()
    touch(this)
    if (config.prefetch) prefetchFor(this)
  }

  private pause() {
    this.on = false
    this.player?.stop()
  }

  /** Release the player (MediaSource, decoder). */
  cool() {
    this.on = false
    this.player?.destroy()
    this.player = undefined
    drop(this)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('instant-video')) customElements.define('instant-video', InstantVideoElement)
