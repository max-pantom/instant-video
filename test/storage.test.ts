import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blobStorage, fsStorage, s3Storage } from '../src/node/storage'

let dir: string
beforeEach(async () => void (dir = await mkdtemp(join(tmpdir(), 'iv-test-'))))
afterEach(async () => rm(dir, { recursive: true, force: true }))

describe('fsStorage', () => {
  it('writes under the key and returns a relative URL by default', async () => {
    const url = await fsStorage({ dir }).put('ad-1/m-avc-abc.head.mp4', Buffer.from('hello'), 'video/mp4')
    expect(url).toBe('ad-1/m-avc-abc.head.mp4')
    expect((await readFile(join(dir, 'ad-1/m-avc-abc.head.mp4'))).toString()).toBe('hello')
  })

  it('prefixes the URL with baseUrl', async () => {
    const s = fsStorage({ dir, baseUrl: 'https://cdn.example.com/iv/' })
    expect(await s.put('a/b.jpg', Buffer.from('x'), 'image/jpeg')).toBe('https://cdn.example.com/iv/a/b.jpg')
  })
})

describe('optional storage adapters', () => {
  it('s3Storage uses the injected client and builds the public URL', async () => {
    const sent: any[] = []
    const s = s3Storage({ bucket: 'b', region: 'eu-west-1', client: { send: async (c: any) => void sent.push(c) } }).put
    // the SDK is an optional peer; without it the adapter explains what to install
    await expect(s('k', Buffer.from('x'), 'video/mp4')).rejects.toThrow(/@aws-sdk\/client-s3/)
  })

  it('blobStorage explains the missing peer dependency', async () => {
    await expect(blobStorage().put('k', Buffer.from('x'), 'video/mp4')).rejects.toThrow(/@vercel\/blob/)
  })
})
