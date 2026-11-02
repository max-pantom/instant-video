// Refresh the vendored engine (../dist) and demo clips (../demo/assets). Run `npm run build` in the repo root first.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const out = join(here, '..', 'vendor', 'instant-video')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
const entry = ['index.js', 'index.d.ts']
const refs = entry.flatMap((f) => [...readFileSync(join(root, 'dist', f), 'utf8').matchAll(/\.\/(chunk-[^'";]+\.js|element-[^'";]+\.d\.ts)/g)].map((m) => m[1]))
for (const f of new Set([...entry, ...refs])) {
  cpSync(join(root, 'dist', f), join(out, f))
  if (f.endsWith('.js') && existsSync(join(root, 'dist', `${f}.map`))) cpSync(join(root, 'dist', `${f}.map`), join(out, `${f}.map`))
}
rmSync(join(here, '..', 'public', 'assets'), { recursive: true, force: true })
cpSync(join(root, 'demo', 'assets'), join(here, '..', 'public', 'assets'), { recursive: true })
console.log('synced engine + assets')
