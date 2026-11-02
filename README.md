# instant-video

Hover-preview videos that start in a few milliseconds. A framework-agnostic `<instant-video>` custom element, a thin
React wrapper, and an encoder CLI that produces the assets. MIT licensed.

On a normal `<video>` a hover pays for connecting, fetching, parsing, creating a decoder and decoding the first frame.
instant-video does all of that **before** the pointer arrives, so the hover only has to press play.

## Numbers

Hover latency measured on the live Museum of Ads site (the library's first user): Chromium 156, 1440×900, no
throttling, 24 hovers per scenario on distinct cards, median / p95 in ms from pointer-enter, 51 clips.
*Visible* = the video is on screen; *playing* = the `playing` event. Reproduce with `scripts/bench.mjs` in
[museum-of-ads](https://github.com/max-pantom/museum-of-ads).

| scenario | engine | visible | playing |
|---|---|---|---|
| cold, predicted pointer | plain `<video>` preview | 200 / 249 | 152 / 186 |
| cold, predicted pointer | **instant-video** | **33 / 35** | **20 / 22** |
| cold, teleport onto the card | plain `<video>` preview | 203 / 251 | 146 / 187 |
| cold, teleport onto the card | **instant-video** | **29 / 40** | **20 / 29** |
| warm (cached), teleport | plain `<video>` preview | 80 / 105 | 26 / 34 |
| warm (cached), teleport | **instant-video** | **26 / 32** | **17 / 27** |
| cold, teleport, *idle prefetch off* | **instant-video** | 147 / 596 | 144 / 591 |

A hover reaches `playing` in about 20 ms and the clip is on screen (frame 0, identical to the poster) in about 33 ms.
The first *new* frame lands at about 50 ms, which is the floor for a 25 fps clip, not a loading cost. The last row is the
honest caveat: without the idle head prefetch and pointer prediction, a cold hover is no faster than a plain video
(median 144 vs 146 ms to `playing`) and has a worse tail. The win comes from having bytes and a decoded frame 0 before
the pointer arrives, not from the container format alone.

Sizes (51 clips, median): head 360p H.264 39 KB / AV1 26 KB, 240p H.264 14 KB; tail 360p H.264 286 KB; poster AVIF 5.5 KB.

Caveats: local machine to a CDN is a fast path; one browser engine (Chromium); no CPU or network throttling; real devices
and Safari/iOS were not benchmarked.

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
  card.onpointerleave = () => (el.active = false)                  // pause, rewind, fade back to the poster
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
  <InstantVideo source={clip} active={hovering} warm={intent} />
</div>
```

### Config

```ts
import { configure } from 'instant-video'
configure({
  predict: true,       // warm the card the pointer is heading to (velocity + direction, ~180 ms lookahead)
  prefetch: true,      // idle-prefetch heads of cards near the viewport
  poolSize: 4,         // warm players kept (0 disables warming entirely)
  lookaheadMs: 180,
  size: 'auto',        // 'm' (360p) | 's' (240p)
  codec: 'auto',       // 'avc' | 'av1'
  mse: true,           // false forces the progressive file
})
```

## Encoding

```sh
npx instant-video encode ./clip.mp4 --id my-clip --out ./public/media --base-url /media
npx instant-video encode https://www.youtube.com/watch?v=… --id spot     # URLs go through yt-dlp
npx instant-video encode a.mp4 b.mp4 --storage blob                      # Vercel Blob
npx instant-video encode a.mp4 --storage s3 --bucket my-bucket --region eu-west-1 --public-url https://cdn.example.com
```

Each input produces `<out>/<id>.json` (the manifest you pass as `source`) and the media files. Per clip:

- 360p (`m`) and 240p (`s`) renditions in H.264 (Main, no B-frames) and AV1, 7 s, 25 fps, a keyframe every 12 frames
  (0.48 s), CMAF-style fragmented MP4.
- Each rendition is split into a `head` (init segment plus the first fragments, ≥ 0.9 s, about 10–40 KB) and a `tail`
  (the rest). H.264 also gets a faststart progressive `full` file for the fallback.
- A poster (AVIF, WebP, JPEG) that is frame 0 of the 360p H.264 file, at the clip's pixel size. The clip is moved off
  black openings (`--no-skip-black` to keep the start).
- File names are content-addressed, so everything can be cached forever.

Options: `--start <s>`, `--duration <s>`, `--head <s>`, `--prefix`, `--endpoint`. `instant-video --help` lists all.

### Storage

Storage is pluggable. The default writes to a local folder. Adapters are in `instant-video/storage`:

```ts
import { encodeToStorage } from 'instant-video/encode'
import { fsStorage, blobStorage, s3Storage } from 'instant-video/storage'

const storage = fsStorage({ dir: './public/media', baseUrl: '/media' })   // default
// const storage = blobStorage({ prefix: 'instant/' })                     // needs @vercel/blob, BLOB_READ_WRITE_TOKEN
// const storage = s3Storage({ bucket: 'b', region: 'eu-west-1' })         // needs @aws-sdk/client-s3 (any S3-compatible store via `endpoint`)

const { iv } = await encodeToStorage('./clip.mp4', 'my-clip', storage)     // iv is the manifest
```

A storage adapter is one method, so writing your own is short:

```ts
interface Storage { put(key: string, data: Buffer, contentType: string): Promise<string /* public URL */> }
```

`@vercel/blob` and `@aws-sdk/client-s3` are optional peer dependencies, loaded only when their adapter is used. The
manifest shape is `InstantSource` in `src/types.ts`.

## How it gets fast

| Cost on a normal `<video>` hover | What instant-video does |
|---|---|
| connect + fetch + parse the file | The head of each clip is prefetched while the page is idle, for cards in or near the viewport. A `preconnect` to the media origin is added once. |
| create the decoder, decode the first frame | Before the pointer arrives, the card it is heading to gets a `MediaSource` with the head appended: frame 0 is decoded and waiting. A small LRU pool (default 4) of such warm players is kept. |
| poster → video flash / visible seek | The poster is the exact frame 0 of the encoded clip, and the clip starts on a keyframe, so showing the video is invisible until motion begins. |
| fetch the rest | The tail is fetched when playback starts and appended behind the head while it plays. |

Fallbacks: no MSE → the progressive faststart MP4. Reduced motion, Save-Data and 2g → posters only. 3g or
`downlink < 1.5` → the 240p rendition. AV1 is used only when `MediaCapabilities.decodingInfo` reports it smooth and
power-efficient, otherwise H.264.

## Limits

- **Safari and iOS are untested.** The iOS path (`ManagedMediaSource`) is written to the spec but has never run on a
  device. Firefox is untested too. All benchmarks are Chromium only.
- Muted, looping clips only (no audio track is encoded), 7 s by default. This is for previews, not a general player.
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
npm run demo         # build, then serve demo/ on http://localhost:4321/demo/
```

Releasing: `npm publish` runs typecheck, tests and the build first (`prepublishOnly`).

## License

MIT © max-pantom
