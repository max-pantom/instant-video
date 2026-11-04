// Tiny static server for the demo (serves the repo root, with Range support for the progressive fallback).
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'

const root = resolve(new URL('..', import.meta.url).pathname)
const port = Number(process.env.PORT || 4321)
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
  '.map': 'application/json',
}

createServer((req, res) => {
  let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
  if (path.endsWith('/')) path += 'index.html'
  const file = normalize(join(root, path))
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end('not found')
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
}).listen(port, () => console.log(`instant-video demo: http://localhost:${port}/demo/`))
