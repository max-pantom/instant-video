import { pick } from './codec'
import { config } from './config'
import { initialControlState, reduceControlState, type ControlAction, type ControlState } from './control-state'
import { icon } from './icons'
import { prefetchFor, register, unregister, type Registered } from './registry'
import { Player, type PlayerSource } from './player'
import { drop, touch } from './pool'
import type { FullQuality, InstantSource, Kind } from './types'

const CSS = `
:host{--iv-accent:#fff;--iv-fg:#fff;--iv-bg:rgba(10,10,11,.72);--iv-radius:14px;--iv-font:Geist,Inter,ui-sans-serif,system-ui,sans-serif;position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;contain:strict;color:var(--iv-fg);font-family:var(--iv-font)}
:host([mode=player]){pointer-events:auto;contain:layout paint;background:#080808;border-radius:var(--iv-radius);outline:none;touch-action:pan-x}
*{box-sizing:border-box}video{position:absolute;z-index:0;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;transition:opacity 180ms cubic-bezier(.23,1,.32,1)}video.on{opacity:1}
.title{position:absolute;z-index:2;top:16px;left:18px;right:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:550;text-shadow:0 1px 10px #000;opacity:0;transition:opacity 140ms}.player.visible .title{opacity:1}
.player{display:none;position:absolute;z-index:3;inset:0}.player.on{display:block}.controls{position:absolute;left:10px;right:10px;bottom:10px;padding:10px;border:1px solid rgba(255,255,255,.12);border-radius:calc(var(--iv-radius) - 4px);background:var(--iv-bg);box-shadow:0 12px 36px rgba(0,0,0,.38);backdrop-filter:blur(18px) saturate(1.25);-webkit-backdrop-filter:blur(18px) saturate(1.25);opacity:0;transform:translateY(6px);transition:opacity 140ms,transform 180ms cubic-bezier(.23,1,.32,1)}.player.visible .controls{opacity:1;transform:none}
.timeline{position:relative;height:20px;display:flex;align-items:center}.track,.buffered{position:absolute;left:0;right:0;height:3px;border-radius:99px}.track{background:rgba(255,255,255,.2)}.buffered{right:auto;width:0;background:rgba(255,255,255,.42)}input[type=range]{appearance:none;-webkit-appearance:none;position:relative;width:100%;height:20px;margin:0;background:transparent;cursor:pointer}input[type=range]::-webkit-slider-runnable-track{height:3px;background:transparent}input[type=range]::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:11px;height:11px;margin-top:-4px;border:0;border-radius:50%;background:var(--iv-accent);box-shadow:0 0 0 2px rgba(0,0,0,.35)}input[type=range]::-moz-range-track{height:3px;background:transparent}input[type=range]::-moz-range-thumb{width:11px;height:11px;border:0;border-radius:50%;background:var(--iv-accent)}
.tip{display:none;position:absolute;left:0;bottom:27px;transform:translateX(-50%);padding:4px;border-radius:8px;background:#090909;box-shadow:0 6px 22px #000;font:500 11px/1 var(--iv-font);text-align:center;pointer-events:none}.timeline:hover .tip{display:block}.thumb{display:none;width:160px;height:90px;margin-bottom:5px;border-radius:5px;background-repeat:no-repeat;background-color:#111}.tip.has-thumb .thumb{display:block}.tip time{display:block;padding:2px 3px}
.row{display:flex;align-items:center;gap:3px;min-width:0}.spacer{flex:1}.time{margin:0 7px;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;color:rgba(255,255,255,.78)}button,a.dl{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;text-decoration:none;cursor:pointer}button:hover,a.dl:hover{background:rgba(255,255,255,.1)}button[aria-pressed=true]{color:var(--iv-accent);background:rgba(255,255,255,.11)}button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{outline:2px solid var(--iv-accent);outline-offset:2px}.volume{width:66px!important}select{height:30px;max-width:82px;padding:0 7px;border:0;border-radius:7px;background:rgba(255,255,255,.08);color:inherit;font:500 11px var(--iv-font);cursor:pointer}.cc[hidden],.dl[hidden]{display:none}
@media(max-width:620px){.volume,.speed{display:none}.controls{left:6px;right:6px;bottom:6px}.time{margin-inline:4px}.row{gap:1px}button,a.dl{width:30px}}
@media(prefers-reduced-motion:reduce){video,.controls,.title{transition:none!important}}
`

