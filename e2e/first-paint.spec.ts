import { expect, test } from '@playwright/test'
import { BAKE_TIMEOUT_MS, openApp, step } from './fixtures/app.ts'

/**
 * The state a newcomer meets before touching anything, which is where this was reported from.
 *
 * The app opens on a garden: the shipped example when one loads, the default plot when it does not,
 * and either way the toolbar names a town and the scene draws beds under an array. It also has to
 * look that town up. `PersistedDesign` carries `location` without `site`, so every route into the
 * editor that skips the questions restores everything DERIVED from a site while leaving the site
 * itself unresolved. Without that lookup, the sidebar would say "No site resolved yet" over a
 * garden the app has plainly already computed, with panels refusing to work and none of them
 * offering a way to fix it.
 *
 * So this asks the one question that catches every route at once: does the app, left completely
 * alone, end up agreeing with itself about the place it is showing
 */
test('the app looks up the place it is already naming, without being asked', async ({ page }) => {
  test.setTimeout(180_000)
  await openApp(page)

  // nothing is clicked between boot and here: no location typed, no question answered
  const label = await page.getByTestId('readout-toolbar-site').innerText()
  expect(label.length, 'the toolbar names no place at all').toBeGreaterThan(0)

  await step(page, 'place')
  // `AsyncNotice` renders nothing at all once a slice is ready, so the notice going away IS the
  // resolution; the hardiness readout is the positive half, and only a resolved site has one
  await expect(page.getByTestId('status-site')).toHaveCount(0, { timeout: 60_000 })
  // behind the panel's "More about this place" fold, so attached with a value rather than visible
  await expect(page.getByTestId('readout-site-hardiness')).not.toBeEmpty({ timeout: 60_000 })
})

/**
 * The same promise from the other side. A visitor who answers nothing and goes straight to the
 * plants step is the fastest way to the part of the editor that needs the most, so it is the
 * route most likely to arrive somewhere the app cannot serve
 */
test('going straight to the plants step lands on a garden the app can work with', async ({
  page,
}) => {
  test.setTimeout(240_000)
  await openApp(page)
  await step(page, 'plants')
  /*
   * A visitor this quick has a site and beds and, for a moment, no light. The step may still be
   * locked on that one requirement when it is opened, and pretending otherwise would be a lie. What
   * must not happen is one sentence naming all three prerequisites at once and no way to settle any
   * of them. It has to name the one thing owed and offer the press. And since the light comes by
   * itself once the place has resolved, the lock has to lift without that press ever being needed
   */
  // read in one go, because the lock can lift between two reads: the bake is short on a real GPU
  const lock = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="status-step-blocked-plants"]')
    return el === null
      ? null
      : {
          text: el.textContent ?? '',
          press: el.querySelector('[data-testid="status-step-blocked-plants-run"]') !== null,
        }
  })
  if (lock !== null) {
    expect(lock.text).toMatch(/light|looked up/i)
    expect(lock.press, 'the lock offers no press').toBe(true)
  }
  await expect(page.getByTestId('status-step-blocked-plants')).toHaveCount(0, {
    timeout: BAKE_TIMEOUT_MS,
  })
  await expect(page.getByTestId('readout-plants-status')).toBeVisible()
})
