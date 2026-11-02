import { copyText } from './util'
import { icon } from './icons'

const tabs: { id: string; label: string; code: string; lang: 'js' | 'sh' }[] = [
  {
    id: 'html', label: 'HTML', lang: 'js',
    code: `<div class="card" data-iv-target style="position:relative">
  <img src="poster.jpg" alt="">          <!-- the poster: frame 0 of the clip -->
  <instant-video></instant-video>         <!-- fills the positioned parent -->
</div>

<script type="module">
  import 'instant-video'                  // registers <instant-video>
  const el = document.querySelector('instant-video')
  el.source = await (await fetch('/media/my-clip.json')).json()   // the manifest written by the encoder
  el.addEventListener('playing', () => console.log('playing'))
  card.onpointerenter = () => (el.warmed = el.active = true)       // play; \`warmed\` alone gets ready without playing
  card.onpointerleave = () => el.mode === 'preview' && (el.active = false)
  card.onclick = () => {                    // same element, same timeline
    el.controls = true
    el.mode = 'player'
  }
</script>`,
  },
  {
    id: 'react', label: 'React', lang: 'js',
    code: `import { InstantVideo } from 'instant-video/react'

<div className="card" data-iv-target style={{ position: 'relative' }}>
  <img src={clip.poster.jpg} alt="" />
  <InstantVideo
    source={clip} active={hovering} warm={intent}
    mode={expanded ? 'player' : 'preview'} controls muted
    onModeChange={setMode}
  />
</div>`,
  },
  {
    id: 'config', label: 'Config', lang: 'js',
    code: `import { configure } from 'instant-video'
configure({
  predict: true,       // warm the card the pointer is heading to (velocity + direction, ~180 ms lookahead)
  prefetch: 'viewport',// max 4 speculative ranges; off on touch, Save-Data, and 2g
  poolSize: 4,         // warm players kept (0 disables warming entirely)
  lookaheadMs: 180,
  size: 'auto',        // 'm' (360p) | 's' (240p)
  codec: 'auto',       // 'avc' | 'av1'
  mse: true,           // false forces the progressive file
})`,
  },
  {
    id: 'cli', label: 'CLI', lang: 'sh',
    code: `npx instant-video encode ./clips                                                # every video in the folder
npx instant-video encode ./clip.mp4 --id my-clip --out ./public/media --base-url /media
npx instant-video encode ./clip.mp4 --full 720,1080                         # full player + scrub sprite
npx instant-video encode ./clips --poster-sprite                            # one grid poster + JSON map
npx instant-video encode ./clips --storage r2 --bucket museum-of-ads-media --public-url https://media.primitive8.com
npx instant-video encode https://www.youtube.com/watch?v=… --id spot     # URLs go through yt-dlp
npx instant-video encode a.mp4 b.mp4 --storage blob                      # Vercel Blob
npx instant-video encode a.mp4 --storage s3 --bucket my-bucket --region eu-west-1 --public-url https://cdn.example.com

# writes a static ./instant-video-out folder: one <id>.json manifest per clip, an index.json, content-addressed media.
# upload it to any static host. needs ffmpeg (libx264 + libsvtav1); cwebp and yt-dlp are optional.`,
  },
  {
    id: 'storage', label: 'Storage', lang: 'js',
    code: `import { encodeToStorage } from 'instant-video/encode'
import { fsStorage, blobStorage, r2Storage, s3Storage } from 'instant-video/storage'

const storage = fsStorage({ dir: './public/media', baseUrl: '/media' })   // default
// const storage = blobStorage({ prefix: 'instant/' })                     // needs @vercel/blob, BLOB_READ_WRITE_TOKEN
// const storage = s3Storage({ bucket: 'b', region: 'eu-west-1' })         // needs @aws-sdk/client-s3 (any S3-compatible store via \`endpoint\`)
// const storage = r2Storage({ bucket: 'museum-of-ads-media', publicUrl: 'https://media.primitive8.com' }) // Wrangler OAuth, no API keys

const { iv } = await encodeToStorage('./clip.mp4', 'my-clip', storage)     // iv is the manifest

// a storage adapter is one method, so writing your own is short:
interface Storage { put(key: string, data: Buffer, contentType: string): Promise<string /* public URL */> }`,
  },
]

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const dim = (s: string, lang: 'js' | 'sh') =>
  s
    .split('\n')
    .map((line) => {
      const re = lang === 'sh' ? /(^|\s)(# .*)$/ : /(^|\s)(\/\/ .*|<!--.*-->)$/
      const m = re.exec(line)
      if (!m) return esc(line)
      const at = m.index + m[1].length
      return `${esc(line.slice(0, at))}<span class="cm">${esc(line.slice(at))}</span>`
    })
    .join('\n')

export function initInstall() {
  const bar = document.getElementById('tabs')!
  const code = document.getElementById('code')!
  const copy = document.getElementById('code-copy')!
  let cur = tabs[0]
  const select = (id: string) => {
    cur = tabs.find((t) => t.id === id)!
    bar.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.id === id))
      b.setAttribute('aria-pressed', String(b.dataset.id === id))
    })
    code.innerHTML = dim(cur.code, cur.lang)
  }
  bar.innerHTML = tabs.map((t) => `<button class="pill" type="button" role="tab" data-id="${t.id}" aria-selected="false" aria-pressed="false">${t.label}</button>`).join('')
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button')
    if (b) select(b.dataset.id!)
  })
  select('html')
  copy.addEventListener('click', async () => {
    await copyText(cur.code)
    copy.innerHTML = `${icon('check')}Copied`
    setTimeout(() => (copy.innerHTML = `${icon('copy')}Copy`), 1400)
  })

  const limits = [
    '<b>Safari and iOS are untested.</b> The iOS path (ManagedMediaSource) is written to the spec but has never run on a device. Firefox is untested too. All benchmarks are Chromium only.',
    '<b>Full audio follows the source.</b> Preview renditions stay silent and lightweight; optional full renditions carry AAC when the input has audio.',
    '<b>Cold hovers are not faster.</b> The win comes from having bytes and a decoded frame 0 before the pointer arrives. A cold hover on a card that was never prefetched or predicted is no faster than a plain video.',
    '<b>Short keyframe intervals cost size.</b> The 360p H.264 file is about 60% larger than a normally encoded clip of the same length. You pay it only when a clip is played; idle prefetch costs about one head (≈ 40 KB) per card near the viewport.',
    '<b>Browser requirements.</b> MediaSource (or ManagedMediaSource) for the fast path, plus fetch, IntersectionObserver and custom elements.',
    '<b>Throttled networks not benchmarked.</b> The 3g and Save-Data paths exist but are untested.',
    '<b>Encoder dependencies.</b> It shells out to ffmpeg and needs libsvtav1 for the AV1 renditions.',
  ]
  const road = [
    '<b>Test on Safari / iOS and Firefox,</b> then benchmark them.',
    '<b>Benchmark under throttled networks</b> and exercise the 3g and Save-Data paths.',
    '<b>Publish to npm.</b> Until then, install straight from GitHub (builds on install).',
    '<b>Investigate the slow p95</b> of predicted cold hovers with idle prefetch off (about 300 ms; the cause was not investigated).',
  ]
  document.getElementById('limits-list')!.innerHTML = limits.map((l) => `<li>${l}</li>`).join('')
  document.getElementById('road-list')!.innerHTML = road.map((l) => `<li>${l}</li>`).join('') + '<li class="mono dim">No dates promised.</li>'
}