const formatTime = (value: number) => {
  const n = Number.isFinite(value) ? Math.max(0, value) : 0
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = Math.floor(n % 60).toString().padStart(2, '0')
  return h ? `${h}:${m.toString().padStart(2, '0')}:${s}` : `${m}:${s}`
}

const Base = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement

export class InstantVideoElement extends Base implements Registered {
  static observedAttributes = ['active', 'warm', 'mode', 'controls', 'start-at', 'autoplay', 'muted', 'loop', 'poster', 'title', 'download']
  private _src: InstantSource | null = null
  private _target: Element | null = null
  private player?: Player
  private root!: ShadowRoot
  private playerUi?: HTMLElement
  private controlsUi?: HTMLElement
  private on = false
  private boundTarget?: Element
  private state: ControlState = initialControlState()
  private hideTimer = 0
  private touchStart?: { x: number; y: number; at: number }
  private lastTap?: { x: number; at: number }
  private tapTimer = 0
  private trackObserver?: MutationObserver

  get source() { return this._src }
  set source(source: InstantSource | null) {
    if (source === this._src) return
    this._src = source
    this.cool()
    if (this.isConnected) {
      unregister(this)
      register(this)
      this.sync()
    }
  }
  get target() { return this._target }
  set target(target: Element | null) {
    if (target === this._target) return
    if (this.isConnected) unregister(this)
    this._target = target
    if (this.isConnected) { register(this); this.bindTarget() }
  }
  get hitTarget(): Element { return this._target ?? this.closest('[data-iv-target]') ?? this.parentElement ?? this }
  get active() { return this.on }
  set active(value: boolean) { this.toggleAttribute('active', value) }
  get warmed() { return this.hasAttribute('warm') }
  set warmed(value: boolean) { this.toggleAttribute('warm', value) }
  get mode(): 'preview' | 'player' { return this.getAttribute('mode') === 'player' ? 'player' : 'preview' }
  set mode(value: 'preview' | 'player') { value === 'player' ? this.setAttribute('mode', 'player') : this.removeAttribute('mode') }
  get controls() { return this.hasAttribute('controls') }
  set controls(value: boolean) { this.toggleAttribute('controls', value) }
  get startAt() { return Number(this.getAttribute('start-at') ?? 0) || 0 }
  set startAt(value: number) { value ? this.setAttribute('start-at', String(value)) : this.removeAttribute('start-at') }
  get autoPlay() { return this.hasAttribute('autoplay') }
  set autoPlay(value: boolean) { this.toggleAttribute('autoplay', value) }
  get muted() { return this.hasAttribute('muted') }
  set muted(value: boolean) { this.toggleAttribute('muted', value) }
  get loop() { return this.hasAttribute('loop') }
  set loop(value: boolean) { this.toggleAttribute('loop', value) }
  get poster() { return this.getAttribute('poster') ?? '' }
  set poster(value: string) { value ? this.setAttribute('poster', value) : this.removeAttribute('poster') }
  get download() { return this.hasAttribute('download') }
  set download(value: boolean) { this.toggleAttribute('download', value) }

  connectedCallback() {
    if (!this.root) this.build()
    register(this)
    this.bindTarget()
    this.trackObserver = new MutationObserver(() => this.syncTracks())
    this.trackObserver.observe(this, { childList: true, subtree: true, attributes: true })
    this.sync()
  }

  disconnectedCallback() {
    unregister(this)
    this.unbindTarget()
    this.trackObserver?.disconnect()
    clearTimeout(this.hideTimer)
    clearTimeout(this.tapTimer)
    drop(this)
    this.cool()
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (!this.isConnected) return
    if (name === 'mode' && oldValue !== newValue) {
      const mode = this.mode
      this.dispatchEvent(new CustomEvent('modechange', { detail: { mode }, bubbles: true, composed: true }))
    }
    this.sync()
  }

