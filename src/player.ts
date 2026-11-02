import * as cache from './cache'
import type { Pick } from './codec'
import { mimeOf } from './codec'
import { MS } from './env'

export interface PlayerSource {
  src: string
  fallback?: string
  quality: number
}

const MEDIA_EVENTS = ['play', 'pause', 'timeupdate', 'durationchange', 'ended', 'volumechange', 'ratechange', 'loadedmetadata', 'progress'] as const

/** Preview MSE engine plus a double-buffered source switcher for full-player renditions. */
export class Player extends EventTarget {
  private current: HTMLVideoElement
  private ms?: MediaSource
  private sb?: SourceBuffer
  private url = ''
  private q: ArrayBuffer[] = []
  private tail: 0 | 1 | 2 | 3 = 0
  private headIn = false
  private playing = false
  private dead = false
  private started = false
  private onData?: () => void
  private pendingSeek?: number
  private switchToken = 0
  private quality = 360

  constructor(private host: ParentNode, private pk: Pick) {
    super()
    this.current = this.makeVideo()
  }

  get video() { return this.current }
  get currentTime() { return this.current.currentTime || 0 }
  get duration() { return Number.isFinite(this.current.duration) ? this.current.duration : this.pk.r.dur }
  get paused() { return this.current.paused }
  get currentQuality() { return this.quality }

  private makeVideo() {
    const v = document.createElement('video')
    v.muted = true
    v.loop = true
    v.playsInline = true
    v.preload = 'auto'
    v.tabIndex = -1
    v.disableRemotePlayback = true
    v.setAttribute('aria-hidden', 'true')
    for (const type of MEDIA_EVENTS) v.addEventListener(type, () => {
      if (v === this.current) this.dispatchEvent(new Event(type))
    })
    v.addEventListener('playing', () => {
      if (v !== this.current) return
      this.dispatchEvent(new Event('playing'))
      ;(this.host as ShadowRoot).host?.dispatchEvent(new Event('playing'))
    })
    v.addEventListener('error', () => {
      if (v !== this.current) return
      if (this.ms) this.fallback('video error ' + (v.error?.message ?? v.error?.code ?? ''))
      else this.dispatchEvent(new Event('error'))
    })
    v.addEventListener('loadedmetadata', () => this.applySeek())
    v.addEventListener('progress', () => this.applySeek())
    this.host.appendChild(v)
    return v
  }

  /** Begin loading the preview head. Idempotent. */
  start() {
    if (this.started || this.dead) return
    this.started = true
    if (!this.pk.mse || !MS) return this.progressive()
    const ms = (this.ms = new MS())
    this.url = URL.createObjectURL(ms)
    this.current.src = this.url
    ms.addEventListener('sourceopen', () => {
      if (this.dead || this.ms !== ms) return
      try {
        const sb = (this.sb = ms.addSourceBuffer(mimeOf(this.pk.r)))
        sb.addEventListener('updateend', () => this.pump())
        cache.head(this.pk.r.head).then((b) => {
          if (this.sb !== sb) return
          this.q.unshift(b)
          this.headIn = true
          this.pump()
        }).catch((e) => this.fallback('head ' + e))
        this.fetchTail()
      } catch (e) {
        this.fallback('setup ' + e)
      }
    }, { once: true })
  }

  private pump() {
    const sb = this.sb
    const ms = this.ms
    if (!sb || !ms || !this.headIn || this.dead || sb.updating || ms.readyState !== 'open') return
    this.applySeek()
    const b = this.q.shift()
    if (b) {
      try { sb.appendBuffer(b) } catch (e) { this.fallback('append ' + e) }
    } else if (this.tail === 3) {
      try { ms.endOfStream() } catch { /* already ended */ }
    }
  }

  private fetchTail() {
    if (this.tail !== 1 || !this.sb) return
    this.tail = 2
    const sb = this.sb
    cache.tail(this.pk.r.tail).then((b) => {
      if (this.dead || this.sb !== sb) return
      this.tail = 3
      this.q.push(b)
      this.pump()
    }).catch((e) => this.fallback('tail ' + e))
  }

  private progressive() {
    if (!this.pk.r.full) return
    this.current.src = this.pk.r.full
    this.current.load()
  }

  private fallback(why = '') {
    if (this.dead || !this.pk.mse || !this.pk.r.full) return
    console.debug('[instant-video] MSE failed, using progressive file:', why)
    const time = this.current.currentTime || 0
    this.releaseMse()
    this.pk = { ...this.pk, mse: false }
    this.pendingSeek = time
    this.progressive()
    if (this.playing) this.current.play().catch(() => {})
  }

  private releaseMse() {
    this.q = []
    this.sb = undefined
    this.ms = undefined
    if (this.url) URL.revokeObjectURL(this.url)
    this.url = ''
    this.headIn = false
  }

  play() {
    if (this.dead) return
    this.start()
    if (this.tail === 0) {
      this.tail = 1
      this.fetchTail()
    }
    this.playing = true
    this.showWhenReady()
    this.current.play().catch(() => {})
  }

