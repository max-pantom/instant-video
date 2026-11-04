// Regenerates demo/assets from synthetic ffmpeg test patterns (no third-party footage), using the built CLI.
//   npm run build && node --experimental-strip-types scripts/make-demo-assets.ts
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const sources: Record<string, string> = {
  bars: 'smptehdbars=size=640x360:rate=25',
  rgb: 'rgbtestsrc=size=640x360:rate=25',
  test: 'testsrc2=size=640x360:rate=25',
  gradients: 'gradients=size=640x360:rate=25:speed=0.02',
}
const tmp = 'demo/.src'
rmSync('demo/assets', { recursive: true, force: true })
mkdirSync(tmp, { recursive: true })
const ids: string[] = []
const files: string[] = []
for (const [id, lavfi] of Object.entries(sources)) {
  const file = join(tmp, `${id}.mp4`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', lavfi, '-t', '7', '-pix_fmt', 'yuv420p', file])
  ids.push(id)
  files.push(file)
}
execFileSync('node', ['dist/cli.js', 'encode', ...files, '--out', 'demo/assets', '--base-url', 'assets/', '--no-skip-black', '--poster-sprite'], { stdio: 'inherit' })
execFileSync('node', ['dist/cli.js', 'encode', join(tmp, 'gradients.mp4'), '--id', 'gradients', '--out', 'demo/assets', '--base-url', 'assets/', '--no-skip-black', '--full', '720,1080'], { stdio: 'inherit' })
rmSync(tmp, { recursive: true, force: true })
writeFileSync('demo/assets/index.json', JSON.stringify(ids) + '\n')