  private build() {
    this.root = this.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = CSS
    this.root.append(style)
    const ui = document.createElement('div')
    ui.className = 'player'
    ui.innerHTML = `<div class="title"></div><div class="controls">
      <div class="timeline"><i class="track"></i><i class="buffered"></i><input data-role="seek" type="range" min="0" max="1000" value="0" aria-label="Seek"><div class="tip"><i class="thumb"></i><time>0:00</time></div></div>
      <div class="row"><button data-action="play" type="button" aria-label="Play">${icon('play')}</button><span class="time"><span data-time="current">0:00</span> / <span data-time="total">0:00</span></span>
      <button data-action="mute" type="button" aria-label="Mute">${icon('volume')}</button><input class="volume" data-role="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume">
      <span class="spacer"></span><select class="speed" data-role="speed" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
      <select data-role="quality" aria-label="Quality"><option value="auto">Auto</option><option value="360">360p</option><option value="720">720p</option><option value="1080">1080p</option></select>
      <button class="cc" data-action="captions" type="button" aria-label="Toggle captions" hidden>${icon('cc')}</button><button data-action="loop" type="button" aria-label="Toggle loop">${icon('loop')}</button><button data-action="pip" type="button" aria-label="Picture in picture">${icon('pip')}</button><button data-action="fullscreen" type="button" aria-label="Fullscreen">${icon('fullscreen')}</button><a class="dl" data-action="download" aria-label="Download video" download hidden>${icon('download')}</a></div>
    </div>`
    this.root.append(ui)
    this.playerUi = ui
    this.controlsUi = ui.querySelector('.controls') as HTMLElement
    ui.addEventListener('click', this.onControlClick)
    ui.querySelector<HTMLInputElement>('[data-role=seek]')!.addEventListener('input', this.onSeek)
    ui.querySelector<HTMLInputElement>('[data-role=volume]')!.addEventListener('input', this.onVolume)
    ui.querySelector<HTMLSelectElement>('[data-role=speed]')!.addEventListener('change', this.onSpeed)
    ui.querySelector<HTMLSelectElement>('[data-role=quality]')!.addEventListener('change', this.onQuality)
    const timeline = ui.querySelector('.timeline')!
    timeline.addEventListener('pointermove', this.onTimelineHover)
    this.addEventListener('keydown', this.onKeyDown)
    this.addEventListener('pointermove', this.onActivity, { passive: true })
    this.addEventListener('pointerdown', this.onTouchDown, { passive: true })
    this.addEventListener('pointerup', this.onTouchUp, { passive: true })
  }

  private sync() {
    const playerMode = this.mode === 'player'
    this.playerUi?.classList.toggle('on', playerMode)
    this.playerUi?.classList.toggle('visible', playerMode && this.controls)
    this.setAttribute('aria-hidden', String(!playerMode))
    if (playerMode) {
      if (!this.hasAttribute('tabindex')) this.tabIndex = 0
      this.enterPlayer()
      return
    }
    this.tabIndex = -1
    const want = this.hasAttribute('active')
    if (want) this.playPreview()
    else if (this.on) this.pausePreview()
    if (!want && this.hasAttribute('warm')) this.warm()
  }

  private bindTarget() {
    const target = this.hitTarget
    if (target === this.boundTarget) return
    this.unbindTarget()
    this.boundTarget = target
  }
  private unbindTarget() { this.boundTarget = undefined }

  warm() {
    if (!this._src || config.poolSize < 1) return
    const player = this.ensure()
    if (!player) return
    player.start()
    touch(this)
  }

  private ensure() {
    if (this.player) return this.player
    if (!this._src) return
    const selected = pick(this._src)
    if (!selected) return
    const player = (this.player = new Player(this.root, selected))
    for (const type of ['play', 'pause', 'timeupdate', 'ended', 'error'] as const) player.addEventListener(type, () => {
      if (type === 'play') this.act({ type: 'play' })
      if (type === 'pause') this.act({ type: 'pause' })
      if (type === 'timeupdate') this.renderTime()
      this.dispatchEvent(new Event(type, { bubbles: true, composed: true }))
    })
    player.addEventListener('progress', () => this.renderTime())
    this.syncTracks()
    return player
  }

