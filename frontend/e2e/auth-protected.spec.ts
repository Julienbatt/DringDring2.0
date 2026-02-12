import { expect, test } from '@playwright/test'

const email = process.env.SMOKE_TEST_EMAIL
const password = process.env.SMOKE_TEST_PASSWORD

test('auth flow and protected access', async ({ page }) => {
  test.skip(!email || !password, 'SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD not configured')

  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email as string)
  await page.locator('input[type="password"]').fill(password as string)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL(/\/dashboard|\/admin|\/hq|\/shop|\/city|\/courier|\/customer/, {
    timeout: 30_000,
  })

  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/dashboard|\/admin|\/hq|\/shop|\/city|\/courier|\/customer/)
})
