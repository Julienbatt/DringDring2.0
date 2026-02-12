import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PORT || 3000)
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    port,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'ci-test-anon-key',
      NEXT_PUBLIC_API_URL:
        process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8016/api/v1',
    },
  },
})