  private playPreview() {
    const player = this.ensure()
    if (!player) return
    this.on = true
    player.setMediaOptions({ muted: true, loop: true })
    player.play()
    touch(this)
    if (config.prefetch) prefetchFor(this)
  }
  private pausePreview() {
    this.on = false
    this.player?.stop()
  }

  private enterPlayer() {
    const player = this.ensure()
    if (!player) return
    this.on = true
    player.setMediaOptions({ muted: this.muted, loop: this.loop, poster: this.poster, title: this.title, volume: this.state.volume, rate: this.state.rate })
    this.state = { ...this.state, muted: this.muted, loop: this.loop }
    if (this.startAt > 0 && player.currentTime < 0.05) player.seek(this.startAt)
    this.syncTracks()
    this.renderQualityOptions()
    this.render()
    this.updateDownload()
    this.showControls()
    if (this.autoPlay || !player.paused || this.hasAttribute('active')) player.play()
    this.selectQuality(this.state.quality)
  }

  private act(action: ControlAction) {
    this.state = reduceControlState(this.state, action)
    this.render()
  }

  private render() {
    if (!this.playerUi || !this.player) return
    const play = this.playerUi.querySelector<HTMLButtonElement>('[data-action=play]')!
    play.innerHTML = icon(this.state.playing ? 'pause' : 'play')
    play.ariaLabel = this.state.playing ? 'Pause' : 'Play'
    const mute = this.playerUi.querySelector<HTMLButtonElement>('[data-action=mute]')!
    mute.innerHTML = icon(this.state.muted || this.state.volume === 0 ? 'muted' : 'volume')
    mute.ariaLabel = this.state.muted ? 'Unmute' : 'Mute'
    this.playerUi.querySelector<HTMLButtonElement>('[data-action=loop]')!.setAttribute('aria-pressed', String(this.state.loop))
    this.playerUi.querySelector<HTMLButtonElement>('[data-action=captions]')!.setAttribute('aria-pressed', String(this.state.captions))
    this.playerUi.classList.toggle('visible', this.controls && this.state.controlsVisible)
    const title = this.playerUi.querySelector('.title')!
    title.textContent = this.title
    this.renderTime()
  }

  private renderTime() {
    if (!this.playerUi || !this.player) return
    const time = this.player.currentTime
    const duration = this.player.duration || this._src?.dur || 0
    this.playerUi.querySelector('[data-time=current]')!.textContent = formatTime(time)
    this.playerUi.querySelector('[data-time=total]')!.textContent = formatTime(duration)
    const seek = this.playerUi.querySelector<HTMLInputElement>('[data-role=seek]')!
    seek.value = String(duration ? Math.round((time / duration) * 1000) : 0)
    const ranges = this.player.video.buffered
    const buffered = ranges.length && duration ? (ranges.end(ranges.length - 1) / duration) * 100 : 0
    ;(this.playerUi.querySelector('.buffered') as HTMLElement).style.width = `${Math.min(100, buffered)}%`
  }

  private renderQualityOptions() {
    const select = this.playerUi?.querySelector<HTMLSelectElement>('[data-role=quality]')
    if (!select) return
    for (const option of Array.from(select.options)) {
      const q = Number(option.value)
      option.disabled = !!q && q !== 360 && !this._src?.full?.r[q as FullQuality]
    }
  }

  private resolveQuality(requested: ControlState['quality']): { source?: PlayerSource; value: number } {
    if (requested === 360 || !this._src?.full) return { value: 360, source: this._src?.r.m?.avc?.full ? { src: this._src.r.m.avc.full, quality: 360 } : undefined }
    const available = ([720, 1080] as FullQuality[]).filter((q) => this._src!.full!.r[q])
    const target = requested === 'auto'
      ? available.filter((q) => q <= Math.max(720, this.clientHeight * Math.min(devicePixelRatio || 1, 2))).at(-1) ?? available[0]
      : requested
    if (!target) return { value: 360 }
    const set = this._src.full.r[target as FullQuality]
    if (!set) return { value: 360 }
    const order: Kind[] = ['av1', 'avc']
    for (const kind of order) {
      const rendition = set[kind]
      if (!rendition) continue
      if (kind === 'av1' && !this.player?.video.canPlayType(`video/mp4; codecs="${rendition.codec}"`)) continue
      return { value: target, source: { src: rendition.src, fallback: rendition.fallback ?? set.avc?.fallback, quality: target } }
    }
    return { value: 360 }
  }

