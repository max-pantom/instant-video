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
const refs = entry.flatMap((file) => {
  const text = readFileSync(join(root, 'dist', file), 'utf8')
  return [...text.matchAll(/\.\/(chunk-[^'";]+\.js|element-[^'";]+\.js)/g)].flatMap((match) => {
    const name = match[1]
    if (!name) return []
    return [name.startsWith('element-') ? name.replace(/\.js$/, '.d.ts') : name]
  })
})
for (const file of new Set([...entry, ...refs])) {
  cpSync(join(root, 'dist', file), join(out, file))
  if (file.endsWith('.js') && existsSync(join(root, 'dist', `${file}.map`))) cpSync(join(root, 'dist', `${file}.map`), join(out, `${file}.map`))
}
rmSync(join(here, '..', 'public', 'assets'), { recursive: true, force: true })
cpSync(join(root, 'demo', 'assets'), join(here, '..', 'public', 'assets'), { recursive: true })
console.log('synced engine + assets')
