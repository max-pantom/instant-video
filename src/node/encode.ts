import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { InstantSource, Kind, Rendition, Size } from '../types'
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
  /** Storage key relative to the clip id, content-addressed: `m-avc-<hash>.head.mp4`. */
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
  sizes: { poster: Record<string, number>; r: Record<string, Record<string, { head: number; tail: number; full: number | null; codec: string }>> }
  /** Build the `InstantSource` once every artifact has a URL (`urls` maps artifact name → URL). */
  manifest(urls: Record<string, string>): InstantSource
}

const RENDITIONS: Record<Size, { h: number; avc: number; av1: number }> = { m: { h: 360, avc: 26, av1: 38 }, s: { h: 240, avc: 31, av1: 42 } }
const VERSION = 1

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
  const ffmpeg = opts.ffmpeg ?? process.env.FFMPEG ?? 'ffmpeg'
  const ffprobe = opts.ffprobe ?? process.env.FFPROBE ?? 'ffprobe'
  const cwebp = opts.cwebp ?? process.env.CWEBP ?? 'cwebp'
  if (!existsSync(input)) throw new Error(`input not found: ${input}`)

  const run = async (bin: string, args: string[]) => (await exec(bin, args, { encoding: 'buffer', maxBuffer: 1 << 28 })).stdout
  const work = opts.workDir ?? (await mkdtemp(join(tmpdir(), 'instant-video-')))
  await mkdir(work, { recursive: true })

  const vf = (h: number) => `scale=-2:${h}:flags=lanczos:out_color_matrix=bt709:out_range=tv,fps=${fps}`
  const codecs: Record<Kind, (crf: number) => string[]> = {
    avc: (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-level', '3.1',
      '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:bframes=0:open-gop=0`, ...TAGS],
    av1: (crf) => ['-c:v', 'libsvtav1', '-crf', String(crf), '-preset', '6', '-pix_fmt', 'yuv420p',
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

    type Entry = Rendition & { _head: Buffer; _tail: Buffer; _full?: Buffer }
    const r: Record<string, Record<string, Entry>> = {}
    let posterFrom = ''
    for (const [rk, R] of Object.entries(RENDITIONS)) {
      r[rk] = {}
      for (const ck of ['avc', 'av1'] as const) {
        const f = join(work, `${rk}-${ck}.mp4`)
        await run(ffmpeg, ['-y', '-v', 'error', '-ss', String(ss), '-i', input, '-t', String(dur), '-vf', vf(R.h), ...codecs[ck](R[ck]),
          '-movflags', 'cmaf+default_base_moof', '-an', f])
        const { init, frags } = splitFragments(await readFile(f))
        const frames = Number((await run(ffprobe, ['-v', 'error', '-count_packets', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', f])).toString().trim())
        const fragDur = gop / fps
        // head = init + enough fragments to cover `head` seconds (at least one)
        const nHead = Math.min(frags.length, Math.max(1, Math.ceil(headS / fragDur - 1e-6)))
        const head = Buffer.concat([init, ...frags.slice(0, nHead)])
        const tail = Buffer.concat(frags.slice(nHead))
        const e: Entry = { codec: codecString(init), headDur: round3(nHead * fragDur), dur: round3(frames / fps), headBytes: head.length, tailBytes: tail.length, head: '', tail: '', _head: head, _tail: tail }
        if (ck === 'avc') {
          // progressive fallback: same encode, moov up front
          const full = join(work, `${rk}-avc.full.mp4`)
          await run(ffmpeg, ['-y', '-v', 'error', '-i', f, '-c', 'copy', '-movflags', '+faststart', full])
          e._full = await readFile(full)
          e.fullBytes = e._full.length
          if (rk === 'm') posterFrom = f
        }
        r[rk][ck] = e
      }
    }

    // poster: frame 0 of the very file the player decodes first
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

    // content-addressed names → immutable
    const artifacts: Artifact[] = []
    const names = new Map<Buffer, string>()
    const add = (name: string, data: Buffer, type: string) => {
      artifacts.push({ name, data, type })
      names.set(data, name)
      return name
    }
    const sizes: EncodedClip['sizes'] = { poster: {}, r: {} }
    const posterNames: Record<string, string> = {}
    for (const [k, buf] of Object.entries(poster)) {
      sizes.poster[k] = buf.length
      posterNames[k] = add(`p-${hash(buf)}.${k}`, buf, `image/${k === 'jpg' ? 'jpeg' : k}`)
    }
    const files: Record<string, Record<string, { head: string; tail: string; full?: string }>> = {}
    for (const [rk, cs] of Object.entries(r)) {
      files[rk] = {}
      sizes.r[rk] = {}
      for (const [ck, e] of Object.entries(cs)) {
        files[rk][ck] = {
          head: add(`${rk}-${ck}-${hash(e._head)}.head.mp4`, e._head, 'video/mp4'),
          tail: add(`${rk}-${ck}-${hash(e._tail)}.tail.m4s`, e._tail, 'video/mp4'),
          ...(e._full ? { full: add(`${rk}-${ck}-${hash(e._full)}.full.mp4`, e._full, 'video/mp4') } : {}),
        }
        sizes.r[rk][ck] = { head: e.headBytes, tail: e.tailBytes, full: e.fullBytes ?? null, codec: e.codec }
      }
    }

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
              head: url(f.head), tail: url(f.tail), ...(f.full ? { full: url(f.full), fullBytes: e.fullBytes } : {}),
            }
          }
          out.r[rk as Size] = rr
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

