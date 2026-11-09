# instant-video

Hover-preview videos that start in a few milliseconds. A framework-agnostic `<instant-video>` custom element, a thin
React wrapper, and an encoder CLI that produces the assets. MIT licensed.

On a normal `<video>` a hover pays for connecting, fetching, parsing, creating a decoder and decoding the first frame.
instant-video does all of that **before** the pointer arrives, so the hover only has to press play.

## Numbers

Run `npm run demo` for a live, side-by-side native `<video>` versus instant-video benchmark. It measures each hover in
your browser and includes the scrub-on-hover gallery and current encoded head sizes.

## Install

```sh
npm i instant-video                      # once published
npm i github:max-pantom/instant-video    # straight from GitHub (builds on install)
```

The browser entry points have no dependencies. The encoder needs `ffmpeg` (libx264 and libsvtav1) on the PATH; `cwebp`
and `yt-dlp` are optional.

## Use

### HTML

```html
<div class="card" data-iv-target style="position:relative">
  <img src="poster.jpg" alt="">          <!-- the poster: frame 0 of the clip -->
  <instant-video></instant-video>         <!-- fills the positioned parent -->
</div>

<script type="module">
  import 'instant-video'                  // registers <instant-video>
  const el = document.querySelector('instant-video')
  el.source = await (await fetch('/media/my-clip.json')).json()   // the manifest written by the encoder
  el.addEventListener('playing', () => console.log('playing'))
  card.onpointerenter = () => (el.warmed = el.active = true)       // play; `warmed` alone gets ready without playing
  card.onpointerleave = () => el.mode === 'preview' && (el.active = false)
  card.onclick = () => {                    // promote the same decoded preview; it does not restart
    el.controls = true
    el.mode = 'player'
  }
</script>
```

The hit area used for pointer prediction, keyboard focus and touch is the nearest `[data-iv-target]` ancestor (or
`el.target`, or the parent). The element's styling is internal: absolutely positioned, `object-fit: cover`, video
hidden until a frame is on screen, instant in, `180ms var(--ease-out)` out. Try it: `npm run demo`.

### React

```tsx
import { InstantVideo } from 'instant-video/react'

<div className="card" data-iv-target style={{ position: 'relative' }}>
  <img src={clip.poster.jpg} alt="" />
  <InstantVideo source={clip} active={hovering} warm={intent} mode="preview" />
</div>
```

## Full player

`mode="player"` promotes the existing preview engine into the built-in player. A playing preview keeps its current
time and decoded frame while the selected full rendition is prepared, then swaps on the next aligned keyframe. The
player is HLS-free, has no browser runtime dependencies, and falls back to progressive H.264 when fMP4/MSE playback
is unavailable.

### HTML

```html
<div class="video-shell" data-iv-target style="position:relative;aspect-ratio:16/9">
  <img src="poster.jpg" alt="Demo reel">
  <instant-video controls muted title="Demo reel">
    <track kind="captions" srclang="en" label="English" src="/captions/demo.vtt">
  </instant-video>
</div>

<script type="module">
  import 'instant-video'
  const player = document.querySelector('instant-video')
  player.source = await (await fetch('/media/demo.json')).json()
  player.active = true                        // hover preview
  player.mode = 'player'                      // same timeline, full controls
  player.addEventListener('modechange', e => console.log(e.detail.mode))
  player.addEventListener('qualitychange', e => console.log(e.detail.quality))
</script>
```

Boolean attributes/properties are `controls`, `autoplay`, `muted`, `loop`, and opt-in `download`. Other player
properties are `mode` (`preview | player`), `startAt`, `poster`, and `title`. The control bar includes play/pause,
buffered scrubber with sprite thumbnails, time, volume, speed, Auto/360/720/1080 quality, loop, captions,
picture-in-picture, fullscreen, and optional download. Theme it with `--iv-accent`, `--iv-fg`, `--iv-bg`,
`--iv-radius`, and `--iv-font`.

### React

