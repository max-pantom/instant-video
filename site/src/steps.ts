import { icon, type IconName } from './icons'

interface Step {
  icon: IconName
  label: string
  title: string
  body: string
  viz: string
}

const steps: Step[] = [
  {
    icon: 'layers',
    label: 'head / tail split',
    title: 'Two files per clip',
    body: 'Each rendition is cut into a head (init segment plus the first fragments, at least 0.9 s, about 10–40 KB) and a tail (the rest). Only the head is paid up front.',
    viz: `<div class="bar"></div><i class="head" style="left:16px"></i><i class="tail"></i><span class="l1">head</span><span class="l2">tail</span><span class="l3">~10–40 KB</span><span class="l4">fetched on play</span>`,
  },
  {
    icon: 'clock',
    label: 'idle prefetch',
    title: 'Heads load while the page is idle',
    body: 'Cards in or near the viewport get their head fetched during idle time, and a preconnect to the media origin is added once.',
    viz: `${'<i class="dot"></i>'.repeat(8)}<i class="win"></i><span class="l1">viewport + margin</span><span class="l2">head ≈ 40 KB</span>`,
  },
  {
    icon: 'mouse',
    label: 'cursor prediction',
    title: 'Warm the card you are heading to',
    body: 'Pointer velocity and direction are projected about 180 ms ahead and tested against card rects. The target is warmed before the pointer gets there.',
    viz: `<i class="path"></i><i class="ptr"></i><i class="tgt"></i><span class="l1">velocity × 180 ms</span><span class="l2">warm()</span>`,
  },
  {
    icon: 'target',
    label: 'warm pool',
    title: 'Frame 0 is decoded and waiting',
    body: 'A warm player has a MediaSource with the head appended. A small LRU pool (default 4) is kept; idle ones are evicted, active ones never.',
    viz: `<i class="slot"></i><i class="slot"></i><i class="slot"></i><i class="slot"></i><span class="l1">poolSize: 4</span><span class="l2">LRU</span>`,
  },
  {
    icon: 'gauge',
    label: 'codec pick',
    title: 'AV1 only when it is smooth',
    body: 'AV1 is used only when MediaCapabilities reports it smooth and power-efficient. Otherwise H.264 (Main, no B-frames).',
    viz: `<i class="a">decodingInfo</i><i class="ln1"></i><i class="ln2"></i><i class="b">AV1</i><i class="c">H.264</i>`,
  },
  {
    icon: 'bolt',
    label: 'fallback',
    title: 'Degrades instead of breaking',
    body: 'No MSE: progressive faststart MP4. Reduced motion, Save-Data and 2g: posters only. 3g or downlink < 1.5 Mbps: the 240p rendition.',
    viz: `<i class="r"><span>MediaSource</span><span>head + tail</span></i><i class="r"><span>no MSE</span><span>faststart mp4</span></i><i class="r"><span>Save-Data / 2g</span><span>poster</span></i>`,
  },
]

export function initSteps() {
  const root = document.getElementById('steps')!
  root.innerHTML = steps
    .map(
      (s, i) => `<article class="step">
        <div class="viz v${i + 1}" aria-hidden="true">${s.viz}</div>
        <div class="step-n mono">${icon(s.icon)}<span>${String(i + 1).padStart(2, '0')} · ${s.label}</span></div>
        <h3>${s.title}</h3><p>${s.body}</p></article>`,
    )
    .join('')
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)),
    { threshold: 0.3 },
  )
  root.querySelectorAll('.viz').forEach((v) => io.observe(v))
}
