import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { encodeToStorage } from '../src/node/encode'
import { fsStorage } from '../src/node/storage'

// needs ffmpeg with libx264 and libsvtav1; skipped elsewhere
const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? ''
const ok = enc.includes('libx264') && enc.includes('libsvtav1')

describe.runIf(ok)('encode (needs ffmpeg)', () => {
  it('encodes a synthetic clip into ranged fMP4/full + posters and a valid manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iv-enc-'))
    try {
      const src = join(dir, 'src.mp4')
      const g = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '3', '-pix_fmt', 'yuv420p', '-y', src])
      expect(g.status).toBe(0)

      const out = join(dir, 'out')
      const { iv, clip } = await encodeToStorage(src, 'demo', fsStorage({ dir: out, baseUrl: '/m' }), { duration: 3, full: [720] })

      expect(iv.v).toBe(3)
      expect(iv.dur).toBe(3)
      expect([iv.w, iv.h]).toEqual([640, 360])
      for (const rk of ['m', 's'] as const) for (const ck of ['avc', 'av1'] as const) {
        const r = iv.r[rk]![ck]!
        expect(r.src).toMatch(/^\/m\/demo\/.*\.mp4$/)
        expect(r.head).toBeUndefined()
        expect(r.tail).toBeUndefined()
        expect(r.codec).toMatch(ck === 'avc' ? /^avc1\./ : /^av01\./)
        expect(r.headDur).toBeGreaterThanOrEqual(0.9)
      }
      expect(iv.r.m!.avc!.full).toBeTruthy()
      expect(iv.full!.r[720]!.avc!.src).toMatch(/full-720-avc-.*\.mp4$/)
      expect(iv.full!.r[720]!.avc!.fallback).toMatch(/\.progressive\.mp4$/)
      expect(iv.full!.r[720]!.av1!.codec).toMatch(/^av01\./)
      expect(iv.full!.sprite).toMatchObject({ width: 160, height: 90, count: 3, interval: 1 })
      expect(clip.sizes.full['720'].avc.bytes).toBeGreaterThan(0)
      expect(Object.keys(iv.poster!).sort()).toEqual(['avif', 'jpg', 'webp'])

      // the single fMP4 starts with the exact head byte range; the poster exists on disk
      const file = await readFile(join(out, iv.r.m!.avc!.src!.replace('/m/', '')))
      const head = file.subarray(0, iv.r.m!.avc!.headBytes)
      expect(head.subarray(4, 8).toString()).toBe('ftyp')
      expect(head.length).toBe(clip.sizes.r.m.avc.head)
      expect(file.length).toBe(clip.sizes.r.m.avc.head + clip.sizes.r.m.avc.tail)
      expect((await readFile(join(out, iv.poster!.jpg!.replace('/m/', '')))).length).toBeGreaterThan(500)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)

  it('keeps the legacy two-file output behind an option', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iv-legacy-'))
    try {
      const src = join(dir, 'src.mp4')
      expect(spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:size=320x240:rate=25', '-t', '1', '-pix_fmt', 'yuv420p', '-y', src]).status).toBe(0)
      const { iv } = await encodeToStorage(src, 'legacy', fsStorage({ dir: join(dir, 'out'), baseUrl: '/m' }), { duration: 1, twoFile: true })
      expect(iv.r.m!.avc!.src).toBeUndefined()
      expect(iv.r.m!.avc!.head).toMatch(/\.head\.mp4$/)
      expect(iv.r.m!.avc!.tail).toMatch(/\.tail\.m4s$/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
