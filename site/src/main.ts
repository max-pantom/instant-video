import './styles.css'
import { configure, quality } from 'instant-video'
import type { InstantSource, InstantVideoElement, PosterCatalog } from 'instant-video'
import { icon, type IconName } from './icons'
import { initBench } from './bench'
import { initSteps } from './steps'
import { initInstall } from './install'
import { copyText } from './util'

configure({ predict: true, prefetch: 'viewport' })

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const fmt = (ms: number) => (ms < 100 ? ms.toFixed(1) : Math.round(ms).toString())
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---- icons ------------------------------------------------------------------------------------------------
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
  const svg = icon(el.dataset.icon as IconName, el.classList.contains('copy-i') ? 16 : 16)
  if (el.childNodes.length === 0) el.innerHTML = svg
  else el.insertAdjacentHTML('afterbegin', svg)
})

// ---- copy buttons -----------------------------------------------------------------------------------------
document.querySelectorAll<HTMLElement>('[data-copy]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    await copyText(btn.dataset.copy!)
    btn.classList.add('ok')
    const i = btn.querySelector('.copy-i')
    if (i) i.innerHTML = icon('check')
    setTimeout(() => {
      btn.classList.remove('ok')
      if (i) i.innerHTML = icon('copy')
    }, 1400)
  })
})

// ---- clips ------------------------------------------------------------------------------------------------
const ids: string[] = await (await fetch('/assets/index.json')).json()
const clips: Record<string, InstantSource> = {}
await Promise.all(ids.map(async (id) => (clips[id] = await (await fetch(`/assets/${id}.json`)).json())))
const posterCatalog: PosterCatalog | null = await fetch('/assets/posters.json').then((response) => response.ok ? response.json() : null).catch(() => null)

const touchOnly = matchMedia('(hover: none)').matches

// ---- Stageshow hero: one real clip, one interaction, one measured payoff --------------------------------
{
  const stage = $('#hero-show')
  const card = $('#hs-card')
  const iv = $('#hs-video') as InstantVideoElement
  const status = $('#hs-status')
  const time = $('#hs-time')
  const meta = $('#hs-meta')
  const clip = clips.test ?? clips[ids[0]]
  const picture = $('#hs-picture')
  const sources = picture.querySelectorAll<HTMLSourceElement>('source')
  const image = picture.querySelector<HTMLImageElement>('img')!
  sources[0].srcset = clip.poster!.avif!
  sources[1].srcset = clip.poster!.webp!
  image.src = clip.poster!.jpg!
  image.width = clip.w
  image.height = clip.h
  iv.source = clip
  iv.warmed = true
  meta.textContent = `${Math.round(clip.r.m!.avc!.headBytes / 1024)} KB head · H.264`

  let active = false
  let t0 = 0
  let swapTimer = 0
  const swap = (nextStatus: string, nextTime: string) => {
    clearTimeout(swapTimer)
    stage.dataset.switching = ''
    swapTimer = window.setTimeout(() => {
      status.textContent = nextStatus
      time.textContent = nextTime
      delete stage.dataset.switching
    }, reduced.matches ? 0 : 110)
  }
  const start = () => {
    if (active) return
    active = true
    t0 = performance.now()
    swap('Starting', 'decoder waking…')
    iv.active = true
  }
  const stop = () => {
    if (!active) return
    active = false
    iv.active = false
    delete stage.dataset.playing
    $('#hs-card-state').textContent = 'Ready'
    swap('Decoded', 'frame 0 ready')
  }
  iv.addEventListener('playing', () => {
    if (!active) return
    const ms = performance.now() - t0
    stage.dataset.playing = ''
    $('#hs-card-state').textContent = 'Playing'
    swap('Playing', `${fmt(ms)} ms to motion`)
  })
  card.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && start())
  card.addEventListener('pointerleave', (e) => e.pointerType !== 'touch' && stop())
  card.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') active ? stop() : start()
  })
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    active ? stop() : start()
  })
  card.addEventListener('blur', stop)
}

