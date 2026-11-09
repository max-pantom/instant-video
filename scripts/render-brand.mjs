import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', 'demo', 'public')
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()

const shot = async (file, dest, { width, height, scale = 2, clip } = {}) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.goto(`file://${join(here, file)}`, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((img) => (
      img.complete ? null : new Promise((resolve) => { img.onload = img.onerror = resolve })
    )))
  })
  if (clip === 'body') {
    await page.locator('body').screenshot({ path: join(out, dest), type: 'png', omitBackground: true })
  } else {
    await page.screenshot({ path: join(out, dest), type: 'png', omitBackground: false })
  }
  await page.close()
}

await shot('og.html', 'og.png', { width: 1200, height: 630, scale: 2 })
await shot('icon.html', 'apple-touch-icon.png', { width: 180, height: 180, scale: 2 })
await shot('wordmark.html', 'wordmark.png', { width: 400, height: 64, scale: 3, clip: 'body' })
await browser.close()
console.log('wrote demo/public/{og.png,apple-touch-icon.png,wordmark.png}')
