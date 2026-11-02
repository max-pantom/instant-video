import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Where encoded files go. `put` stores the bytes under `key` (e.g. `ad-1/m-avc-3f9a.head.mp4`) and returns the
 * public URL the player will fetch. Keys are content-addressed, so every file is safe to cache forever.
 */
export interface Storage {
  put(key: string, data: Buffer, contentType: string): Promise<string>
}

const CACHE = 'public, max-age=31536000, immutable'
const join_ = (base: string, key: string) => (base ? `${base.replace(/\/+$/, '')}/${key}` : key)

export interface FsOptions {
  /** Folder the files are written to. */
  dir: string
  /** Prefix for the URLs written into the manifest, e.g. `/media` or `https://cdn.example.com/iv`. Default: relative URLs. */
  baseUrl?: string
}

/** Local folder (the default). Serve the folder as static files and point `baseUrl` at it. */
export function fsStorage({ dir, baseUrl = '' }: FsOptions): Storage {
  return {
    async put(key, data) {
      const file = join(dir, key)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, data)
      return join_(baseUrl, key)
    },
  }
}

export interface BlobOptions {
  /** Defaults to BLOB_READ_WRITE_TOKEN. */
  token?: string
  /** Path prefix inside the store. Default `instant/`. */
  prefix?: string
}

// optional peer dependencies are resolved at call time so importing this module never requires them
const load = async (name: string): Promise<any> => {
  try {
    return await import(/* @vite-ignore */ name)
  } catch {
    throw new Error(`The "${name}" package is required for this storage adapter. Install it: npm i ${name}`)
  }
}

/** Vercel Blob (public store). Needs `@vercel/blob`. */
export function blobStorage({ token, prefix = 'instant/' }: BlobOptions = {}): Storage {
  return {
    async put(key, data, contentType) {
      const { put } = await load('@vercel/blob')
      const r = await put(prefix + key, data, {
        access: 'public',
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 31536000,
        ...(token ? { token } : {}),
      })
      return r.url as string
    },
  }
}

export interface S3Options {
  bucket: string
  region?: string
  /** Custom endpoint for S3-compatible stores (R2, MinIO, Backblaze…). */
  endpoint?: string
  /** Path prefix inside the bucket. Default `instant/`. */
  prefix?: string
  /** Public base URL (CDN or bucket website). Default: the bucket's standard HTTPS URL. */
  publicUrl?: string
  /** Pass an existing S3Client instead of letting the adapter create one from the environment. */
  client?: { send(command: unknown): Promise<unknown> }
}

/** Amazon S3 or any S3-compatible store. Needs `@aws-sdk/client-s3`; credentials come from the usual AWS environment. */
export function s3Storage({ bucket, region, endpoint, prefix = 'instant/', publicUrl, client }: S3Options): Storage {
  let c = client
  return {
    async put(key, data, contentType) {
      const sdk = await load('@aws-sdk/client-s3')
      c ??= new sdk.S3Client({ ...(region ? { region } : {}), ...(endpoint ? { endpoint, forcePathStyle: true } : {}) })
      await c!.send(new sdk.PutObjectCommand({ Bucket: bucket, Key: prefix + key, Body: data, ContentType: contentType, CacheControl: CACHE }))
      if (publicUrl) return join_(publicUrl, prefix + key)
      if (endpoint) return join_(`${endpoint.replace(/\/+$/, '')}/${bucket}`, prefix + key)
      return `https://${bucket}.s3.${region ?? 'us-east-1'}.amazonaws.com/${prefix + key}`
    },
  }
}

export { CACHE as cacheControl }