interface CardOpts {
  id: string
  i: number
  tint: number
  onMeasure?: (ms: number) => void
}
const cards = new Set<{ stop: () => void }>()
let expanded: { card: HTMLElement; iv: InstantVideoElement; close: () => void } | null = null
const backdrop = document.createElement('button')
backdrop.className = 'player-backdrop'
backdrop.type = 'button'
backdrop.ariaLabel = 'Close full player'
backdrop.hidden = true
document.body.append(backdrop)
backdrop.addEventListener('click', () => expanded?.close())

function makeCard({ id, i, tint, onMeasure }: CardOpts) {
  const src = clips[id]
  const card = document.createElement('div')
  card.className = 'card'
  card.tabIndex = 0
  card.setAttribute('role', 'button')
  card.setAttribute('aria-label', `Preview clip ${id}`)
  card.setAttribute('data-iv-target', '')
  card.style.setProperty('--i', String(i))
  const p = src.poster!
  const cell = posterCatalog?.items[id]
  const catalogPoster = cell && posterCatalog
    ? `<div class="catalog-poster" style="background-image:url('${posterCatalog.src}');background-size:${posterCatalog.columns * 100}% ${posterCatalog.rows * 100}%;background-position:${posterCatalog.columns > 1 ? (cell.x / cell.width) / (posterCatalog.columns - 1) * 100 : 0}% ${posterCatalog.rows > 1 ? (cell.y / cell.height) / (posterCatalog.rows - 1) * 100 : 0}%"></div>`
    : `<picture><source srcset="${p.avif}" type="image/avif"><source srcset="${p.webp}" type="image/webp"><img src="${p.jpg}" alt="" width="${src.w}" height="${src.h}" decoding="async" draggable="false"></picture>`
  card.innerHTML = `
    <div class="card-media" style="filter:hue-rotate(${tint}deg)">
      ${catalogPoster}
      <instant-video></instant-video>
      <div class="shade"></div>
    </div>
    <span class="tag"><b>hover</b></span>
    <span class="aim-tag">warming</span>
    <div class="cap"><span>${id}</span><span>head ${(src.r.m!.avc!.headBytes / 1024).toFixed(0)} KB</span></div>
    <button class="card-close" type="button" aria-label="Close full player">${icon('close')}</button>`
  const iv = card.querySelector('instant-video') as InstantVideoElement
  iv.source = src
  const tag = card.querySelector('.tag b') as HTMLElement
  tag.textContent = touchOnly ? 'tap' : 'hover'
  let t0 = 0
  let pending = false
  let timer = 0

  iv.addEventListener('playing', () => {
    if (!pending) return
    pending = false
    clearTimeout(timer)
    const ms = performance.now() - t0
    tag.textContent = `${fmt(ms)} ms`
    card.classList.add('hit')
    onMeasure?.(ms)
  })
  const start = () => {
    if (pending || iv.active) return
    t0 = performance.now()
    pending = true
    card.classList.remove('hit')
    tag.textContent = '… ms'
    iv.warmed = true
    iv.active = true
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (!pending) return
      pending = false
      tag.textContent = quality() === 'off' ? 'poster only' : 'no signal'
    }, 2500)
  }
  const stop = () => {
    pending = false
    clearTimeout(timer)
    iv.active = false
  }
  const api = { stop }
  cards.add(api)

  const collapse = () => {
    if (expanded?.card !== card) return
    card.classList.remove('expanded')
    card.removeAttribute('role')
    card.setAttribute('role', 'button')
    card.setAttribute('aria-label', `Preview clip ${id}`)
    iv.mode = 'preview'
    iv.controls = false
    iv.download = false
    iv.active = false
    backdrop.hidden = true
    document.documentElement.classList.remove('player-open')
    expanded = null
    card.focus({ preventScroll: true })
  }
  const expand = () => {
    if (expanded?.card === card) return
    expanded?.close()
    cards.forEach((c) => c !== api && c.stop())
    card.classList.add('expanded')
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')
    card.setAttribute('aria-label', `${id} full player`)
    iv.controls = true
    iv.muted = true
    iv.loop = false
    iv.download = true
    iv.title = `${id} · preview to full player`
    iv.mode = 'player'
    backdrop.hidden = false
    document.documentElement.classList.add('player-open')
    expanded = { card, iv, close: collapse }
    iv.focus({ preventScroll: true })
  }
  card.querySelector('.card-close')!.addEventListener('click', (event) => { event.stopPropagation(); collapse() })
  iv.addEventListener('iv-close', collapse)
  card.addEventListener('click', (event) => {
    if (iv.mode === 'player' || (event.target as HTMLElement).closest('.card-close')) return
    expand()
  })

  card.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') start()
  })
  card.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') stop()
  })
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') iv.warmed = true
  })
  card.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return
    if (iv.active) return stop()
    cards.forEach((c) => c !== api && c.stop())
    start()
  })
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    iv.active ? stop() : start()
  })
  card.addEventListener('blur', stop)
  return { card, iv, start, stop }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && expanded) expanded.close()
})