```tsx
import { useState } from 'react'
import { InstantVideo } from 'instant-video/react'

const [mode, setMode] = useState<'preview' | 'player'>('preview')

<div onClick={() => setMode('player')} style={{ position: 'relative', aspectRatio: '16 / 9' }}>
  <InstantVideo
    source={clip}
    active={hovering}
    warm={intent}
    mode={mode}
    controls
    muted
    startAt={0}
    poster={clip.poster.jpg}
    title="Demo reel"
    onModeChange={setMode}
  >
    <track kind="captions" src="/captions/demo.vtt" srcLang="en" label="English" />
  </InstantVideo>
</div>
```

The element re-emits `play`, `pause`, `timeupdate`, `ended`, `modechange`, `qualitychange`, and `error`. It emits
`iv-close` after a downward touch swipe when nested in a `dialog`, `[role=dialog]`, or `[data-iv-sheet]`.

### Config

```ts
import { configure } from 'instant-video'
configure({
  predict: true,       // warm the card the pointer is heading to (velocity + direction, ~180 ms lookahead)
  prefetch: 'viewport',// at most 4 speculative heads in flight; 0 on touch, Save-Data, or 2g
  poolSize: 4,         // warm players kept (0 disables warming entirely)
  lookaheadMs: 180,
  size: 'auto',        // 'm' (360p) | 's' (240p)
  codec: 'auto',       // 'avc' | 'av1'
  mse: true,           // false forces the progressive file
})
```

## Encoding

```sh
npx instant-video encode ./clips                                                # every video in the folder
npx instant-video encode ./clip.mp4 --id my-clip --out ./public/media --base-url /media
npx instant-video encode ./clip.mp4 --full 720,1080                         # add full-player H.264 + AV1
npx instant-video encode ./clips --poster-sprite                            # one grid poster + posters.json map
npx instant-video encode ./clips --two-file                                 # legacy separate head/tail output
npx instant-video encode ./clips --storage r2 --bucket museum-of-ads-media --public-url https://media.primitive8.com
npx instant-video encode https://www.youtube.com/watch?v=… --id spot     # URLs go through yt-dlp
npx instant-video encode a.mp4 b.mp4 --storage blob                      # Vercel Blob
npx instant-video encode a.mp4 --storage s3 --bucket my-bucket --region eu-west-1 --public-url https://cdn.example.com
```

The default command writes a static `./instant-video-out` folder: one `<id>.json` manifest per clip, an `index.json`
listing every encoded id, and content-addressed media. Upload that folder to any static host—R2, Blob and S3 are optional.
Folder inputs are scanned recursively for common video formats. Per clip:

- 360p (`m`) and 240p (`s`) renditions in H.264 (Main, no B-frames) and AV1, 7 s, 25 fps, a keyframe every 12 frames
  (0.48 s), CMAF-style fragmented MP4.
- Each rendition is one fMP4. `headBytes` is the exact byte boundary after the initial fragments, so the player warms
  it with `Range: bytes=0-(headBytes-1)` and fetches the remainder with `Range: bytes=headBytes-`. `--two-file` keeps
  the previous separate `head`/`tail` layout. H.264 also gets a faststart progressive fallback.
- A poster (AVIF, WebP, JPEG) that is frame 0 of the 360p H.264 file, at the clip's pixel size. The clip is moved off
  black openings (`--no-skip-black` to keep the start).
- With `--full 720,1080`, optional high-quality H.264 and AV1 fMP4 player renditions, progressive H.264 fallbacks,
  and a JPEG contact-sheet sprite used for scrub thumbnails.
- With `--poster-sprite`, one content-addressed JPEG plus a `posters.json` pixel-coordinate map for the whole input
  catalog, so a grid can replace N poster requests with one.
- File names are content-addressed, so everything can be cached forever.

Options: `--start <s>`, `--duration <s>`, `--head <s>`, `--head-kb <kb>`, `--prefix`, `--endpoint`.
`instant-video --help` lists all. The default 40 KB head budget raises CRF only as far as a conservative quality cap;
`--head-kb 0` disables budgeting.

### Storage

Storage is pluggable. The default writes to a local folder. Adapters are in `instant-video/storage`:

