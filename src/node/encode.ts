import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { FullQuality, FullRendition, InstantSource, Kind, PosterCatalog, Rendition, Size, ThumbnailSprite } from '../types'
import type { Storage } from './storage'

const exec = promisify(execFile)

export interface EncodeOptions {
  /** Clip length in seconds. Default 7. */
  duration?: number
  /** Where in the source the clip starts (seconds). Default 0. */
  start?: number
  /** Move the start forward (up to 4 s) to the first frame with picture, so the poster is not black. Default true. */
  skipBlack?: boolean
  /** Length the first download (head) should cover, seconds. Default 0.9. */
  head?: number
  /**
   * Size budget for a head in KB (init segment plus the first fragments). A head over budget is re-encoded with
   * a higher CRF on its first frames (H.264, so the rest of the clip keeps its quality) or on the whole clip
   * (AV1), until it fits or the CRF boost cap is reached. 0 disables. Default 40.
   */
  headKb?: number
  /** Emit legacy separate head/tail files instead of the default ranged single-file fMP4. */
  twoFile?: boolean
  /** Optional high-quality player heights. Supported values: 720 and 1080. */
  full?: FullQuality[]
  fps?: number
  /** Keyframe interval in frames; every fragment starts on one. Default 12 (0.48 s at 25 fps). */
  gop?: number
  ffmpeg?: string
  ffprobe?: string
  /** Path of the `cwebp` binary; ffmpeg's libwebp is used when it is missing. */
  cwebp?: string
  /** Keep intermediate files here instead of a temporary folder. */
  workDir?: string
}

export interface Artifact {
  /** Storage key relative to the clip id; media file names are content-addressed. */
  name: string
  data: Buffer
  type: string
}

export interface EncodedClip {
  w: number
  h: number
  /** Start used in the source, seconds (after black-skipping). */
  start: number
  startShifted: boolean
  artifacts: Artifact[]
  /** Byte sizes per file, for reports. */
  sizes: {
    poster: Record<string, number>
    r: Record<string, Record<string, { head: number; tail: number; full: number | null; codec: string; boost: number }>>
    full: Record<string, Record<string, { bytes: number; fallback: number | null; codec: string }>>
    sprite: number | null
  }
  /** Build the `InstantSource` once every artifact has a URL (`urls` maps artifact name → URL). */
  manifest(urls: Record<string, string>): InstantSource
}

const RENDITIONS: Record<Size, { h: number; avc: number; av1: number }> = { m: { h: 360, avc: 26, av1: 38 }, s: { h: 240, avc: 31, av1: 42 } }
/** Most CRF steps a head may be pushed up to fit its budget. */
const MAX_BOOST: Record<Kind, number> = { avc: 14, av1: 12 }
/** Rough CRF steps per halving of the bytes. */
const STEPS_PER_HALVING: Record<Kind, number> = { avc: 6, av1: 8 }
const VERSION = 3

// ---- ISO-BMFF helpers -----------------------------------------------------------------------------------
export function boxes(buf: Buffer) {
  const out: { type: string; start: number; end: number }[] = []
  for (let o = 0; o + 8 <= buf.length; ) {
    let size = buf.readUInt32BE(o)
    const type = buf.toString('latin1', o + 4, o + 8)
    if (size === 1) size = Number(buf.readBigUInt64BE(o + 8))
    if (size === 0) size = buf.length - o
    out.push({ type, start: o, end: o + size })
    o += size
  }
  return out
}

/** RFC 6381 codec string read from an init segment (avc1.* or av01.*). */
export function codecString(init: Buffer): string {
  const a = init.indexOf('avcC')
  if (a >= 0) return 'avc1.' + [1, 2, 3].map((i) => init[a + 4 + i].toString(16).padStart(2, '0')).join('').toUpperCase()
  const v = init.indexOf('av1C')
  if (v >= 0) {
    const b1 = init[v + 4 + 1]
    const b2 = init[v + 4 + 2]
    const profile = b1 >> 5
    const level = b1 & 31
    const tier = (b2 >> 7) & 1
    const hbd = (b2 >> 6) & 1
    return `av01.${profile}.${String(level).padStart(2, '0')}${tier ? 'H' : 'M'}.${hbd ? '10' : '08'}`
  }
  throw new Error('unknown codec in init segment')
}

