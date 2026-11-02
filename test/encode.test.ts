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
  it('encodes a synthetic clip into head/tail/full + posters and a valid manifest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'iv-enc-'))
    try {
      const src = join(dir, 'src.mp4')
      const g = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25', '-t', '3', '-pix_fmt', 'yuv420p', '-y', src])
      expect(g.status).toBe(0)

      const out = join(dir, 'out')
      const { iv, clip } = await encodeToStorage(src, 'demo', fsStorage({ dir: out, baseUrl: '/m' }), { duration: 3 })

      expect(iv.v).toBe(1)
      expect(iv.dur).toBe(3)
      expect([iv.w, iv.h]).toEqual([640, 360])
      for (const rk of ['m', 's'] as const) for (const ck of ['avc', 'av1'] as const) {
        const r = iv.r[rk]![ck]!
        expect(r.head).toMatch(/^\/m\/demo\/.*\.head\.mp4$/)
        expect(r.tail).toMatch(/\.tail\.m4s$/)
        expect(r.codec).toMatch(ck === 'avc' ? /^avc1\./ : /^av01\./)
        expect(r.headDur).toBeGreaterThanOrEqual(0.9)
      }
      expect(iv.r.m!.avc!.full).toBeTruthy()
      expect(Object.keys(iv.poster!).sort()).toEqual(['avif', 'jpg', 'webp'])

      // the head starts with an init segment and is small; the poster exists on disk
      const head = await readFile(join(out, iv.r.m!.avc!.head.replace('/m/', '')))
      expect(head.subarray(4, 8).toString()).toBe('ftyp')
      expect(head.length).toBe(clip.sizes.r.m.avc.head)
      expect((await readFile(join(out, iv.poster!.jpg!.replace('/m/', '')))).length).toBeGreaterThan(500)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
