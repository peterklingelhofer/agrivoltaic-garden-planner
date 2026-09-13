import { expect, test, type Page } from '@playwright/test'
import { AUTORUN_TIMEOUT_MS, BAKE_TIMEOUT_MS, rankedBed, step } from './fixtures/app.ts'
import { openPlantPicker } from './fixtures/qa.ts'

/**
 * The agenda is the calendar read down the year instead of across one crop, so everything
 * asserted here is a relationship: that a job is dated, that the date names the rule that
 * produced it, that moving the risk dial moves the dates, and that the list of things to
 * buy follows the plants that are actually in the beds. No absolute figure is asserted
 */

interface AgendaRow {
  readonly id: string
  readonly crop: string
  readonly action: string
  readonly day: string
  readonly basis: string
}

const agendaRows = async (page: Page): Promise<readonly AgendaRow[]> => {
  await step(page, 'calendar')
  return page.locator('[data-testid^="item-agenda-"][data-action]').evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute('data-testid') ?? '',
      crop: node.getAttribute('data-crop') ?? '',
      action: node.getAttribute('data-action') ?? '',
      day: node.getAttribute('data-day') ?? '',
      basis:
        node.querySelector('[data-testid^="readout-agenda-basis-"]')?.getAttribute('data-basis') ??
        '',
    })),
  )
}

const dayById = (rows: readonly AgendaRow[]): ReadonlyMap<string, string> =>
  new Map(rows.map((row) => [row.id, row.day]))

/** Puts the nth ranked crop in the selected bed through the control a grower uses */
const addPlanting = async (page: Page, index: number): Promise<string> => {
  const picker = await openPlantPicker(page)
  const option = picker.getByRole('option').nth(index)
  const cropId = (await option.getAttribute('data-crop')) ?? ''
  expect(cropId).not.toBe('')
  await option.click()
  const add = page.getByTestId('action-bed-add-planting')
  await expect(add).toBeEnabled()
  await add.click()
  return cropId
}

const settled = async (page: Page): Promise<void> => {
  await step(page, 'plants')
  await expect(page.getByTestId('status-autorun')).toHaveAttribute('data-state', 'ready', {
    timeout: AUTORUN_TIMEOUT_MS,
  })
}

const plantedGarden = async (page: Page, count = 3): Promise<readonly string[]> => {
  const crops: string[] = []
  for (let index = 0; index < count; index += 1) crops.push(await addPlanting(page, index))
  await settled(page)
  return crops
}

test('the agenda asks for a planted bed before it dates anything', async ({ page }) => {
  const app = await rankedBed(page)
  await step(page, 'calendar')
  await expect(page.getByTestId('panel-agenda')).toBeVisible()
  await expect(page.getByTestId('status-agenda-empty')).toContainText('Put plants in a bed')
  expect(await agendaRows(page)).toEqual([])
  expect(app.errors).toEqual([])
})

test('a planted design produces grouped, dated jobs that each name their rule', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  const app = await rankedBed(page)
  const crops = await plantedGarden(page)
  await step(page, 'calendar')

  const groups = page.locator('[data-testid^="item-agenda-group-"]')
  await expect(groups.first()).toBeVisible()
  expect(await groups.count()).toBeGreaterThan(0)

  const rows = await agendaRows(page)
  expect(rows.length).toBeGreaterThan(crops.length)
  for (const row of rows) {
    // a job with no date, no rule or no crop is the thing this panel exists to prevent
    expect(Number(row.day)).toBeGreaterThan(0)
    expect(Number(row.day)).toBeLessThanOrEqual(365)
    expect(row.basis).not.toBe('')
    expect(row.crop).not.toBe('')
  }
  // only the crops in the bed, and every one of them
  expect([...new Set(rows.map((row) => row.crop))].sort()).toEqual([...crops].sort())
  // harvests as well as sowings: the year is the whole job, not just the start of it
  const actions = new Set(rows.map((row) => row.action))
  expect(actions.has('first-harvest')).toBe(true)
  expect(
    [...actions].some((action) => action.includes('sow') || action.includes('transplant')),
  ).toBe(true)

  // the caveats the calendar computed reach the reader rather than being dropped in translation
  await expect(page.getByTestId('readout-agenda-note-0')).toContainText('daily normals')
  await expect(page.getByTestId('readout-agenda-model-note')).toContainText(
    'These dates are modelled',
  )
  await expect(page.getByTestId('readout-agenda-reference')).toContainText('Dated from')
  expect(app.errors).toEqual([])
})

test('moving the frost risk dial moves the dates in the agenda', async ({ page }) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  const app = await rankedBed(page)
  await plantedGarden(page)

  await step(page, 'calendar')
  const dial = page.getByTestId('control-calendar-frost-percentile')
  await dial.selectOption('50')
  await settled(page)
  await step(page, 'calendar')
  await expect(page.getByTestId('readout-agenda-percentile')).toContainText('50%')
  const before = dayById(await agendaRows(page))
  expect(before.size).toBeGreaterThan(0)

  await step(page, 'calendar')
  await dial.selectOption('10')
  await settled(page)
  await step(page, 'calendar')
  await expect(page.getByTestId('readout-agenda-percentile')).toContainText('10%')
  const after = dayById(await agendaRows(page))

  const shared = [...before.keys()].filter((id) => after.has(id))
  expect(shared.length).toBeGreaterThan(0)
  const moved = shared.filter((id) => before.get(id) !== after.get(id))
  expect(moved.length, 'no dated job moved when the accepted frost risk changed').toBeGreaterThan(0)
  expect(app.errors).toEqual([])
})

test('the shopping list follows the plants in the beds and carries quantities', async ({
  page,
}) => {
  test.setTimeout(BAKE_TIMEOUT_MS + 240_000)
  const app = await rankedBed(page)
  const crops = await plantedGarden(page)
  await step(page, 'calendar')

  await expect(page.getByTestId('list-agenda-shopping')).toBeVisible()
  const lines = await page
    .locator('[data-testid^="item-agenda-supply-"][data-quantity]')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        crop: node.getAttribute('data-crop') ?? '',
        kind: node.getAttribute('data-kind') ?? '',
        quantity: Number(node.getAttribute('data-quantity')),
      })),
    )
  expect(lines.map((line) => line.crop).sort()).toEqual([...crops].sort())
  for (const line of lines) {
    expect(line.quantity).toBeGreaterThan(0)
    expect(['seed', 'transplant', 'perennial-stock']).toContain(line.kind)
    await expect(page.getByTestId(`readout-agenda-quantity-${line.crop}`)).toContainText(
      String(line.quantity),
    )
  }
  // grouped the way a supplier is asked, one heading per kind present
  const kinds = await page
    .locator('[data-testid^="item-agenda-supply-group-"]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-kind') ?? ''))
  expect(kinds.length).toBeGreaterThan(0)
  expect(new Set(kinds).size).toBe(kinds.length)
  expect([...kinds].sort()).toEqual([...new Set(lines.map((line) => line.kind))].sort())
  expect(app.errors).toEqual([])
})
