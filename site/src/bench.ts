// Numbers copied from museum-of-ads docs/bench-results.md (2026-11-02, Chromium 156, desktop 1440×900, 24 hovers per
// scenario). Each metric is [median, p95] ms from pointer-enter.
type M = [number, number]
interface Row { name: string; visible: M; frame: M; motion: M; playing: M; isNew: boolean }

const rows: Row[] = [
  { name: 'old-cold-predicted', visible: [200.3, 249.4], frame: [150.3, 199.5], motion: [182.5, 216.1], playing: [151.8, 185.8], isNew: false },
  { name: 'old-cold-unpredicted', visible: [202.9, 251.2], frame: [151.9, 200.6], motion: [169.9, 217.6], playing: [145.8, 186.9], isNew: false },
  { name: 'old-warm-predicted', visible: [99.2, 115.6], frame: [49, 64.9], motion: [49.6, 65.5], playing: [20.6, 28.9], isNew: false },
  { name: 'old-warm-unpredicted', visible: [80.2, 105.4], frame: [29.4, 48.8], motion: [46.7, 78.3], playing: [26.3, 34.4], isNew: false },
  { name: 'new-cold-predicted', visible: [32.9, 34.6], frame: [50.2, 65.1], motion: [50.2, 65.1], playing: [19.7, 22.1], isNew: true },
  { name: 'new-cold-unpredicted', visible: [28.5, 40.2], frame: [28.9, 45.6], motion: [43.8, 53.5], playing: [19.6, 29.2], isNew: true },
  { name: 'new-warm-predicted', visible: [33, 34.3], frame: [49.4, 50.3], motion: [49.4, 50.3], playing: [19.6, 21.6], isNew: true },
  { name: 'new-warm-unpredicted', visible: [26.1, 32.1], frame: [27.5, 40.6], motion: [43.4, 48.4], playing: [17, 26.9], isNew: true },
  { name: 'new-cold-predicted-noprefetch', visible: [33.4, 316.7], frame: [50.2, 316.4], motion: [50.2, 332.7], playing: [20.2, 301], isNew: true },
  { name: 'new-cold-unpredicted-noprefetch', visible: [147.1, 596.2], frame: [146.7, 596], motion: [167.6, 628.5], playing: [144.3, 591.4], isNew: true },
]

const pairs: [string, string, string][] = [
  ['cold, predicted path', 'old-cold-predicted', 'new-cold-predicted'],
  ['cold, unpredicted', 'old-cold-unpredicted', 'new-cold-unpredicted'],
  ['warm cache, predicted path', 'old-warm-predicted', 'new-warm-predicted'],
  ['warm cache, unpredicted', 'old-warm-unpredicted', 'new-warm-unpredicted'],
]

const sizes: [string, string, string][] = [
  ['head, 360p H.264', '38.7 KB', '107.5 KB'],
  ['head, 360p AV1', '26.4 KB', '96.1 KB'],
  ['head, 240p H.264', '13.5 KB', '34.6 KB'],
  ['tail, 360p H.264', '285.9 KB', '769.7 KB'],
  ['tail, 360p AV1', '194.5 KB', '628.0 KB'],
  ['tail, 240p H.264', '98.1 KB', '231.9 KB'],
  ['progressive full, 360p H.264', '326.2 KB', '–'],
  ['poster AVIF', '5.5 KB', '25.0 KB'],
  ['poster WebP', '6.9 KB', '30.4 KB'],
  ['poster JPEG', '16.2 KB', '55.1 KB'],
]

type Metric = 'playing' | 'visible' | 'frame'

export function initBench() {
  const by = Object.fromEntries(rows.map((r) => [r.name, r]))
  const bars = document.getElementById('bars')!
  const f = (n: number) => (n < 100 ? n.toFixed(1) : Math.round(n))
  let metric: Metric = 'playing'

  const render = () => {
    const max = Math.max(...pairs.flatMap(([, a, b]) => [by[a][metric][0], by[b][metric][0]]))
    bars.innerHTML = pairs
      .map(([label, a, b]) => {
        const o = by[a][metric][0]
        const n = by[b][metric][0]
        return `<div class="brow"><div class="brow-l"><b>${label}</b><span class="mono dim">p95 ${f(by[a][metric][1])} → ${f(by[b][metric][1])} ms</span></div>
          <div class="bpair">
            <div class="bl"><span class="bt"><i class="bf" data-w="${o / max}"></i></span><span class="bv mono">${f(o)} ms</span></div>
            <div class="bl new"><span class="bt"><i class="bf" data-w="${n / max}"></i></span><span class="bv mono">${f(n)} ms</span></div>
          </div></div>`
      })
      .join('')
    requestAnimationFrame(() => bars.querySelectorAll<HTMLElement>('.bf').forEach((el) => el.style.setProperty('--w', el.dataset.w!)))
  }
  render()
  document.querySelectorAll<HTMLElement>('[data-metric]').forEach((b) =>
    b.addEventListener('click', () => {
      metric = b.dataset.metric as Metric
      document.querySelectorAll('[data-metric]').forEach((o) => o.setAttribute('aria-pressed', String(o === b)))
      bars.querySelectorAll<HTMLElement>('.bf').forEach((el) => el.style.setProperty('--w', '0'))
      // re-render after the bars have a frame at zero so the grow-in replays
      requestAnimationFrame(() => requestAnimationFrame(render))
    }),
  )
  // play the grow-in when scrolled into view
  bars.querySelectorAll<HTMLElement>('.bf').forEach((el) => el.style.setProperty('--w', '0'))
  new IntersectionObserver((es, io) => {
    if (es.some((e) => e.isIntersecting)) {
      render()
      io.disconnect()
    }
  }, { threshold: 0.2 }).observe(bars)

  const c = (m: M) => `${m[0]} / ${m[1]}`
  document.getElementById('tbl')!.innerHTML =
    `<thead><tr><th>scenario</th><th>visible</th><th>frame</th><th>motion</th><th>playing</th></tr></thead><tbody>` +
    rows.map((r) => `<tr class="${r.isNew ? 'new' : ''}"><td>${r.name}</td><td>${c(r.visible)}</td><td>${c(r.frame)}</td><td>${c(r.motion)}</td><td>${c(r.playing)}</td></tr>`).join('') +
    `</tbody>`
  document.getElementById('sizes')!.innerHTML = sizes.map(([k, med, p95]) => `<div><dt>${k}</dt><dd>${med} <span class="dim">/ p95 ${p95}</span></dd></div>`).join('')
}
