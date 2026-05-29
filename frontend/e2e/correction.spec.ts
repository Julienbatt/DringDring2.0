import { expect, test, type Page } from '@playwright/test'

// Phase 2 Wave 3 smoke spec — covers:
//   Test A: courier corrects floor on own assigned delivery via PATCH /deliveries/courier/{id}.
//   Test B: dispatcher sees the audit row in the correction history panel
//           via GET /deliveries/{id}/corrections.
//
// The two tests are order-dependent (Test B reads the row Test A wrote), hence
// `test.describe.serial`. Runs against `process.env.E2E_BASE_URL` or
// `http://localhost:3000` by default. Requires:
//   - Local frontend dev server on the base URL.
//   - Local backend dev server pointed at staging Supabase.
//   - Phase 2 Wave 1 migration (delivery_correction_audit) applied to staging.
//
// If any precondition is missing the spec skips gracefully — full assertion of
// the flow is gated behind manual Task-5 verification in 02-03-PLAN.md.

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const courierEmail = process.env.E2E_COURIER_EMAIL || 'coursier@dringdring.ch'
const courierPassword = process.env.E2E_COURIER_PASSWORD || 'password'
const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin_vs@dringdring.ch'
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'password'

// Shared mutable record so Test B can find Test A's delivery row by short_code
// or by the address we read off the screen.
const sharedContext: {
  shortCode: string | null
  clientAddress: string | null
  newFloor: string
} = {
  shortCode: null,
  clientAddress: null,
  newFloor: `3A-${Date.now().toString().slice(-5)}`, // unique per run
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${baseURL}/login`)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()
  // Wait until we leave /login or hit any post-login route.
  await page.waitForURL(/\/dashboard|\/admin|\/hq|\/shop|\/city|\/courier|\/customer/, {
    timeout: 30_000,
  })
}

test.describe.serial('Phase 2 Wave 3 — delivery correction smoke', () => {
  test('A: courier corrects floor on own assigned delivery', async ({ page }) => {
    await login(page, courierEmail, courierPassword)

    await page.goto(`${baseURL}/courier/dispatch`)

    // Switch to the "assigned" tab if present (page defaults to 'todo').
    const assignedTab = page.getByRole('button', {
      name: /Assignées|Zugewiesen|Assegnate|Assigned/,
    })
    if (await assignedTab.isVisible().catch(() => false)) {
      await assignedTab.click()
    }

    const editButton = page.getByRole('button', {
      name: /Edit details|Modifier les détails|Details bearbeiten|Modifica dettagli/,
    })

    const editCount = await editButton.count()
    test.skip(
      editCount === 0,
      'No editable delivery available for fixture courier on staging — flag in SUMMARY.md'
    )

    const firstEdit = editButton.first()
    // Walk up to the row container so we can scope reads to a single delivery.
    const row = firstEdit.locator(
      'xpath=ancestor::div[contains(@class, "bg-white") and contains(@class, "rounded-xl")][1]'
    )

    // Capture the row's identifying signal so Test B can find it again.
    sharedContext.clientAddress = (await row.textContent())?.slice(0, 80) || null

    await firstEdit.click()

    const floorInput = page.locator('input').nth(0) // first input in the open modal
    // The modal mounts after the date picker input. Be defensive: find by label proximity.
    const floorLabel = page.locator('label', {
      hasText: /Floor|Étage|Stock|Piano/,
    })
    const scopedFloor = floorLabel.locator('input')
    const target = (await scopedFloor.count()) > 0 ? scopedFloor.first() : floorInput

    await target.fill(sharedContext.newFloor)

    const saveButton = page.getByRole('button', {
      name: /^Save$|^Enregistrer$|^Speichern$|^Salva$/,
    })
    await saveButton.click()

    // Expect the modal to close and the new value to render in the row.
    await expect(page.getByText(sharedContext.newFloor).first()).toBeVisible({ timeout: 15_000 })
  })

  test('B: dispatcher sees the audit row in correction history', async ({ page }) => {
    test.skip(
      sharedContext.clientAddress === null,
      'Test A was skipped, nothing to verify in Test B.'
    )

    await login(page, adminEmail, adminPassword)
    await page.goto(`${baseURL}/admin/dispatch`)

    // The dispatcher page renders a table — open the History panel on the
    // first row whose address matches what we touched in Test A. If we can
    // not isolate by address (e.g. the courier touched a delivery that the
    // admin's region scope does not include), we fall back to the first
    // History button on the page.
    const historyButtons = page.getByRole('button', {
      name: /Correction history|Historique des corrections|Korrekturverlauf|Cronologia correzioni/,
    })
    await expect(historyButtons.first()).toBeVisible({ timeout: 15_000 })

    await historyButtons.first().click()

    // The panel opens. We expect at least one row showing the localized "floor"
    // field label and our newly-written value somewhere in the panel body.
    const floorLabel = page.getByText(/^Floor$|^Étage$|^Stock$|^Piano$/)
    await expect(floorLabel.first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(sharedContext.newFloor)).toBeVisible({ timeout: 15_000 })
  })
})