// ---- 1 · hero grid ------------------------------------------------------------------------------------------
{
  const grid = $('#hero-grid')
  const stat = $('#hero-stat')
  const all: number[] = []
  const tints = [0, 0, 0, 0, 40, 80, 120, 160, 200, 240, 280, 320]
  for (let n = 0; n < 12; n++) {
    const id = n === 0 && clips.gradients ? 'gradients' : ids[n % ids.length]
    const { card } = makeCard({
      id,
      i: n,
      tint: tints[n],
      onMeasure: (ms) => {
        all.push(ms)
        stat.innerHTML = `<b>${fmt(median(all))} ms</b> median over ${all.length} ${all.length === 1 ? 'hover' : 'hovers'} · min ${fmt(Math.min(...all))} · max ${fmt(Math.max(...all))} · your browser, your link. Twelve cards reuse four synthetic test-pattern clips, tinted.`
      },
    })
    grid.appendChild(card)
  }
}

// ---- 2 · race -----------------------------------------------------------------------------------------------
{
  const stage = $('#race-stage')
  const runBtn = $('#race-run', document) as HTMLButtonElement
  const verdict = $('#race-verdict')
  const laneP = $('#lane-plain')
  const laneI = $('#lane-iv')
  const video = $<HTMLVideoElement>('video', laneP)
  const iv = $('instant-video', laneI) as InstantVideoElement
  const msP = $('[data-ms]', laneP)
  const msI = $('[data-ms]', laneI)
  const clip = clips.test ?? clips[ids[0]]
  const p = clip.poster!
  for (const lane of [laneP, laneI]) {
    const img = $<HTMLImageElement>('img', lane)
    img.src = p.jpg!
    img.width = clip.w
    img.height = clip.h
  }
  iv.source = clip
  iv.warmed = true // the thing under test: a card that has been prefetched and decoded in advance
  const fullUrl = clip.r.m!.avc!.full!

  let state: 'idle' | 'running' | 'done' = 'idle'
  let t0 = 0
  let tP = 0
  let tI = 0
  let raf = 0
  let stopTimer = 0
  let hovering = false
  let result: { p: number; i: number } | null = null

  const tick = () => {
    const now = performance.now() - t0
    if (!tP) msP.textContent = `${fmt(now)} ms`
    if (!tI) msI.textContent = `${fmt(now)} ms`
    if (state === 'running') raf = requestAnimationFrame(tick)
  }
  const finish = (timedOut = false) => {
    if (state !== 'running') return
    state = 'done'
    cancelAnimationFrame(raf)
    if (timedOut) {
      if (!tP) msP.textContent = 'timeout'
      if (!tI) msI.textContent = 'timeout'
    }
    msP.classList.add('done')
    msI.classList.add('done')
    if (tP && tI) {
      result = { p: tP, i: tI }
      verdict.textContent = `instant-video ${fmt(tI)} ms · video ${fmt(tP)} ms · ${(tP - tI).toFixed(0)} ms earlier`
      showReplay()
    } else verdict.textContent = quality() === 'off' ? 'Posters only on this setup (reduced motion, Save-Data or 2g).' : 'No result: a player did not start.'
  }
  const reset = () => {
    video.pause()
    video.classList.remove('on')
    video.removeAttribute('src')
    video.load()
    iv.active = false
  }
  const run = (auto: boolean) => {
    if (state === 'running') return
    reset()
    state = 'running'
    tP = tI = 0
    result = null
    msP.className = msI.className = 'ms mono'
    msP.textContent = msI.textContent = '0.0 ms'
    verdict.textContent = 'Running…'
    $('#replay').hidden = true
    t0 = performance.now()
    video.preload = 'auto'
    video.src = `${fullUrl}?r=${Math.random().toString(36).slice(2)}`
    video.play().catch(() => {})
    iv.active = true
    raf = requestAnimationFrame(tick)
    clearTimeout(stopTimer)
    stopTimer = window.setTimeout(() => {
      if (state === 'running') finish(true)
    }, 4000)
    if (auto) window.setTimeout(() => !hovering && reset(), 5000)
  }
  video.addEventListener('playing', () => {
    if (state !== 'running' || tP) return
    tP = performance.now() - t0
    msP.textContent = `${fmt(tP)} ms`
    msP.classList.add('done')
    video.classList.add('on')
    if (tI) finish()
  })
  iv.addEventListener('playing', () => {
    if (state !== 'running' || tI) return
    tI = performance.now() - t0
    msI.textContent = `${fmt(tI)} ms`
    msI.classList.add('done')
    if (tP) finish()
  })
  const settle = () => {
    state = 'idle'
  }
  stage.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return
    hovering = true
    run(false)
  })
  stage.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'touch') return
    hovering = false
    if (state === 'running') {
      verdict.textContent = 'Left before both started.'
      state = 'idle'
      cancelAnimationFrame(raf)
    }
    reset()
    settle()
  })
  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'touch') run(true)
  })
  stage.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target === stage) {
      e.preventDefault()
      state = state === 'running' ? state : 'idle'
      run(true)
    }
  })
  runBtn.addEventListener('click', () => {
    if (state === 'done') state = 'idle'
    run(true)
  })
  stage.addEventListener('pointerenter', () => {
    if (state === 'done') state = 'idle'
  })

  // slow-mo replay of the measured race
  let speed = 0.05
  let rpRaf = 0
  const fillA = $('#rp-a')
  const fillB = $('#rp-b')
  const endA = $('#rp-a-end')
  const endB = $('#rp-b-end')
  const head = $('#rp-head')
  const clock = $('#rp-clock')
  const track = $('.rp-track', $('#replay'))
  function showReplay() {
    if (!result) return
    const box = $('#replay')
    box.hidden = false
    box.removeAttribute('aria-hidden')
    const T = Math.max(result.p, result.i) * 1.12
    $('#rp-max').textContent = `${fmt(T)} ms`
    endA.style.left = `calc(${(result.p / T) * 100}% - 2px)`
    endB.style.left = `calc(${(result.i / T) * 100}% - 2px)`
    cancelAnimationFrame(rpRaf)
    const apply = (t: number) => {
      fillA.style.transform = `scaleX(${Math.min(t, result!.p) / T})`
      fillB.style.transform = `scaleX(${Math.min(t, result!.i) / T})`
      const tr = track.getBoundingClientRect()
      const br = box.getBoundingClientRect()
      head.style.transform = `translateX(${tr.left - br.left + (t / T) * tr.width - 84}px)`
      clock.textContent = `t = ${fmt(t)} ms · ${speed}×`
    }
    if (reduced.matches) return apply(T)
    const s = performance.now()
    const step = () => {
      const t = ((performance.now() - s) * speed)
      if (t >= T) return apply(T)
      apply(t)
      rpRaf = requestAnimationFrame(step)
    }
    step()
  }
  document.querySelectorAll<HTMLElement>('[data-speed]').forEach((b) =>
    b.addEventListener('click', () => {
      speed = Number(b.dataset.speed)
      document.querySelectorAll('[data-speed]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)))
      showReplay()
    }),
  )
}