/** Split a fragmented MP4 into its init segment (ftyp+moov) and moof+mdat fragments. */
export function splitFragments(buf: Buffer) {
  const top = boxes(buf)
  const moov = top.find((b) => b.type === 'moov')
  if (!moov) throw new Error('no moov box: not a fragmented MP4')
  const init = buf.subarray(0, moov.end)
  const frags: Buffer[] = []
  for (const m of top.filter((b) => b.type === 'moof')) {
    const mdat = top[top.indexOf(m) + 1]
    frags.push(buf.subarray(m.start, mdat.end))
  }
  return { init, frags }
}

const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex').slice(0, 12)
const round3 = (n: number) => Math.round(n * 1000) / 1000

// ---- encoder --------------------------------------------------------------------------------------------
const TAGS = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']

/** Encode one source file into a ready-to-store set of instant-video artifacts. */
export async function encodeClip(input: string, opts: EncodeOptions = {}): Promise<EncodedClip> {
  const dur = opts.duration ?? 7
  const fps = opts.fps ?? 25
  const gop = opts.gop ?? 12
  const headS = opts.head ?? 0.9
  const budget = Math.max(0, opts.headKb ?? 40) * 1024
  const fullHeights = [...new Set(opts.full ?? [])].sort((a, b) => a - b)
  if (fullHeights.some((h) => h !== 720 && h !== 1080)) throw new Error('full renditions must be 720 or 1080')
  const ffmpeg = opts.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg'
  const ffprobe = opts.ffprobe ?? process.env.FFPROBE ?? 'ffprobe'
  const cwebp = opts.cwebp ?? process.env.CWEBP ?? 'cwebp'
  if (!existsSync(input)) throw new Error(`input not found: ${input}`)

  const run = async (bin: string, args: string[]) => (await exec(bin, args, { encoding: 'buffer', maxBuffer: 1 << 28 })).stdout
  const work = opts.workDir ?? (await mkdtemp(join(tmpdir(), 'instant-video-')))
  await mkdir(work, { recursive: true })

  const vf = (h: number) => `scale=-2:${h}:flags=lanczos:out_color_matrix=bt709:out_range=tv,fps=${fps}`
  // `boost` raises the CRF of the head: x264 applies it to the first `headFrames` frames only (a zone), SVT-AV1 has no zones so it applies to the whole clip
  const codecs: Record<Kind, (crf: number, boost: number, headFrames: number) => string[]> = {
    avc: (crf, boost, headFrames) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '3.1',
      '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:bframes=0:open-gop=0${boost ? `:zones=0,${headFrames - 1},crf=${crf + boost}` : ''}`, ...TAGS],
    av1: (crf, boost) => ['-c:v', 'libsvtav1', '-crf', String(crf + boost), '-preset', '6', '-pix_fmt', 'yuv420p',
      '-svtav1-params', `keyint=${gop}:irefresh-type=2:scd=0:lookahead=0`, '-g', String(gop), ...TAGS],
  }

  try {
    // The poster is frame 0, so the clip must not open on black: move the start to the first frame with picture.
    const luma = async (t: number) => {
      try {
        return (await run(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', input, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-']))[0]
      } catch {
        return 255
      }
    }
    const ss0 = opts.start ?? 0
    let ss = ss0
    if (opts.skipBlack !== false) {
      while ((await luma(ss)) < 14 && ss < ss0 + 4) ss = round3(ss + 0.25)
      if ((await luma(ss)) < 14) ss = ss0 // dark by design: keep the original start
    }

    type Entry = Rendition & { _src: Buffer; _head: Buffer; _tail: Buffer; _full?: Buffer; boost: number }
    const r: Record<string, Record<string, Entry>> = {}
    const fragDur = gop / fps
    const nHeadWanted = Math.max(1, Math.ceil(headS / fragDur - 1e-6))

    const encodeVariant = async (rk: Size, ck: Kind, boost: number): Promise<Entry & { file: string }> => {
      const R = RENDITIONS[rk]
      const f = join(work, `${rk}-${ck}.mp4`)
      await run(ffmpeg, ['-y', '-v', 'error', '-ss', String(ss), '-i', input, '-t', String(dur), '-vf', vf(R.h), ...codecs[ck](R[ck], boost, nHeadWanted * gop),
        '-movflags', 'cmaf+default_base_moof', '-an', f])
      const data = await readFile(f)
      const { init, frags } = splitFragments(data)
      const frames = Number((await run(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f])).toString().trim())
      // head = init + enough fragments to cover `head` seconds (at least one)
      const nHead = Math.min(frags.length, nHeadWanted)
      const lastHead = frags[nHead - 1]
      const headEnd = data.indexOf(lastHead) + lastHead.length
      // Keep the split byte-contiguous so headBytes is also the exact HTTP Range boundary.
      const head = data.subarray(0, headEnd)
      const tail = data.subarray(headEnd)
      return { file: f, boost, codec: codecString(init), headDur: round3(nHead * fragDur), dur: round3(frames / fps), headBytes: head.length, tailBytes: tail.length, _src: data, _head: head, _tail: tail }
    }

    let posterFrom = ''
    for (const rk of Object.keys(RENDITIONS) as Size[]) {
      r[rk] = {}
      for (const ck of ['avc', 'av1'] as const) {
        let e = await encodeVariant(rk, ck, 0)
        // over budget: spend fewer bits on the head (CRF steps ≈ bytes ∕ 2 every STEPS_PER_HALVING)
        for (let boost = 0; budget && e.headBytes > budget && boost < MAX_BOOST[ck]; ) {
          boost = Math.min(MAX_BOOST[ck], boost + Math.max(2, Math.ceil(STEPS_PER_HALVING[ck] * Math.log2(e.headBytes / budget)) + 1))
          e = await encodeVariant(rk, ck, boost)
        }
        if (ck === 'avc') {
          // progressive fallback: same encode, moov up front
          const full = join(work, `${rk}-avc.full.mp4`)
          await run(ffmpeg, ['-y', '-v', 'error', '-i', e.file, '-c', 'copy', '-movflags', '+faststart', full])
          e._full = await readFile(full)
          e.fullBytes = e._full.length
          if (rk === 'm') posterFrom = e.file
        }
        r[rk][ck] = e
      }
    }

    type FullEntry = FullRendition & { _src: Buffer; _fallback?: Buffer }
    const full: Partial<Record<FullQuality, Partial<Record<Kind, FullEntry>>>> = {}
    for (const h of fullHeights) {
      const set: Partial<Record<Kind, FullEntry>> = {}
      for (const ck of ['avc', 'av1'] as const) {
        const file = join(work, `full-${h}-${ck}.mp4`)
        const crf = ck === 'avc' ? 22 : 32
        const videoArgs = ck === 'avc'
          ? ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', h > 720 ? '4.2' : '4.0', '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`, ...TAGS]
          : ['-c:v', 'libsvtav1', '-crf', String(crf), '-preset', '6', '-pix_fmt', 'yuv420p', '-svtav1-params', `keyint=${gop}:irefresh-type=2:scd=0`, '-g', String(gop), ...TAGS]
        await run(ffmpeg, ['-y', '-v', 'error', '-ss', String(ss), '-i', input, '-t', String(dur), '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf(h), ...videoArgs,
          '-c:a', 'aac', '-b:a', '128k', '-movflags', 'cmaf+default_base_moof', file])
        const data = await readFile(file)
        const { init } = splitFragments(data)
        const [width, height] = (await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file])).toString().trim().split(',').map(Number)
        const entry: FullEntry = { codec: codecString(init), src: '', w: width, h: height, dur, bytes: data.length, _src: data }
        if (ck === 'avc') {
          const fallback = join(work, `full-${h}-avc.progressive.mp4`)
          await run(ffmpeg, ['-y', '-v', 'error', '-i', file, '-c', 'copy', '-movflags', '+faststart', fallback])
          entry._fallback = await readFile(fallback)
          entry.fallback = ''
          entry.fallbackBytes = entry._fallback.length
        }
        set[ck] = entry
      }
      full[h] = set
    }

    // poster: frame 0 of the very file the preview player decodes first
    const png = join(work, 'p0.png')
    await run(ffmpeg, ['-y', '-v', 'error', '-i', posterFrom, '-frames:v', '1', png])
    const jpg = join(work, 'p0.jpg')
    const webp = join(work, 'p0.webp')
    const avif = join(work, 'p0.avif')
    await run(ffmpeg, ['-y', '-v', 'error', '-i', png, '-q:v', '3', jpg])
    try {
      await run(cwebp, ['-quiet', '-q', '78', png, '-o', webp])
    } catch {
      await run(ffmpeg, ['-y', '-v', 'error', '-i', png, '-c:v', 'libwebp', '-quality', '78', webp])
    }
    await run(ffmpeg, ['-y', '-v', 'error', '-i', png, '-frames:v', '1', '-c:v', 'libsvtav1', '-crf', '30', '-pix_fmt', 'yuv420p', avif])
    const [w, h] = (await run(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', posterFrom])).toString().trim().split(',').map(Number)
    const poster = { jpg: await readFile(jpg), webp: await readFile(webp), avif: await readFile(avif) }

    let sprite: (ThumbnailSprite & { _data: Buffer }) | undefined
    if (fullHeights.length) {
      const interval = Math.max(1, Math.ceil(dur / 12))
      const count = Math.max(1, Math.ceil(dur / interval))
      const columns = Math.min(6, count)
      const rows = Math.ceil(count / columns)
      const width = 160
      const height = 90
      const file = join(work, 'sprite.jpg')
      const filter = `fps=1/${interval},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,tile=${columns}x${rows}`
      await run(ffmpeg, ['-y', '-v', 'error', '-ss', String(ss), '-i', input, '-t', String(dur), '-vf', filter, '-frames:v', '1', '-q:v', '4', file])
      sprite = { src: '', width, height, columns, rows, count, interval, _data: await readFile(file) }
    }

    // content-addressed names → immutable
    const artifacts: Artifact[] = []
    const names = new Map<Buffer, string>()
    const add = (name: string, data: Buffer, type: string) => {
      artifacts.push({ name, data, type })
      names.set(data, name)
      return name
    }
    const sizes: EncodedClip['sizes'] = { poster: {}, r: {}, full: {}, sprite: sprite?._data.length ?? null }
    const posterNames: Record<string, string> = {}
    for (const [k, buf] of Object.entries(poster)) {
      sizes.poster[k] = buf.length
      posterNames[k] = add(`p-${hash(buf)}.${k}`, buf, `image/${k === 'jpg' ? 'jpeg' : k}`)
    }
    const files: Record<string, Record<string, { src?: string; head?: string; tail?: string; full?: string }>> = {}
    for (const [rk, cs] of Object.entries(r)) {
      files[rk] = {}
      sizes.r[rk] = {}
      for (const [ck, e] of Object.entries(cs)) {
        files[rk][ck] = {
          ...(opts.twoFile ? {
            head: add(`${rk}-${ck}-${hash(e._head)}.head.mp4`, e._head, 'video/mp4'),
            tail: add(`${rk}-${ck}-${hash(e._tail)}.tail.m4s`, e._tail, 'video/mp4'),
          } : { src: add(`${rk}-${ck}-${hash(e._src)}.mp4`, e._src, 'video/mp4') }),
          ...(e._full ? { full: add(`${rk}-${ck}-${hash(e._full)}.full.mp4`, e._full, 'video/mp4') } : {}),
        }
        sizes.r[rk][ck] = { head: e.headBytes, tail: e.tailBytes, full: e.fullBytes ?? null, codec: e.codec, boost: e.boost }
      }
    }

    const fullFiles: Record<string, Record<string, { src: string; fallback?: string }>> = {}
    for (const [height, set] of Object.entries(full)) {
      fullFiles[height] = {}
      sizes.full[height] = {}
      for (const [ck, e] of Object.entries(set)) {
        fullFiles[height][ck] = {
          src: add(`full-${height}-${ck}-${hash(e._src)}.mp4`, e._src, 'video/mp4'),
          ...(e._fallback ? { fallback: add(`full-${height}-${ck}-${hash(e._fallback)}.progressive.mp4`, e._fallback, 'video/mp4') } : {}),
        }
        sizes.full[height][ck] = { bytes: e.bytes, fallback: e.fallbackBytes ?? null, codec: e.codec }
      }
    }
    const spriteName = sprite ? add(`sprite-${hash(sprite._data)}.jpg`, sprite._data, 'image/jpeg') : undefined

    return {
      w,
      h,
      start: ss,
      startShifted: ss !== ss0,
      artifacts,
      sizes,
      manifest(urls) {
        const url = (n: string) => {
          if (!(n in urls)) throw new Error(`no URL for ${n}`)
          return urls[n]
        }
        const out: InstantSource & { fps: number; gop: number } = { v: VERSION, dur, fps, gop, w, h, r: {}, poster: {} }
        for (const [k, n] of Object.entries(posterNames)) (out.poster as Record<string, string>)[k] = url(n)
        for (const [rk, cs] of Object.entries(r)) {
          const rr: Partial<Record<Kind, Rendition>> = {}
          for (const [ck, e] of Object.entries(cs)) {
            const f = files[rk][ck]
            rr[ck as Kind] = {
              codec: e.codec, headDur: e.headDur, dur: e.dur, headBytes: e.headBytes, tailBytes: e.tailBytes,
              ...(f.src ? { src: url(f.src) } : { head: url(f.head!), tail: url(f.tail!) }),
              ...(f.full ? { full: url(f.full), fullBytes: e.fullBytes } : {}),
            }
          }
          out.r[rk as Size] = rr
        }
        if (fullHeights.length) {
          out.full = { r: {} }
          for (const [height, set] of Object.entries(full)) {
            const rr: Partial<Record<Kind, FullRendition>> = {}
            for (const [ck, e] of Object.entries(set)) {
              const f = fullFiles[height][ck]
              rr[ck as Kind] = {
                codec: e.codec, src: url(f.src), ...(f.fallback ? { fallback: url(f.fallback) } : {}),
                w: e.w, h: e.h, dur: e.dur, bytes: e.bytes, ...(e.fallbackBytes ? { fallbackBytes: e.fallbackBytes } : {}),
              }
            }
            out.full.r[Number(height) as FullQuality] = rr
          }
          if (sprite && spriteName) out.full.sprite = {
            src: url(spriteName), width: sprite.width, height: sprite.height, columns: sprite.columns,
            rows: sprite.rows, count: sprite.count, interval: sprite.interval,
          }
        }
        return out
      },
    }
  } finally {
    if (!opts.workDir) await rm(work, { recursive: true, force: true })
  }
}

/** Encode `input`, store every artifact under `<id>/…` and return the `iv` object for the player. */
export async function encodeToStorage(input: string, id: string, storage: Storage, opts: EncodeOptions = {}) {
  const clip = await encodeClip(input, opts)
  const urls: Record<string, string> = {}
  for (const a of clip.artifacts) urls[a.name] = await storage.put(`${id}/${a.name}`, a.data, a.type)
  return { clip, iv: clip.manifest(urls) }
}

export interface PosterCatalogOptions {
  ffmpeg?: string
  workDir?: string
  width?: number
  height?: number
  columns?: number
}

/** Combine catalog poster JPEGs into one content-addressed contact sheet and a pixel-coordinate map. */
export async function encodePosterCatalog(posters: Array<{ id: string; data: Buffer }>, opts: PosterCatalogOptions = {}) {
  if (!posters.length) throw new Error('poster catalog needs at least one poster')
  const ffmpeg = opts.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg'
  const width = opts.width ?? 160
  const height = opts.height ?? 90
  const columns = opts.columns ?? Math.ceil(Math.sqrt(posters.length))
  const rows = Math.ceil(posters.length / columns)
  const work = opts.workDir ?? (await mkdtemp(join(tmpdir(), 'instant-video-posters-')))
  await mkdir(work, { recursive: true })
  try {
    const inputs: string[] = []
    const filters: string[] = []
    const labels: string[] = []
    for (let i = 0; i < posters.length; i++) {
      const file = join(work, `${i}.jpg`)
      await writeFile(file, posters[i].data)
      inputs.push('-i', file)
      filters.push(`[${i}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2[p${i}]`)
      labels.push(`[p${i}]`)
    }
    const layout = posters.map((_, i) => `${(i % columns) * width}_${Math.floor(i / columns) * height}`).join('|')
    filters.push(`${labels.join('')}xstack=inputs=${posters.length}:layout=${layout}:fill=black[out]`)
    const file = join(work, 'catalog.jpg')
    await exec(ffmpeg, ['-y', '-v', 'error', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '4', file], { encoding: 'buffer', maxBuffer: 1 << 28 })
    const data = await readFile(file)
    const artifact: Artifact = { name: `poster-catalog-${hash(data)}.jpg`, data, type: 'image/jpeg' }
    return {
      artifact,
      manifest(src: string): PosterCatalog {
        return {
          v: 1, src, width, height, columns, rows,
          items: Object.fromEntries(posters.map((poster, i) => [poster.id, { x: (i % columns) * width, y: Math.floor(i / columns) * height, width, height }])),
        }
      },
    }
  } finally {
    if (!opts.workDir) await rm(work, { recursive: true, force: true })
  }
}