  private async selectQuality(requested: ControlState['quality']) {
    const player = this.player
    if (!player) return
    const { source, value } = this.resolveQuality(requested)
    if (!source || value === player.currentQuality) return
    try {
      await player.switchSource(source, (this._src?.gop ?? 12) / (this._src?.fps ?? 25))
      this.updateDownload(source.fallback ?? source.src)
      this.dispatchEvent(new CustomEvent('qualitychange', { detail: { quality: value, requested }, bubbles: true, composed: true }))
    } catch (error) {
      this.dispatchEvent(new CustomEvent('error', { detail: { error }, bubbles: true, composed: true }))
    }
  }

  private updateDownload(src?: string) {
    const link = this.playerUi?.querySelector<HTMLAnchorElement>('[data-action=download]')
    if (!link) return
    link.hidden = !this.download
    link.href = src ?? this.player?.video.currentSrc ?? ''
  }

  private syncTracks() {
    if (!this.player) return
    this.player.video.querySelectorAll('track').forEach((node) => node.remove())
    for (const source of Array.from(this.querySelectorAll('track'))) this.player.video.append(source.cloneNode(true))
    const hasCaptions = this.player.video.textTracks.length > 0 || !!this.querySelector('track')
    const button = this.playerUi?.querySelector<HTMLButtonElement>('[data-action=captions]')
    if (button) button.hidden = !hasCaptions
    this.applyCaptions()
  }

  private applyCaptions() {
    if (!this.player) return
    for (const track of Array.from(this.player.video.textTracks)) track.mode = this.state.captions ? 'showing' : 'disabled'
  }

  private togglePlay() {
    if (!this.player) return
    if (this.player.paused) this.player.play()
    else this.player.pause()
  }
  private seekBy(delta: number) { this.player?.seek((this.player.currentTime ?? 0) + delta) }

