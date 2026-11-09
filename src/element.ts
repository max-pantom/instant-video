import { pick } from './codec'
import { config } from './config'
import { quality } from './env'
import { initialControlState, reduceControlState, type ControlAction, type ControlState } from './control-state'
import { icon } from './icons'
import { prefetchFor, register, unregister, type Registered } from './registry'
import { Player, type PlayerSource } from './player'
import { drop, touch } from './pool'
import type { FullQuality, InstantSource, Kind } from './types'

const CSS = `
:host{--iv-accent:#fff;--iv-fg:#fff;--iv-bg:#010101;--iv-dim:rgba(255,255,255,.72);--iv-radius:14px;--iv-font:Inter,ui-sans-serif,system-ui,sans-serif;--iv-ease:cubic-bezier(.23,1,.32,1);position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none;contain:strict;color:var(--iv-fg);font-family:var(--iv-font);-webkit-font-smoothing:antialiased}
:host([mode=player]){pointer-events:auto;contain:layout paint;background:var(--iv-bg);border-radius:var(--iv-radius);outline:none;touch-action:manipulation}:host([mode=player]:focus-visible){outline:2px solid var(--iv-accent);outline-offset:-2px}
*{box-sizing:border-box}video{position:absolute;z-index:0;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;pointer-events:none;transition:opacity 180ms var(--iv-ease)}video.on{opacity:1}
.player{display:none;position:absolute;z-index:3;inset:0}.player.on{display:block}
.player::before{content:"";position:absolute;inset:0 0 auto;height:96px;background:linear-gradient(rgba(1,1,1,.5),transparent);opacity:0;transition:opacity 200ms var(--iv-ease);pointer-events:none}.player.visible.has-title::before{opacity:1}
.title{position:absolute;z-index:2;top:14px;left:16px;right:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;font-weight:500;opacity:0;transition:opacity 200ms var(--iv-ease)}.player.visible .title{opacity:1}
.player.on:not(.visible){cursor:none}.player.sheet{touch-action:pan-x}
.center{position:absolute;z-index:4;left:50%;top:46%;width:68px;height:68px;padding:0;border:0;border-radius:50%;background:#fff;color:#010101;transform:translate(-50%,-50%);cursor:pointer;box-shadow:0 0 0 .5px #fff,0 1px 1px rgba(0,0,0,.18),0 10px 24px -8px rgba(0,0,0,.65);transition:transform 150ms var(--iv-ease),opacity 160ms var(--iv-ease)}.center svg{width:28px;height:28px}.center:active{transform:translate(-50%,-50%) scale(.96)}.player.playing .center{opacity:0;pointer-events:none}
.controls{position:absolute;left:12px;right:12px;bottom:12px;padding:8px 8px 6px;border-radius:14px;background:rgba(1,1,1,.78);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 0 0 .5px rgba(255,255,255,.16),0 12px 28px -16px rgba(0,0,0,.85);opacity:0;transition:opacity 200ms var(--iv-ease);pointer-events:none}.player.visible .controls,.player.on .controls:focus-within{opacity:1;pointer-events:auto}
@starting-style{.player.on.visible .controls,.player.on.visible .title{opacity:0}}
.timeline{position:relative;height:20px;margin:0 6px 2px;display:flex;align-items:center}.bars{position:absolute;left:0;right:0;height:4px;pointer-events:none}.bars i{position:absolute;inset:0;border-radius:99px;transform-origin:left}.track{background:rgba(255,255,255,.22)}.buffered{background:rgba(255,255,255,.38);transform:scaleX(0)}.played{background:var(--iv-accent);transform:scaleX(0)}
input[type=range]{appearance:none;-webkit-appearance:none;position:relative;width:100%;height:20px;margin:0;background:transparent;cursor:pointer;touch-action:none}input[type=range]::-webkit-slider-runnable-track{height:4px;background:transparent}input[type=range]::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:14px;height:14px;margin-top:-5px;border:0;border-radius:50%;background:#fff;box-shadow:0 0 0 .5px rgba(1,1,1,.4),0 1px 3px rgba(0,0,0,.45)}input[type=range]::-moz-range-track{height:4px;background:transparent;border:0}input[type=range]::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:50%;background:#fff;box-shadow:0 0 0 .5px rgba(1,1,1,.4),0 1px 3px rgba(0,0,0,.45)}
.tip{display:none;position:absolute;left:0;bottom:22px;padding:3px;border-radius:7px;background:rgba(1,1,1,.88);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);font:500 12px/1 var(--iv-font);font-variant-numeric:tabular-nums;text-align:center;pointer-events:none}.thumb{display:none;width:160px;height:90px;margin-bottom:3px;border-radius:4px;background-repeat:no-repeat;background-color:#111}.tip.has-thumb .thumb{display:block}.tip time{display:block;padding:3px 4px}
@media(hover:hover) and (pointer:fine){.timeline:hover .tip{display:block}.vol:hover .volume{opacity:1;transform:none;pointer-events:auto}button:hover,a.dl:hover{color:#fff;background:rgba(255,255,255,.1)}.center:hover{background:#fff}.menu button:hover{background:rgba(255,255,255,.08)}}
.row{display:flex;align-items:center;gap:1px;min-width:0}.spacer{flex:1}.time{margin:0 10px 0 4px;font-size:13px;line-height:18px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap;color:rgba(255,255,255,.62)}.time span:first-child{color:#fff}
button,a.dl{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.88);font:500 13px/1 var(--iv-font);text-decoration:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;transition:color 120ms var(--iv-ease),background-color 120ms var(--iv-ease),transform 150ms var(--iv-ease)}button svg,a.dl svg{display:block}
button:not(:disabled):active,a.dl:active{transform:scale(.94);color:#fff}button.center:hover,button.center:active{background:#fff;color:#010101}button.center:active{transform:translate(-50%,-50%) scale(.96)}button[aria-pressed=true],button[aria-expanded=true]{color:#fff;background:rgba(255,255,255,.1)}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid #fff;outline-offset:0;box-shadow:0 0 0 4px rgba(1,1,1,.7)}.cc[hidden],.dl[hidden]{display:none}
.vol{display:flex;align-items:center}.volume{width:64px!important;margin-right:4px;opacity:0;transform:translateX(4px);pointer-events:none;transition:opacity 160ms var(--iv-ease),transform 160ms var(--iv-ease)}.vol:focus-within .volume{opacity:1;transform:none;pointer-events:auto}.volume::-webkit-slider-runnable-track{background:rgba(255,255,255,.25)!important;border-radius:99px}.volume::-moz-range-track{background:rgba(255,255,255,.25)!important;border-radius:99px}.volume::-webkit-slider-thumb{opacity:1!important;transform:none!important}.volume::-moz-range-thumb{opacity:1!important;transform:none!important}
.pick{position:relative}.pick>button{width:auto;min-width:30px;padding:0 7px;font-variant-numeric:tabular-nums}
.menu{position:absolute;right:0;bottom:calc(100% + 6px);min-width:120px;padding:4px;border-radius:9px;background:rgba(14,14,14,.96);box-shadow:0 0 0 0.5px #4a4a4a,0 4px 8px -4px rgba(0,0,0,.5);transform-origin:bottom right;transition:opacity 140ms var(--iv-ease),transform 140ms var(--iv-ease)}.menu[hidden]{display:none}
@starting-style{.menu{opacity:0;transform:translateY(4px) scale(.97)}}
.menu-label{padding:6px 8px 4px;font-size:12px;line-height:16px;color:rgba(255,255,255,.55)}.menu button{display:flex;justify-content:space-between;gap:12px;width:100%;height:28px;padding:0 6px 0 8px;font-size:13px;font-weight:400;color:var(--iv-dim);border-radius:5px}.menu button svg{opacity:0;filter:none}.menu button[aria-checked=true]{color:var(--iv-fg)}.menu button[aria-checked=true] svg{opacity:1}.menu button:not(:disabled):active{transform:none;background:rgba(255,255,255,.12)}.menu button:focus-visible{outline:2px solid var(--iv-accent);outline-offset:-2px;box-shadow:none;background:rgba(255,255,255,.1);color:var(--iv-fg)}.menu button:disabled{opacity:.32;cursor:default;background:none}
@media(pointer:coarse){button,a.dl{width:44px;height:44px}.pick>button{height:44px}.center{width:72px;height:72px}.timeline,input[type=range]{height:28px}}
@media(max-width:620px){.vol .volume,.speed{display:none}.controls{left:8px;right:8px;bottom:8px;padding:6px 4px 4px}.time{margin-inline:4px}.row{gap:0}}
@media(prefers-reduced-motion:reduce){.bars,.volume,button,a.dl,.menu,input[type=range]::-webkit-slider-thumb,input[type=range]::-moz-range-thumb{transition-property:opacity,color,background-color!important}button:active,a.dl:active,.volume{transform:none!important}@starting-style{.menu{transform:none}}}
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
  private timelineRect?: DOMRect
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
    const item = (value: string, label: string) => `<button type="button" role="menuitemradio" data-value="${value}" aria-checked="false"><span>${label}</span>${icon('check')}</button>`
    ui.innerHTML = `<div class="title"></div><button class="center" data-action="play" type="button" aria-label="Play">${icon('playSolid', 28)}</button><div class="controls">
      <div class="timeline"><i class="bars"><i class="track"></i><i class="buffered"></i><i class="played"></i></i><input data-role="seek" type="range" min="0" max="1000" value="0" aria-label="Seek" aria-valuetext="0:00"><div class="tip"><i class="thumb"></i><time>0:00</time></div></div>
      <div class="row"><button data-action="play" type="button" aria-label="Play">${icon('playSolid')}</button>
      <span class="time"><span data-time="current">0:00</span> / <span data-time="total">0:00</span></span>
      <span class="spacer"></span>
      <div class="vol"><input class="volume" data-role="volume" type="range" min="0" max="1" step="0.05" value="1" aria-label="Volume" aria-valuetext="100%"><button data-action="mute" type="button" aria-label="Mute">${icon('volume')}</button></div>
      <div class="pick speed"><button type="button" data-menu="speed" aria-haspopup="menu" aria-expanded="false" aria-label="Speed 1×">1×</button><div class="menu" role="menu" data-role="speed" aria-label="Speed" hidden><div class="menu-label">Speed</div>${[0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => item(String(v), v === 1 ? 'Normal' : `${v}×`)).join('')}</div></div>
      <div class="pick"><button type="button" data-menu="quality" aria-haspopup="menu" aria-expanded="false" aria-label="Quality Auto">Auto</button><div class="menu" role="menu" data-role="quality" aria-label="Quality" hidden><div class="menu-label">Quality</div>${item('auto', 'Auto')}${item('1080', '1080p')}${item('720', '720p')}${item('360', '360p')}</div></div>
      <button class="cc" data-action="captions" type="button" aria-label="Captions" aria-pressed="false" hidden>${icon('cc')}</button><button data-action="loop" type="button" aria-label="Loop" aria-pressed="false">${icon('loop')}</button><button data-action="pip" type="button" aria-label="Picture-in-picture">${icon('pip')}</button><a class="dl" data-action="download" aria-label="Download video" download hidden>${icon('download')}</a><button data-action="fullscreen" type="button" aria-label="Enter fullscreen">${icon('fullscreen')}</button></div>
    </div>`
    this.root.append(ui)
    this.playerUi = ui
    this.controlsUi = ui.querySelector('.controls') as HTMLElement
    ui.addEventListener('click', this.onControlClick)
    ui.addEventListener('keydown', this.onMenuKey)
    ui.querySelector<HTMLInputElement>('[data-role=seek]')!.addEventListener('input', this.onSeek)
    ui.querySelector<HTMLInputElement>('[data-role=volume]')!.addEventListener('input', this.onVolume)
    const timeline = ui.querySelector('.timeline')!
    timeline.addEventListener('pointermove', this.onTimelineHover)
    timeline.addEventListener('pointerenter', () => { this.timelineRect = undefined })
    ui.querySelector<HTMLInputElement>('[data-role=seek]')!.addEventListener('keydown', this.onSeekKey)
    ui.addEventListener('focusin', () => this.showControls())
    this.addEventListener('fullscreenchange', () => { this.timelineRect = undefined; this.render() })
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
    // Swipe-down-to-close needs vertical touches inside sheets; elsewhere the page must still scroll over the player.
    this.playerUi?.classList.toggle('sheet', playerMode && !!this.closest('[data-iv-sheet],dialog,[role=dialog]'))
    if (playerMode) {
      this.tabIndex = 0
      this.setAttribute('role', 'region')
      this.setAttribute('aria-label', this.title || 'Video player')
      this.enterPlayer()
      return
    }
    this.removeAttribute('role')
    this.removeAttribute('aria-label')
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

  warm(speculative = false) {
    if (!this._src || config.poolSize < 1) return
    const player = this.ensure()
    if (!player) return
    player.start(speculative ? 'low' : 'high')
    touch(this)
  }

  private ensure() {
    if (this.player) return this.player
    if (!this._src) return
    const selected = pick(this._src, this.mode === 'player')
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
    // posters only (reduced motion, Save-Data, 2g), even if a player exists from an earlier player-mode session
    if (quality() === 'off') return
    const player = this.ensure()
    if (!player) return
    this.on = true
    player.setMediaOptions({ muted: true, loop: true })
    player.play()
    touch(this)
    if (config.prefetch) prefetchFor(this)
  }
  /** Preview mode: show the frame at `progress` (0–1) of the clip, paused. Call from pointermove; `active = false` rewinds. */
  scrub(progress: number) {
    if (quality() === 'off') return
    const player = this.ensure()
    if (!player) return
    this.on = true
    player.setMediaOptions({ muted: true, loop: true })
    player.scrub(progress)
    touch(this)
  }
  /** Preview mode: carry on playing from the frame `scrub` left it on. */
  resume() {
    this.playPreview()
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
    const playIcon = this.state.playing ? 'pause' : 'playSolid'
    this.playerUi.classList.toggle('playing', this.state.playing)
    for (const play of this.playerUi.querySelectorAll<HTMLButtonElement>('[data-action=play]')) {
      if (play.dataset.icon === playIcon) continue
      play.dataset.icon = playIcon
      play.innerHTML = icon(playIcon, play.classList.contains('center') ? 28 : 20)
      play.ariaLabel = this.state.playing ? 'Pause' : 'Play'
    }
    const mute = this.playerUi.querySelector<HTMLButtonElement>('[data-action=mute]')!
    const silent = this.state.muted || this.state.volume === 0
    if (mute.dataset.icon !== String(silent)) {
      mute.dataset.icon = String(silent)
      mute.innerHTML = icon(silent ? 'muted' : 'volume')
      mute.ariaLabel = silent ? 'Unmute' : 'Mute'
    }
    this.playerUi.querySelector('[data-role=volume]')!.setAttribute('aria-valuetext', `${Math.round((silent ? 0 : this.state.volume) * 100)}%`)
    this.playerUi.querySelector<HTMLButtonElement>('[data-action=loop]')!.setAttribute('aria-pressed', String(this.state.loop))
    this.playerUi.querySelector<HTMLButtonElement>('[data-action=captions]')!.setAttribute('aria-pressed', String(this.state.captions))
    const full = document.fullscreenElement === this
    const fullscreen = this.playerUi.querySelector<HTMLButtonElement>('[data-action=fullscreen]')!
    if (fullscreen.dataset.icon !== String(full)) {
      fullscreen.dataset.icon = String(full)
      fullscreen.innerHTML = icon(full ? 'exitFullscreen' : 'fullscreen')
      fullscreen.ariaLabel = full ? 'Exit fullscreen' : 'Enter fullscreen'
    }
    this.renderMenu('speed', String(this.state.rate), `${this.state.rate}×`)
    this.renderMenu('quality', String(this.state.quality), this.state.quality === 'auto' ? 'Auto' : `${this.state.quality}p`)
    const visible = this.controls && this.state.controlsVisible
    this.playerUi.classList.toggle('visible', visible)
    if (!visible && this.menuOpen) this.openMenu()
    const title = this.playerUi.querySelector('.title')!
    title.textContent = this.title
    this.playerUi.classList.toggle('has-title', !!this.title)
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
    seek.setAttribute('aria-valuetext', `${formatTime(time)} of ${formatTime(duration)}`)
    ;(this.playerUi.querySelector('.played') as HTMLElement).style.transform = `scaleX(${duration ? Math.min(1, time / duration) : 0})`
    const ranges = this.player.video.buffered
    const buffered = ranges.length && duration ? ranges.end(ranges.length - 1) / duration : 0
    ;(this.playerUi.querySelector('.buffered') as HTMLElement).style.transform = `scaleX(${Math.min(1, buffered)})`
  }

  private renderMenu(name: 'speed' | 'quality', value: string, label: string) {
    const trigger = this.playerUi?.querySelector<HTMLButtonElement>(`[data-menu=${name}]`)
    if (!trigger) return
    trigger.textContent = label
    trigger.ariaLabel = `${name === 'speed' ? 'Speed' : 'Quality'} ${label}`
    for (const option of Array.from(this.playerUi!.querySelectorAll<HTMLButtonElement>(`[data-role=${name}] [role=menuitemradio]`))) option.setAttribute('aria-checked', String(option.dataset.value === value))
  }

  private renderQualityOptions() {
    const options = this.playerUi?.querySelectorAll<HTMLButtonElement>('[data-role=quality] [role=menuitemradio]')
    if (!options) return
    for (const option of Array.from(options)) {
      const q = Number(option.dataset.value)
      option.disabled = !!q && q !== 360 && !this._src?.full?.r[q as FullQuality]
    }
  }

  private openMenu(name?: string, focus: 'first' | 'last' | 'checked' = 'checked') {
    if (!this.playerUi) return
    for (const trigger of Array.from(this.playerUi.querySelectorAll<HTMLButtonElement>('[data-menu]'))) {
      const open = trigger.dataset.menu === name
      trigger.setAttribute('aria-expanded', String(open))
      const menu = this.playerUi.querySelector<HTMLElement>(`.menu[data-role=${trigger.dataset.menu}]`)!
      menu.hidden = !open
      if (!open) continue
      const items = this.menuItems(menu)
      const target = focus === 'first' ? items[0] : focus === 'last' ? items.at(-1) : items.find((i) => i.getAttribute('aria-checked') === 'true') ?? items[0]
      target?.focus()
    }
  }
  private menuItems(menu: Element) { return Array.from(menu.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]:not(:disabled)')) }
  private get menuOpen() { return !!this.playerUi?.querySelector('.menu:not([hidden])') }

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
    const target = event.target as HTMLElement
    const option = target.closest<HTMLButtonElement>('[role=menuitemradio]')
    if (option) {
      const menu = option.closest<HTMLElement>('.menu')!.dataset.role
      if (menu === 'speed') this.onSpeed(Number(option.dataset.value))
      if (menu === 'quality') this.onQuality(option.dataset.value!)
      this.openMenu()
      this.playerUi?.querySelector<HTMLButtonElement>(`[data-menu=${menu}]`)?.focus()
      this.showControls()
      return
    }
    const trigger = target.closest<HTMLButtonElement>('[data-menu]')
    if (trigger) {
      this.openMenu(trigger.getAttribute('aria-expanded') === 'true' ? undefined : trigger.dataset.menu)
      return
    }
    if (this.menuOpen && !target.closest('.menu')) this.openMenu()
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action
    // a mouse click on the picture itself plays/pauses, as in every other player; touch taps toggle the controls instead
    if (!action && (event as PointerEvent).pointerType === 'mouse' && !target.closest('.controls')) this.togglePlay()
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
  private onSpeed(rate: number) {
    this.act({ type: 'rate', value: rate })
    this.player?.setMediaOptions({ rate: this.state.rate })
  }
  private onQuality(raw: string) {
    const value = raw === 'auto' ? 'auto' : Number(raw) as 360 | 720 | 1080
    this.act({ type: 'quality', value })
    this.selectQuality(value)
  }
  private readonly onMenuKey = (event: KeyboardEvent) => {
    const origin = event.target as HTMLElement
    const trigger = origin.closest<HTMLButtonElement>('[data-menu]')
    if (trigger && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      event.stopPropagation()
      this.openMenu(trigger.dataset.menu, event.key === 'ArrowUp' ? 'last' : 'first')
      return
    }
    const menu = origin.closest<HTMLElement>('.menu')
    if (!menu) {
      if (event.key === 'Escape' && this.menuOpen) { event.stopPropagation(); this.openMenu() }
      return
    }
    // Keys inside an open menu never reach the player shortcuts.
    event.stopPropagation()
    const items = this.menuItems(menu)
    const index = items.indexOf(origin as HTMLButtonElement)
    const move = (next: number) => { event.preventDefault(); items[(next + items.length) % items.length]?.focus() }
    if (event.key === 'ArrowDown') move(index + 1)
    else if (event.key === 'ArrowUp') move(index - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault()
      this.openMenu()
      this.playerUi?.querySelector<HTMLButtonElement>(`[data-menu=${menu.dataset.role}]`)?.focus()
    }
  }
  private readonly onTimelineHover = (event: Event) => {
    if (!this.playerUi || !this.player) return
    const timeline = event.currentTarget as HTMLElement
    const rect = (this.timelineRect ??= timeline.getBoundingClientRect())
    const progress = Math.min(1, Math.max(0, ((event as PointerEvent).clientX - rect.left) / rect.width))
    const time = progress * this.player.duration
    const tip = timeline.querySelector('.tip') as HTMLElement
    tip.querySelector('time')!.textContent = formatTime(time)
    // keep the preview inside the player instead of half-clipped at either end
    const half = tip.offsetWidth / 2
    const x = Math.min(Math.max(progress * rect.width, half - 4), rect.width - half + 4)
    tip.style.transform = `translateX(${x - half}px)`
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
    // event.target is retargeted to the host; the real origin tells us whether a control inside already handles the key
    const origin = event.composedPath()[0] as Element
    if (this.mode !== 'player') return
    if ((event.key === ' ' || event.key === 'Enter') && origin.matches?.('button,a')) return
    if (event.key.startsWith('Arrow') && origin.matches?.('[data-role=volume]')) return
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

  private readonly onSeekKey = (event: KeyboardEvent) => {
    // the range has 1000 steps, so native arrow keys would move a few milliseconds; match the player's 5 s shortcut
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    this.seekBy(event.key === 'ArrowLeft' ? -5 : 5)
    this.showControls()
  }

  private showControls() {
    if (!this.controls) return
    if (!this.state.controlsVisible || !this.playerUi?.classList.contains('visible')) this.act({ type: 'show-controls' })
    clearTimeout(this.hideTimer)
    this.hideTimer = window.setTimeout(() => {
      // never fade the bar out from under the pointer, an open menu, or keyboard focus
      if (this.menuOpen || this.controlsUi?.matches(':hover,:focus-within')) return this.showControls()
      this.act({ type: 'hide-controls' })
    }, 2000)
  }
  private readonly onActivity = () => this.mode === 'player' && this.showControls()
  private isOnControl(event: Event) { return !!(event.composedPath()[0] as Element).closest?.('.timeline,.row') }
  private readonly onTouchDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' && !this.isOnControl(event)) this.touchStart = { x: event.clientX, y: event.clientY, at: performance.now() }
  }
  private readonly onTouchUp = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || !this.touchStart || this.isOnControl(event)) return
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
