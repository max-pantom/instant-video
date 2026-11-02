import * as cache from './cache'
import type { Pick } from './codec'
import { mimeOf } from './codec'
import { MS } from './env'

/**
 * One <video> fed from fragmented MP4: init + head are appended as soon as the player starts (so frame 0 is
 * decoded and waiting), the tail is fetched when playback is requested and appended behind the head. Without
 * MediaSource the progressive file is used instead.
 */
export class Player {
  readonly video: HTMLVideoElement
  private ms?: MediaSource
  private sb?: SourceBuffer
  private url = ''
  private q: ArrayBuffer[] = []
  private tail: 0 | 1 | 2 | 3 = 0 // not wanted, wanted, fetching, queued
  private headIn = false // init+head must be the first thing appended, whatever arrives first
  private playing = false
  private dead = false
  private started = false
  private onData?: () => void

  constructor(
    host: ParentNode,
    private pk: Pick,
  ) {
    const v = (this.video = document.createElement('video'))
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.preload = 'auto'
    v.tabIndex = -1
    v.disablePictureInPicture = true
    v.disableRemotePlayback = true
    v.setAttribute('aria-hidden', 'true')
    v.addEventListener('error', () => this.fallback('video error ' + (v.error?.code ?? '') + ' ' + (v.error?.message ?? '')))
    // media events do not cross the shadow boundary: re-emit `playing` on the <instant-video> element
    v.addEventListener('playing', () => (host as ShadowRoot).host?.dispatchEvent(new Event('playing')))
    host.appendChild(v)
  }

  /** Begin loading: attach the MediaSource and append init+head. Idempotent. */
  start() {
    if (this.started || this.dead) return
    this.started = true
    if (!this.pk.mse || !MS) return this.progressive()
    const ms = (this.ms = new MS())
    this.url = URL.createObjectURL(ms)
    this.video.src = this.url
    ms.addEventListener(
      'sourceopen',
      () => {
        if (this.dead || this.ms !== ms) return
        try {
          const sb = (this.sb = ms.addSourceBuffer(mimeOf(this.pk.r)))
          sb.addEventListener('updateend', () => this.pump())
          cache
            .head(this.pk.r.head)
            .then((b) => {
              if (this.sb !== sb) return
              this.q.unshift(b)
              this.headIn = true
              this.pump()
            })
            .catch((e) => this.fallback('head ' + e))
          this.fetchTail()
        } catch (e) {
          this.fallback('setup ' + e)
        }
      },
      { once: true },
    )
  }

  private pump() {
    const sb = this.sb
    const ms = this.ms
    if (!sb || !ms || !this.headIn || this.dead || sb.updating || ms.readyState !== 'open') return
    const b = this.q.shift()
    if (b) {
      try {
        sb.appendBuffer(b)
      } catch (e) {
        this.fallback('append ' + e)
      }
    } else if (this.tail === 3) {
      try {
        ms.endOfStream()
      } catch {
        /* already ended */
      }
    }
  }

  private fetchTail() {
    if (this.tail !== 1 || !this.sb) return
    this.tail = 2
    const sb = this.sb
    cache
      .tail(this.pk.r.tail)
      .then((b) => {
        if (this.dead || this.sb !== sb) return
        this.tail = 3
        this.q.push(b)
        this.pump()
      })
      .catch((e) => this.fallback('tail ' + e))
  }

  private progressive() {
    const full = this.pk.r.full
    if (!full) return
    this.video.src = full
    this.video.load()
  }

  /** MSE failed: drop to the progressive file once. */
  private fallback(why = '') {
    if (this.dead || !this.pk.mse || !this.pk.r.full) return
    console.debug('[instant-video] MSE failed, using progressive file:', why)
    this.q = []
    this.sb = undefined
    this.ms = undefined
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
    this.headIn = false
    this.pk = { ...this.pk, mse: false }
    this.progressive()
    if (this.playing) this.video.play().catch(() => {})
  }

  /** Show the video (instantly when frame 0 is already decoded) and play. */
  play(): void {
    if (this.dead) return
    this.start()
    if (this.tail === 0) {
      this.tail = 1
      this.fetchTail()
    }
    this.playing = true
    const v = this.video
    if (v.readyState >= 2) v.classList.add('on')
    else {
      this.onData = () => v.classList.add('on')
      v.addEventListener('loadeddata', this.onData, { once: true })
    }
    v.play().catch(() => {})
  }

  stop() {
    this.playing = false
    const v = this.video
    if (this.onData) v.removeEventListener('loadeddata', this.onData)
    this.onData = undefined
    v.classList.remove('on')
    v.pause()
    if (v.readyState >= 1 && v.currentTime > 0) v.currentTime = 0
  }

  destroy() {
    this.dead = true
    this.stop()
    this.q = []
    this.sb = undefined
    this.ms = undefined
    if (this.url) URL.revokeObjectURL(this.url)
    this.video.removeAttribute('src')
    this.video.load()
    this.video.remove()
  }
}