```ts
import { encodeToStorage } from 'instant-video/encode'
import { fsStorage, blobStorage, r2Storage, s3Storage } from 'instant-video/storage'

const storage = fsStorage({ dir: './public/media', baseUrl: '/media' })   // default
// const storage = blobStorage({ prefix: 'instant/' })                     // needs @vercel/blob, BLOB_READ_WRITE_TOKEN
// const storage = s3Storage({ bucket: 'b', region: 'eu-west-1' })         // needs @aws-sdk/client-s3 (any S3-compatible store via `endpoint`)
// const storage = r2Storage({ bucket: 'museum-of-ads-media', publicUrl: 'https://media.primitive8.com' }) // Wrangler OAuth

const { iv } = await encodeToStorage('./clip.mp4', 'my-clip', storage)     // iv is the manifest
```

A storage adapter is one method, so writing your own is short:

```ts
interface Storage { put(key: string, data: Buffer, contentType: string): Promise<string /* public URL */> }
```

The R2 adapter runs `npx wrangler r2 object put <bucket>/<key> --remote` and sets
`Cache-Control: public, max-age=31536000, immutable`; authenticate once with `npx wrangler login`. It never reads API
keys. `@vercel/blob` and `@aws-sdk/client-s3` remain optional peer dependencies. The manifest shape is `InstantSource`.

### Request budget

For a settled 12-card grid and its first warmed hover, the old layout used 25 GETs: 12 posters, 12 preview heads,
and one tail. A catalog sprite plus ranged single-file previews uses 14: one poster sprite, 12 ranged heads, and one
ranged tail—a 44% reduction. The initial visual burst drops from 12 poster GETs to one. The incremental cost of an
already-warmed hover remains one request; a cold unpredicted hover remains two ranges. Single-file mode also halves
preview objects and encoder/R2 PUTs per rendition from two to one.

## How it gets fast

| Cost on a normal `<video>` hover | What instant-video does |
|---|---|
| connect + fetch + parse the file | The first fMP4 range is prefetched for cards in or near the viewport, with at most four speculative requests in flight. Pointer prediction uses the same budget. |
| create the decoder, decode the first frame | Before the pointer arrives, the card it is heading to gets a `MediaSource` with the head appended: frame 0 is decoded and waiting. A small LRU pool (default 4) of such warm players is kept. |
| poster → video flash / visible seek | The poster is the exact frame 0 of the encoded clip, and the clip starts on a keyframe, so showing the video is invisible until motion begins. |
| fetch the rest | The tail is fetched when playback starts and appended behind the head while it plays. |

Fallbacks: no MSE → the progressive faststart MP4. Reduced motion, Save-Data and 2g → posters only. 3g or
`downlink < 1.5` → the 240p rendition. AV1 is used only when `MediaCapabilities.decodingInfo` reports it smooth and
power-efficient, otherwise H.264.

## Limits

- **Safari and iOS are untested.** The iOS path (`ManagedMediaSource`) is written to the spec but has never run on a
  device. Firefox is untested too. All benchmarks are Chromium only.
- Preview renditions are intentionally muted and default to 7 s; optional `--full` renditions retain source audio as AAC.
- The win comes from having bytes and a decoded frame 0 before the pointer arrives. A cold hover on a card that was
  never prefetched or predicted is no faster than a plain `<video>`.
- Short keyframe intervals cost size: the 360p H.264 file is about 60% larger than a normally encoded clip of the same
  length. You pay it only when a clip is played; the idle prefetch costs about one head (≈ 40 KB) per card near the viewport.
- Needs `MediaSource` (or `ManagedMediaSource`) for the fast path, and `fetch`, `IntersectionObserver` and custom elements.
- Not benchmarked under throttled networks (the 3g and Save-Data paths exist but are untested).
- The encoder shells out to `ffmpeg` and needs `libsvtav1` for the AV1 renditions.

## Development

```sh
npm i
npm run build        # tsup → dist/ (ESM + .d.ts)
npm test             # vitest (encoder tests need ffmpeg and skip without it)
npm run typecheck
npm run demo         # build, then the Vite homepage on http://localhost:4321/
```

Releasing: `npm publish` runs typecheck, tests and the build first (`prepublishOnly`).

## License

MIT © max-pantom
