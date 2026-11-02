# instant-video

Hover-preview videos that start in a few milliseconds. A framework-agnostic `<instant-video>` custom element plus a
thin React wrapper. Private to this repo (not published), MIT licensed.

## How it gets fast

| Cost on a normal `<video>` hover | What instant-video does |
|---|---|
| connect + fetch + parse the file | The first ~1 s of each clip ("head", init segment + 2 fragments, ~10–40 KB) is prefetched while the page is idle, for cards in/near the viewport. A `preconnect` to the media origin is added once. |
| create the decoder, decode the first frame | Before the pointer arrives, the card it is heading to gets a `MediaSource` with the head appended: frame 0 is decoded and waiting. A small LRU pool (default 4) of such warm players is kept. |
| poster → video flash / visible seek | The poster is the exact frame 0 of the encoded clip, and the clip starts on a keyframe, so showing the video is invisible until motion begins. |
| fetch the rest | The tail (remaining fragments) is fetched when playback starts and appended behind the head while it plays. |

Fallbacks: no MSE → the progressive faststart MP4 (`full`). Reduced motion, Save-Data and 2g → posters only. 3g or
`downlink < 1.5` → the 240p rendition. AV1 is used only when `MediaCapabilities.decodingInfo` reports it smooth *and*
power-efficient; otherwise H.264. iOS Safari uses `ManagedMediaSource` (written to spec, not tested on a device).

## Use

```ts
import 'instant-video'            // registers <instant-video>
```
```html
<div class="card" data-iv-target style="position:relative">
  <img class="poster" src="…">
  <instant-video></instant-video>   <!-- fills the positioned parent -->
</div>
```
```js
el.source = ad.iv   // the object written by scripts/make-instant.mjs
el.active = true    // play (muted loop); false → pause, rewind, fade to the poster
el.warmed = true    // get ready without playing
```

React:

```tsx
import { InstantVideo } from 'instant-video/react'
<InstantVideo source={ad.iv} active={playing} warm={intent} />
```

The hit area used for prediction, focus and touch is the nearest `[data-iv-target]` ancestor (or `el.target`, or the
parent). The element's styling is internal: absolutely positioned, `object-fit: cover`, video opacity 0 until a frame is
on screen, instant in, `180ms var(--ease-out)` out.

### Config

```ts
import { configure } from 'instant-video'
configure({
  predict: true,       // warm the card the pointer is heading to (velocity + direction, ~180 ms lookahead)
  prefetch: true,      // idle-prefetch heads near the viewport
  poolSize: 4,         // warm players kept (0 disables warming entirely)
  lookaheadMs: 180,
  size: 'auto',        // 'm' (360p) | 's' (240p)
  codec: 'auto',       // 'avc' | 'av1'
  mse: true,           // false forces the progressive file
})
```

## Encoding

`scripts/make-instant.mjs` (repo root) makes the assets and saves an `iv` object on each ad through the CMS API:

```
node scripts/make-instant.mjs --dry --id moa-4c9e6e4b     # encode locally to previews-tmp/instant/<id>, no upload
node scripts/make-instant.mjs                              # every ad with preview_url and no iv
node scripts/make-instant.mjs --force --head 0.9           # redo all; head length target in seconds
```

Per ad: `m` (360p) and `s` (240p) × H.264 (Main, no B-frames) and AV1, each with a keyframe every 12 frames (0.48 s),
CMAF-style fragmented MP4. Each is split into `head` (ftyp+moov + the first fragments covering ≥ 0.9 s) and `tail` (the
rest); H.264 also gets a faststart progressive `full` for the fallback. Poster = frame 0 of the 360p H.264 file as AVIF,
WebP and JPEG at the clip's pixel size. Files are uploaded to Blob under `instant/<id>/<sha256-prefix>.<ext>` with
`cache-control: max-age=31536000` (content-addressed, so immutable). Sizes land in `docs/instant-report.json`.

`iv` shape: see `src/types.ts` (`InstantSource`).

## Bench

`/?bench&engine=old|new&pred=on|off&prefetch=on|off` records pointer-enter → visible / first frame / motion / playing per
hover (`window.__bench`, plus an on-page panel). `node scripts/bench.mjs [--local|--site URL]` runs the scenario matrix
with Playwright.