  pause(rewind = false) {
    this.playing = false
    this.current.pause()
    if (rewind && this.current.readyState >= 1) this.seek(0)
  }

  scrub(progress: number) {
    this.start()
    if (this.tail === 0) {
      this.tail = 1
      this.fetchTail()
    }
    this.pause()
    this.pendingSeek = Math.min(1, Math.max(0, progress)) * Math.max(0, this.pk.r.dur - 1 / 60)
    this.showWhenReady()
    this.applySeek()
  }

  seek(time: number) {
    this.pendingSeek = Math.min(Math.max(0, time), Math.max(0, this.duration - 1 / 120))
    this.applySeek()
  }

  step(frames: number, fps = 25) {
    if (this.current.paused) this.seek(this.currentTime + frames / fps)
  }

  setMediaOptions(options: { muted?: boolean; volume?: number; rate?: number; loop?: boolean; poster?: string; title?: string }) {
    const v = this.current
    if (options.muted !== undefined) v.muted = options.muted
    if (options.volume !== undefined) v.volume = options.volume
    if (options.rate !== undefined) v.playbackRate = options.rate
    if (options.loop !== undefined) v.loop = options.loop
    if (options.poster !== undefined) v.poster = options.poster
    if (options.title !== undefined) v.title = options.title
  }

  private showWhenReady() {
    const v = this.current
    if (v.readyState >= 2) v.classList.add('on')
    else if (!this.onData) {
      this.onData = () => {
        this.onData = undefined
        if (v === this.current) v.classList.add('on')
        this.applySeek()
      }
      v.addEventListener('loadeddata', this.onData, { once: true })
    }
  }

  private applySeek() {
    if (this.pendingSeek === undefined || this.current.readyState < 1) return
    const t = this.pendingSeek
    this.pendingSeek = undefined
    try { if (Math.abs(this.current.currentTime - t) > 1 / 120) this.current.currentTime = t } catch { this.pendingSeek = t }
  }

  /** Prepare a new source behind the current frame and reveal it at the next aligned keyframe. */
  async switchSource(source: PlayerSource, keyframe = 0.48) {
    if (this.dead || source.quality === this.quality) return
    const token = ++this.switchToken
    const old = this.current
    const wasPlaying = !old.paused
    const candidate = this.makeVideo()
    candidate.muted = old.muted
    candidate.volume = old.volume
    candidate.playbackRate = old.playbackRate
    candidate.loop = old.loop
    candidate.poster = old.poster
    candidate.title = old.title
    for (const track of Array.from(old.querySelectorAll('track'))) candidate.append(track.cloneNode(true))

    const load = (url: string) => new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve() }
      const fail = () => { cleanup(); reject(candidate.error) }
      const cleanup = () => {
        candidate.removeEventListener('loadedmetadata', ready)
        candidate.removeEventListener('error', fail)
      }
      candidate.addEventListener('loadedmetadata', ready)
      candidate.addEventListener('error', fail)
      candidate.src = url
      candidate.load()
    })
    try {
      await load(source.src)
    } catch {
      if (!source.fallback) {
        candidate.remove()
        throw new Error(`quality ${source.quality} failed`)
      }
      await load(source.fallback)
    }
    if (token !== this.switchToken || this.dead) return candidate.remove()

    const now = old.currentTime || 0
    const at = wasPlaying ? Math.min(Math.ceil((now + 0.02) / keyframe) * keyframe, Math.max(0, candidate.duration - 0.05)) : Math.min(now, Math.max(0, candidate.duration - 0.05))
    await new Promise<void>((resolve) => {
      const done = () => { candidate.removeEventListener('seeked', done); resolve() }
      candidate.addEventListener('seeked', done)
      candidate.currentTime = at
      if (Math.abs(candidate.currentTime - at) < 1 / 120) done()
    })
    if (token !== this.switchToken || this.dead) return candidate.remove()

    if (wasPlaying) await new Promise<void>((resolve) => {
      const wait = () => {
        if (token !== this.switchToken || this.dead || old.currentTime >= at - 0.025 || old.ended) resolve()
        else requestAnimationFrame(wait)
      }
      wait()
    })
    if (token !== this.switchToken || this.dead) return candidate.remove()

    this.current = candidate
    this.quality = source.quality
    candidate.classList.add('on')
    if (wasPlaying) await candidate.play().catch(() => {})
    old.classList.remove('on')
    old.pause()
    window.setTimeout(() => {
      old.removeAttribute('src')
      old.load()
      old.remove()
    }, 200)
    this.releaseMse()
  }

  stop() {
    this.switchToken++
    if (this.onData) this.current.removeEventListener('loadeddata', this.onData)
    this.onData = undefined
    this.pendingSeek = undefined
    this.current.classList.remove('on')
    this.pause(true)
  }

  destroy() {
    this.dead = true
    this.stop()
    this.releaseMse()
    this.current.removeAttribute('src')
    this.current.load()
    this.current.remove()
  }
}
