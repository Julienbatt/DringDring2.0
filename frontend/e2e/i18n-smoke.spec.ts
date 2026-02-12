import { expect, test } from '@playwright/test'

const locales = ['fr', 'de', 'it', 'en'] as const

for (const locale of locales) {
  test(`hydrates with locale ${locale}`, async ({ page }) => {
    await page.addInitScript(([key, value]) => {
      window.localStorage.setItem(key, value)
    }, ['dringdring.locale', locale])

    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('lang', locale)
  })
}
