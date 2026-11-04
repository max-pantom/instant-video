---
name: instant-video
description: >
  Encode clips and wire the instant-video hover player (the <instant-video> element and InstantVideo from instant-video/react).
  Use when adding hover-preview video, a card or gallery that plays as the pointer arrives, product-grid video, or a click that promotes that same preview into a full player.
  Also use when the user says instant-video, instant video, iv, hover video, warm video, or fMP4 hover preview, even if they do not name the package.
---

# instant-video

Hover video that is already decoded when the pointer arrives. The package owns prefetch, the warm decoder pool, MSE, and the player. Do not build a second `<video>` hover path, a custom MediaSource pipeline, or a second player beside it.

## Decide

- Hover preview on cards or a grid: encode previews, render a poster, play with `active` only while the pointer is on the card.
- Click opens the real video: same element, set `mode` to `player`. Do not mount a new player or seek back to 0.
- The user only needs a normal page video with no hover: use a plain `<video>`. This package is the wrong tool.
- Vue or Svelte: there is no wrapper. Use the custom element.

## Install

Browser imports have no dependencies. The encoder needs `ffmpeg` on `PATH` with `libx264` and `libsvtav1`. `cwebp` and `yt-dlp` are optional.

```sh
npm i github:max-pantom/instant-video
```

It is not on npm yet. Inside this repository, import the package you are editing rather than installing a second copy.

## Encode

Run this before writing UI. One manifest per clip. Do not hand-write the JSON.

```sh
npx instant-video encode ./clips --out ./public/media --base-url /media
```

`--base-url` is the URL prefix the page will use. A file written to `./public/media` and served as `/media/...` needs `--base-url /media`. A wrong prefix 404s every clip.

Add a full player only when a click should play past the preview, with audio and a quality menu:

```sh
npx instant-video encode ./clip.mp4 --id my-clip --out ./public/media --base-url /media --full 720,1080
```

Defaults that matter: 7s clip, head about 0.9s and 40 KB, 360p and 240p, H.264 and AV1, one ranged fMP4 per rendition, poster is frame 0. Black openings are skipped unless `--no-skip-black`.

Output to check before wiring UI:

- `public/media/<id>.json` parses as `InstantSource` (`v`, `w`, `h`, `poster`, `r.m.avc` with `src` and `headBytes`).
- The encoder prints head size. A head near 40 KB is the preview budget. A missing `ffmpeg` or `libsvtav1` error stops the task; do not invent media files.
- `index.json` is the list of ids for local storage.

Leave R2, S3, and Blob alone unless the user already has that store. Default is a folder they can upload anywhere. Cross-origin media must be readable by `fetch` (`Access-Control-Allow-Origin`). Same origin needs nothing. A host that ignores `Range` and returns 200 still plays; it only loses the small-head optimization.

## Wire

The element fills the nearest positioned ancestor and stays invisible until a frame is ready. The poster image is a separate element underneath it, using the manifest poster (frame 0), not a different still.

Write the integration in TypeScript. The package publishes `.d.ts` for `instant-video` and `instant-video/react`. Do not add a plain `.js` player script.

Importing `instant-video` registers `<instant-video>`. `source` is an `InstantSource` object, never a URL string and never a video file.

Hit target for prediction is the nearest `[data-iv-target]` ancestor, or `el.target`, or the parent. `warmed` (`warm` in React) decodes frame 0 without playing. `active` plays. Preview playback forces mute and loop. Clear `active` on leave only while `mode` is still `preview`, or a click-to-player session stops.

### Custom element

Markup stays HTML. Behavior goes in a `.ts` module:

```html
<div class="card" data-iv-target style="position:relative">
  <img alt="">
  <instant-video></instant-video>
</div>
<script type="module" src="/src/card.ts"></script>
```

```ts
import { InstantVideoElement, type InstantSource } from 'instant-video'

const card = document.querySelector('.card')
const el = card?.querySelector('instant-video')
if (!card || !(el instanceof InstantVideoElement)) throw new Error('missing instant-video card')

const source = (await fetch('/media/my-clip.json').then((res) => res.json())) as InstantSource
el.source = source
const poster = card.querySelector('img')
if (poster) poster.src = source.poster?.jpg ?? source.poster?.webp ?? source.poster?.avif ?? ''

card.addEventListener('pointerenter', () => {
  el.warmed = true
  el.active = true
})
card.addEventListener('pointerleave', () => {
  if (el.mode === 'preview') el.active = false
})
card.addEventListener('click', () => {
  el.controls = true
  el.muted = true
  el.mode = 'player'
})
```

Set the `<img>` from `source.poster`, which is frame 0 of the encode.

### React

```tsx
import { useState } from 'react'
import type { InstantSource } from 'instant-video'
import { InstantVideo } from 'instant-video/react'

export function ClipCard({ clip }: { clip: InstantSource }) {
  const [hovering, setHovering] = useState(false)
  const [open, setOpen] = useState(false)

  return (
    <div
      className="card"
      data-iv-target
      style={{ position: 'relative' }}
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onClick={() => setOpen(true)}
    >
      <img src={clip.poster?.jpg ?? clip.poster?.webp ?? clip.poster?.avif} alt="" />
      <InstantVideo
        source={clip}
        warm={hovering}
        active={hovering || open}
        mode={open ? 'player' : 'preview'}
        controls={open}
        muted
        onModeChange={(mode) => setOpen(mode === 'player')}
      />
    </div>
  )
}
```

Fetch each `<id>.json` once, parse it as `InstantSource`, and pass that object. One `InstantVideo` per card. Call `configure` once for the page, not per card.

```ts
import { configure } from 'instant-video'
configure({
  predict: true,        // warm the card the pointer is heading toward
  prefetch: 'viewport', // at most 4 heads; off on touch, Save-Data, and 2g
  poolSize: 4,          // 0 disables warming
  lookaheadMs: 180,
  size: 'auto',         // 'm' 360p, 's' 240p
  codec: 'auto',        // AV1 only when the browser reports it smooth and power-efficient
  mse: true,
})
```

Player theme tokens: `--iv-accent`, `--iv-fg`, `--iv-bg`, `--iv-radius`, `--iv-font`. Captions are child `<track>` elements. The element re-emits `play`, `pause`, `timeupdate`, `ended`, `modechange`, `qualitychange`, and `error`. Inside a dialog it emits `iv-close` after a downward swipe.

## Check

Confirm these in the running page, not only by reading the code:

- The poster is visible before hover. The video does not flash a different frame.
- Pointer enter starts playback. Pointer leave stops it and leaves the poster.
- A second card does not keep playing.
- Click promotion keeps the current moment playing with controls. It does not restart at 0.
- Reduced motion, Save-Data, and 2g stay on the poster. That is the library, not a bug.
- A card that was never prefetched is not faster than a normal video. Do not "fix" that with `preload` on a raw `<video>`.

Safari, iOS, and Firefox are untested. Preview renditions have no audio. Full renditions keep AAC when the source has it. Do not promise those platforms work.
