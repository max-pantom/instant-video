import { expect, test } from '@playwright/test'

test('hover preview expands continuously and supports quality and keyboard controls', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('#hero-grid .card').first()
  const player = card.locator('instant-video')

  await card.hover()
  await expect.poll(() => player.evaluate((el) => el.shadowRoot?.querySelector('video')?.currentTime ?? 0)).toBeGreaterThan(0.05)
  const before = await player.evaluate((el) => el.shadowRoot!.querySelector('video')!.currentTime)

  await card.click({ position: { x: 120, y: 90 } })
  await expect(player).toHaveAttribute('mode', 'player')
  await page.waitForTimeout(250)
  const after = await player.evaluate((el) => el.shadowRoot!.querySelector('video.on')!.currentTime)
  expect(after).toBeGreaterThan(before)

  await player.evaluate((el) => {
    ;(window as Window & { __quality?: number }).__quality = 0
    el.addEventListener('qualitychange', (event) => {
      ;(window as Window & { __quality?: number }).__quality = (event as CustomEvent<{ quality: number }>).detail.quality
    }, { once: true })
  })
  await player.locator('select[data-role=quality]').selectOption('1080')
  await expect.poll(() => page.evaluate(() => (window as Window & { __quality?: number }).__quality)).toBe(1080)

  await player.focus()
  await page.keyboard.press('Space')
  const pausedAt = await player.evaluate((el) => el.shadowRoot!.querySelector('video.on')!.currentTime)
  await page.waitForTimeout(150)
  const stillAt = await player.evaluate((el) => el.shadowRoot!.querySelector('video.on')!.currentTime)
  expect(Math.abs(stillAt - pausedAt)).toBeLessThan(0.05)

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => player.evaluate((el) => el.shadowRoot!.querySelector('video.on')!.currentTime)).toBeGreaterThan(stillAt + 4)
  await page.keyboard.press('KeyM')
  await expect.poll(() => player.evaluate((el) => el.shadowRoot!.querySelector('video.on')!.muted)).toBe(false)
})
