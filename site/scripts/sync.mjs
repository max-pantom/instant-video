// Refresh the vendored engine (../dist) and demo clips (../demo/assets). Run `npm run build` in the repo root first.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const out = join(here, '..', 'vendor', 'instant-video')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })
for (const f of readdirSync(join(root, 'dist'))) {
  if (/^(index|chunk-.*)\.js$/.test(f) || /^(index|element-.*)\.d\.ts$/.test(f)) cpSync(join(root, 'dist', f), join(out, f))
}
rmSync(join(here, '..', 'public', 'assets'), { recursive: true, force: true })
cpSync(join(root, 'demo', 'assets'), join(here, '..', 'public', 'assets'), { recursive: true })
console.log('synced engine + assets')
