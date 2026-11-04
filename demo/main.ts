import { configure, InstantVideoElement, type InstantSource } from '../dist/index.js'

configure({ predict: true, prefetch: true })

const ids = (await fetch('assets/index.json').then((res) => res.json())) as string[]
const clips = await Promise.all(ids.map(async (id) => {
  const source = (await fetch(`assets/${id}.json`).then((res) => res.json())) as InstantSource
  return [id, source] as const
}))

const bench = clips.find(([id]) => id === 'test')?.[1] ?? clips[0]?.[1]
const avc = bench?.r.m?.avc
const oldCard = document.querySelector<HTMLElement>('#old-card')
const oldVideo = document.querySelector<HTMLVideoElement>('#old-video')
const newCard = document.querySelector<HTMLElement>('#new-card')
const newVideo = document.querySelector('#new-video')
const oldPoster = document.querySelector<HTMLImageElement>('#old-poster')
const newPoster = document.querySelector<HTMLImageElement>('#new-poster')
const headSize = document.querySelector('#head-size')
const gallery = document.querySelector('#gallery')

if (!bench || !avc?.full || !bench.poster?.jpg || !oldCard || !oldVideo || !newCard || !(newVideo instanceof InstantVideoElement) || !oldPoster || !newPoster || !headSize || !gallery) {
  throw new Error('demo markup or benchmark clip is incomplete')
}

oldPoster.src = bench.poster.jpg
newPoster.src = bench.poster.jpg
oldVideo.src = avc.full
newVideo.source = bench
newVideo.warmed = true
headSize.textContent = `${Math.round(avc.headBytes / 1024)} KB`

const samples: Record<'old' | 'new', number[]> = { old: [], new: [] }
const median = (values: number[]) => {
  if (!values.length) return '—'
  const sorted = [...values].sort((a, b) => a - b)
  return `${sorted[Math.floor(sorted.length / 2)]} ms`
}
const record = (kind: 'old' | 'new', start: number) => {
  const ms = Math.round(performance.now() - start)
  samples[kind].push(ms)
  const last = document.querySelector(`#${kind}-last`)
  const mid = document.querySelector(`#${kind}-median`)
  if (last) last.textContent = `${ms} ms`
  if (mid) mid.textContent = median(samples[kind])
}

let oldStart = 0
oldCard.addEventListener('pointerenter', () => {
  oldStart = performance.now()
  oldCard.classList.add('is-active')
  oldVideo.currentTime = 0
  void oldVideo.play().catch(() => {})
})
oldCard.addEventListener('pointerleave', () => {
  oldCard.classList.remove('is-active')
  oldVideo.pause()
  oldVideo.currentTime = 0
})
oldVideo.addEventListener('playing', () => record('old', oldStart))

let newStart = 0
newCard.addEventListener('pointerenter', () => {
  newStart = performance.now()
  newCard.classList.add('is-active')
  newVideo.active = true
})
newCard.addEventListener('pointerleave', () => {
  newCard.classList.remove('is-active')
  newVideo.active = false
})
newVideo.addEventListener('playing', () => record('new', newStart))

for (const [id, clip] of clips.slice(0, 3)) {
  const card = document.createElement('div')
  card.className = 'scrub-card'
  card.dataset.ivTarget = ''
  card.innerHTML = `<img src="${clip.poster?.jpg ?? ''}" alt=""><div class="scrub-label"><span>${id}</span><span>SCRUB ↔</span></div><div class="scrub-line"><i></i></div>`
  const video = document.createElement('instant-video')
  if (!(video instanceof InstantVideoElement)) throw new Error('instant-video is not registered')
  video.source = clip
  card.prepend(video)
  const bar = card.querySelector('i')
  card.addEventListener('pointerenter', () => {
    video.warmed = true
    video.active = true
  })
  card.addEventListener('pointerleave', () => {
    video.active = false
    if (bar instanceof HTMLElement) bar.style.width = '0'
  })
  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect()
    const progress = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    if (bar instanceof HTMLElement) bar.style.width = `${progress * 100}%`
  }, { passive: true })
  gallery.append(card)
}
