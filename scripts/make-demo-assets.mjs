// Regenerates demo/assets from synthetic ffmpeg test patterns (no third-party footage), using the built CLI.
//   npm run build && node scripts/make-demo-assets.mjs
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const sources = {
  bars: 'smptehdbars=size=640x360:rate=25',
  rgb: 'rgbtestsrc=size=640x360:rate=25',
  test: 'testsrc2=size=640x360:rate=25',
  gradients: 'gradients=size=640x360:rate=25:speed=0.02',
}
const tmp = 'demo/.src'
rmSync('demo/assets', { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const ids = []
for (const [id, lavfi] of Object.entries(sources)) {
  const file = join(tmp, `${id}.mp4`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', lavfi, '-t', '7', '-pix_fmt', 'yuv420p', file])
  execFileSync('node', ['dist/cli.js', 'encode', file, '--id', id, '--out', 'demo/assets', '--base-url', 'assets/', '--no-skip-black'], { stdio: 'inherit' })
  ids.push(id)
}
rmSync(tmp, { recursive: true, force: true })
writeFileSync('demo/assets/index.json', JSON.stringify(ids) + '\n')
