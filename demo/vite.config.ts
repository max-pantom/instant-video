import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))
const assetsDir = join(root, 'assets')
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const types: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4s': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.css': 'text/css',
}

function send(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  const file = normalize(join(assetsDir, pathname))
  if (!file.startsWith(assetsDir) || !existsSync(file) || !statSync(file).isFile()) return next()
  const size = statSync(file).size
  const head = {
    'content-type': types[extname(file)] ?? 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'no-cache',
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
  if (match) {
    const start = match[1] ? Number(match[1]) : size - Number(match[2])
    const end = match[1] && match[2] ? Number(match[2]) : size - 1
    res.writeHead(206, { ...head, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
  } else {
    res.writeHead(200, { ...head, 'content-length': size })
    createReadStream(file).pipe(res)
  }
}

function demoAssets(): Plugin {
  return {
    name: 'demo-assets',
    configureServer(server) {
      server.middlewares.use('/assets', send)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/assets', send)
    },
    closeBundle() {
      cpSync(assetsDir, join(root, 'dist', 'assets'), { recursive: true })
    },
  }
}

export default defineConfig({
  root,
  publicDir: 'public',
  plugins: [demoAssets()],
  server: { port: 4321, strictPort: true, fs: { allow: [repoRoot] } },
  preview: { port: 4321, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
})