// ---- 2b · prediction visualizer -----------------------------------------------------------------------------
{
  const grid = $('#pred-grid')
  const canvas = $<HTMLCanvasElement>('#pred-canvas')
  const toggle = $('#pred-toggle')
  const ctx = canvas.getContext('2d')!
  const els: HTMLElement[] = []
  for (let n = 0; n < 8; n++) {
    const { card } = makeCard({ id: ids[n % ids.length], i: n, tint: [0, 60, 120, 180, 240, 300, 30, 210][n] })
    grid.appendChild(card)
    els.push(card)
  }
  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-pressed') !== 'true'
    toggle.setAttribute('aria-pressed', String(on))
    grid.classList.toggle('off', !on)
    if (!on) setAim(null)
  })

  let dpr = 1
  const fit = () => {
    dpr = Math.min(devicePixelRatio || 1, 2)
    const r = grid.getBoundingClientRect()
    canvas.width = Math.round(r.width * dpr)
    canvas.height = Math.round(r.height * dpr)
  }
  new ResizeObserver(fit).observe(grid)
  fit()

  // the same projection the engine uses (registry.ts): velocity over the last 24–140 ms, 180 ms lookahead, 10 px pad
  const LOOK = 180
  const PAD = 10
  let trail: { t: number; x: number; y: number }[] = []
  let aim: HTMLElement | null = null
  let lastMove = 0
  let raf = 0
  let seg: { x: number; y: number; dx: number; dy: number } | null = null

  function setAim(el: HTMLElement | null) {
    if (aim === el) return
    aim?.classList.remove('aim')
    aim = el
    aim?.classList.add('aim')
  }
  function project() {
    seg = null
    const now = trail[trail.length - 1]
    if (!now) return setAim(null)
    const from = trail.find((s) => now.t - s.t >= 24 && now.t - s.t <= 140)
    if (!from) return
    const dt = now.t - from.t
    const vx = (now.x - from.x) / dt
    const vy = (now.y - from.y) / dt
    const speed = Math.hypot(vx, vy)
    if (speed < 0.12) return setAim(null)
    const len = Math.min(Math.max(speed * LOOK, 48), 720)
    const dx = (vx / speed) * len
    const dy = (vy / speed) * len
    seg = { x: now.x, y: now.y, dx, dy }
    let best: HTMLElement | null = null
    let bestT = Infinity
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (now.x >= r.left && now.x <= r.right && now.y >= r.top && now.y <= r.bottom) continue
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
        best = el
        bestT = t0
      }
    }
    setAim(best)
  }
  function draw() {
    raf = 0
    const nowT = performance.now()
    const live = nowT - lastMove < 160
    if (!live) {
      seg = null
      setAim(null)
    }
    trail = trail.filter((s) => nowT - s.t < 450)
    const off = grid.classList.contains('off')
    const gr = grid.getBoundingClientRect()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, gr.width, gr.height)
    if (!off && trail.length > 1) {
      ctx.lineCap = 'round'
      for (let k = 1; k < trail.length; k++) {
        const a = trail[k - 1]
        const b = trail[k]
        const age = (nowT - b.t) / 450
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - age)})`
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(a.x - gr.left, a.y - gr.top)
        ctx.lineTo(b.x - gr.left, b.y - gr.top)
        ctx.stroke()
      }
    }
    if (!off && seg && live) {
      const x = seg.x - gr.left
      const y = seg.y - gr.top
      ctx.setLineDash([5, 5])
      ctx.strokeStyle = 'rgba(126,231,184,0.9)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + seg.dx, y + seg.dy)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#7ee7b8'
      ctx.beginPath()
      ctx.arc(x + seg.dx, y + seg.dy, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.stroke()
    }
    if (trail.length || live) raf = requestAnimationFrame(draw)
  }
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || grid.classList.contains('off')) return
      const r = grid.getBoundingClientRect()
      if (e.clientY < r.top - 240 || e.clientY > r.bottom + 240) return
      trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
      if (trail.length > 12) trail.shift()
      lastMove = performance.now()
      project()
      if (!raf) raf = requestAnimationFrame(draw)
    },
    { passive: true },
  )
  grid.addEventListener('pointerleave', () => setAim(null))
}

// ---- 3 / 4 / 5 / 6 -----------------------------------------------------------------------------------------
initSteps()
initBench()
initInstall()