  private readonly onControlClick = (event: Event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action
    if (!action || action === 'download') return
    if (action === 'play') this.togglePlay()
    if (action === 'mute' && this.player) {
      this.act({ type: 'toggle-muted' })
      this.player.setMediaOptions({ muted: this.state.muted })
    }
    if (action === 'loop' && this.player) {
      this.act({ type: 'toggle-loop' })
      this.player.setMediaOptions({ loop: this.state.loop })
    }
    if (action === 'captions') {
      this.act({ type: 'toggle-captions' })
      this.applyCaptions()
    }
    if (action === 'pip') this.player?.video.requestPictureInPicture?.().catch(() => {})
    if (action === 'fullscreen') (document.fullscreenElement ? document.exitFullscreen() : this.requestFullscreen()).catch(() => {})
    this.showControls()
  }
  private readonly onSeek = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement
    this.player?.seek((Number(input.value) / 1000) * (this.player.duration || 0))
    this.showControls()
  }
  private readonly onVolume = (event: Event) => {
    this.act({ type: 'volume', value: Number((event.currentTarget as HTMLInputElement).value) })
    this.player?.setMediaOptions({ volume: this.state.volume, muted: this.state.muted })
  }
  private readonly onSpeed = (event: Event) => {
    this.act({ type: 'rate', value: Number((event.currentTarget as HTMLSelectElement).value) })
    this.player?.setMediaOptions({ rate: this.state.rate })
  }
  private readonly onQuality = (event: Event) => {
    const raw = (event.currentTarget as HTMLSelectElement).value
    const value = raw === 'auto' ? 'auto' : Number(raw) as 360 | 720 | 1080
    this.act({ type: 'quality', value })
    this.selectQuality(value)
  }
  private readonly onTimelineHover = (event: Event) => {
    if (!this.playerUi || !this.player) return
    const timeline = event.currentTarget as HTMLElement
    const rect = timeline.getBoundingClientRect()
    const progress = Math.min(1, Math.max(0, ((event as PointerEvent).clientX - rect.left) / rect.width))
    const time = progress * this.player.duration
    const tip = timeline.querySelector('.tip') as HTMLElement
    tip.style.left = `${progress * 100}%`
    tip.querySelector('time')!.textContent = formatTime(time)
    const sprite = this._src?.full?.sprite
    if (sprite) {
      const frame = Math.min(sprite.count - 1, Math.floor(time / sprite.interval))
      const x = frame % sprite.columns
      const y = Math.floor(frame / sprite.columns)
      const thumb = tip.querySelector('.thumb') as HTMLElement
      thumb.style.backgroundImage = `url("${sprite.src.replace(/"/g, '%22')}")`
      thumb.style.backgroundPosition = `${-x * sprite.width}px ${-y * sprite.height}px`
      thumb.style.backgroundSize = `${sprite.columns * sprite.width}px ${sprite.rows * sprite.height}px`
      tip.classList.add('has-thumb')
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.mode !== 'player' || (event.target as HTMLElement).matches('input,select,button,a')) return
    const key = event.key.toLowerCase()
    if (key === ' ' || key === 'k') this.togglePlay()
    else if (key === 'j') this.seekBy(-10)
    else if (key === 'l') this.seekBy(10)
    else if (key === 'arrowleft') this.seekBy(-5)
    else if (key === 'arrowright') this.seekBy(5)
    else if (key === 'arrowup' || key === 'arrowdown') {
      const volume = Math.min(1, Math.max(0, this.state.volume + (key === 'arrowup' ? 0.1 : -0.1)))
      this.act({ type: 'volume', value: volume })
      this.player?.setMediaOptions({ volume, muted: volume === 0 })
    } else if (key === 'm' && this.player) {
      this.act({ type: 'toggle-muted' })
      this.player.setMediaOptions({ muted: this.state.muted })
    }
    else if (key === 'f') (document.fullscreenElement ? document.exitFullscreen() : this.requestFullscreen()).catch(() => {})
    else if (/^[0-9]$/.test(key)) this.player?.seek((Number(key) / 10) * this.player.duration)
    else if ((key === ',' || key === '.') && this.player?.paused) this.player.step(key === ',' ? -1 : 1, this._src?.fps)
    else return
    event.preventDefault()
    this.showControls()
  }

  private showControls() {
    if (!this.controls) return
    this.act({ type: 'show-controls' })
    clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => this.act({ type: 'hide-controls' }), 2000)
  }
  private readonly onActivity = () => this.mode === 'player' && this.showControls()
  private readonly onTouchDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && !(event.target as HTMLElement).closest('.controls')) this.touchStart = { x: event.clientX, y: event.clientY, at: performance.now() }
  }
  private readonly onTouchUp = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !this.touchStart || (event.target as HTMLElement).closest('.controls')) return
    const start = this.touchStart
    this.touchStart = undefined
    if (event.clientY - start.y > 60 && this.closest('[data-iv-sheet],dialog,[role=dialog]')) {
      this.dispatchEvent(new CustomEvent('iv-close', { bubbles: true, composed: true }))
      return
    }
    const now = performance.now()
    if (this.lastTap && now - this.lastTap.at < 300 && Math.abs(event.clientX - this.lastTap.x) < 80) {
      clearTimeout(this.tapTimer)
      this.seekBy(event.clientX < this.getBoundingClientRect().left + this.clientWidth / 2 ? -10 : 10)
      this.lastTap = undefined
    } else {
      this.lastTap = { x: event.clientX, at: now }
      this.tapTimer = window.setTimeout(() => { this.state.controlsVisible ? this.act({ type: 'hide-controls' }) : this.showControls(); this.lastTap = undefined }, 300)
    }
  }

  cool() {
    this.on = false
    this.player?.destroy()
    this.player = undefined
    drop(this)
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('instant-video')) customElements.define('instant-video', InstantVideoElement)
