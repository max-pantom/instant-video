#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { encodeToStorage } from './node/encode'
import { blobStorage, fsStorage, s3Storage, type Storage } from './node/storage'

const exec = promisify(execFile)

const HELP = `instant-video: encode clips for hover playback

Usage
  instant-video encode <input...> [options]

<input> is a video file, or a URL (downloaded with yt-dlp, which must be installed).

Options
  --out <dir>          where the manifest (<id>.json) and, for local storage, the files go   [./instant-video-out]
  --id <name>          id for a single input (default: the file name without extension)
  --storage <kind>     local | blob | s3                                                      [local]
  --base-url <url>     local: URL prefix written into the manifest, e.g. /media or https://cdn.example.com
  --prefix <path>      blob / s3: key prefix inside the store                                 [instant/]
  --bucket <name>      s3: bucket (or INSTANT_VIDEO_S3_BUCKET)
  --region <name>      s3: region
  --endpoint <url>     s3: custom endpoint for S3-compatible stores
  --public-url <url>   s3: public base URL (CDN) used for the manifest URLs
  --start <seconds>    where the clip starts in the source                                    [0]
  --duration <s>       clip length                                                            [7]
  --head <s>           length the first download (head) should cover                          [0.9]
  --no-skip-black      keep the start even if it is a black frame
  -h, --help           show this help
  -v, --version        show the version

Needs ffmpeg (libx264, libsvtav1) on the PATH. blob storage reads BLOB_READ_WRITE_TOKEN, s3 the usual AWS_* variables.
`

const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const opt = (n: string, d?: string) => {
  const i = args.indexOf(n)
  return i >= 0 ? args[i + 1] : d
}
const VALUE_FLAGS = new Set(['--out', '--id', '--storage', '--base-url', '--prefix', '--bucket', '--region', '--endpoint', '--public-url', '--start', '--duration', '--head'])

async function main() {
  const cmd = args[0]
  if (!cmd || cmd === '-h' || cmd === '--help' || cmd === 'help') return void console.log(HELP)
  if (cmd === '-v' || cmd === '--version') {
    const { createRequire } = await import('node:module')
    return void console.log(createRequire(import.meta.url)('../package.json').version)
  }
  if (cmd !== 'encode') throw new Error(`unknown command "${cmd}" (try --help)`)

  const inputs: string[] = []
  for (let i = 1; i < args.length; i++) {
    if (VALUE_FLAGS.has(args[i])) i++
    else if (!args[i].startsWith('-')) inputs.push(args[i])
  }
  if (!inputs.length) throw new Error('no input given (try --help)')
  if (inputs.length > 1 && opt('--id')) throw new Error('--id only works with a single input')

  const out = resolve(opt('--out', './instant-video-out')!)
  const kind = opt('--storage', 'local')
  let storage: Storage
  if (kind === 'local') storage = fsStorage({ dir: out, baseUrl: opt('--base-url') })
  else if (kind === 'blob') storage = blobStorage({ prefix: opt('--prefix') })
  else if (kind === 's3') {
    const bucket = opt('--bucket', process.env.INSTANT_VIDEO_S3_BUCKET)
    if (!bucket) throw new Error('--bucket is required for s3 storage')
    storage = s3Storage({ bucket, region: opt('--region'), endpoint: opt('--endpoint'), prefix: opt('--prefix'), publicUrl: opt('--public-url') })
  } else throw new Error(`unknown storage "${kind}" (local, blob, s3)`)

  await mkdir(out, { recursive: true })
  const tmp = await mkdtemp(join(tmpdir(), 'instant-video-src-'))
  try {
    for (const input of inputs) {
      const id = opt('--id') ?? (/^https?:/.test(input) ? new URL(input).pathname.split('/').filter(Boolean).pop() ?? 'clip' : basename(input, extname(input))).replace(/[^\w.-]+/g, '-')
      let file = input
      if (/^https?:/.test(input)) {
        const dir = join(tmp, id)
        await mkdir(dir, { recursive: true })
        try {
          await exec('yt-dlp', ['-q', '--no-warnings', '--no-playlist', '-f', 'bv*[height<=480][ext=mp4]/bv*[height<=480]/b[height<=480]/bv*/b', '-o', join(dir, 'src.%(ext)s'), input])
        } catch (e) {
          const msg = String((e as { stderr?: string }).stderr ?? (e as Error).message).split('\n').filter(Boolean).pop()
          throw new Error(`could not download ${input}: ${msg}`)
        }
        file = join(dir, (await readdir(dir)).find((f) => f.startsWith('src.'))!)
      } else if (!existsSync(file)) throw new Error(`not found: ${input}`)

      const { iv, clip } = await encodeToStorage(file, id, storage, {
        start: Number(opt('--start', '0')),
        duration: Number(opt('--duration', '7')),
        head: Number(opt('--head', '0.9')),
        skipBlack: !flag('--no-skip-black'),
      })
      const manifest = join(out, `${id}.json`)
      await writeFile(manifest, JSON.stringify(iv, null, 2) + '\n')
      const m = clip.sizes.r.m
      console.log(`ok  ${id}  ${iv.w}x${iv.h}  head ${(m.avc.head / 1024).toFixed(1)} KB (h264) / ${(m.av1.head / 1024).toFixed(1)} KB (av1)  ->  ${manifest}`)
    }
  } finally {
    await rm(tmp, { recursive: true, force: true })
  }
}

main().catch((e) => {
  console.error(`instant-video: ${e instanceof Error ? e.message : e}`)
  process.exit(1)
})
