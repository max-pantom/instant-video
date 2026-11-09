import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'demo', 'public')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()

const shot = async (file, width, height, dest, scale = 2) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.goto(`file://${join(here, file)}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(out, dest), type: 'png', omitBackground: false })
  await page.close()
}

await shot('og.html', 1200, 630, 'og.png', 2)
await shot('icon.html', 180, 180, 'apple-touch-icon.png', 2)
await browser.close()
console.log('wrote demo/public/og.png and demo/public/apple-touch-icon.png')
