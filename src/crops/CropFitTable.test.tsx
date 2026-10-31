import { describe, expect, it } from 'bun:test'
import { CROP_ROWS } from '../data/catalog/rows'
import { expandRow } from '../data/catalog/schema'
import { cropLightTable } from '../data/crop-light-table'
import { siteFixture } from '../recommend/testkit'
import { cropsForConditions, type SiteFit } from '../state/site-fit'
import { fraction } from '../types/units'
import { type Harness, mount } from '../ui/testkit'
import { CropFitTable } from './CropFitTable'
import { fitRows, type VerdictFilter } from './fit-rows'

/**
 * The first eight rows of the catalog are the fruiting crops, every one with a 20 percent shade
 * ceiling, so open ground suits all eight and 60 percent shade suits none
 */
const ROWS = CROP_ROWS.slice(0, 8)
const catalog = ROWS.map(expandRow)
const lightRows = new Map(cropLightTable(ROWS).rows.map((row) => [row.id, row]))

const fitAt = (shade: number): SiteFit =>
  cropsForConditions({
    site: siteFixture(),
    catalog,
    shade: fraction(shade),
    soil: { kind: 'own', phUnits: 6.5 },
    irrigation: 'drip',
  })

const table = (fit: SiteFit, verdict: VerdictFilter = 'all', query = ''): Promise<Harness> =>
  mount(
    <CropFitTable
      rows={fitRows(fit, catalog, lightRows)}
      placeLabel="Test site"
      query={query}
      verdict={verdict}
    />,
  )

const rows = (harness: Harness): readonly HTMLElement[] => [
  ...harness.container.querySelectorAll<HTMLElement>('tbody tr'),
]

const ids = (harness: Harness): readonly string[] =>
  rows(harness).map((row) => row.getAttribute('data-crop') ?? '')

const cells = (harness: Harness, selector: string): readonly string[] =>
  rows(harness).map((row) => row.querySelector(selector)?.textContent ?? '')

describe('the crop finder table', () => {
  it("has a row per crop, in the plan's order", async () => {
    const fit = fitAt(0)
    const harness = await table(fit)
    expect(ids(harness)).toHaveLength(8)
    expect(ids(harness)).toEqual(fit.ranked.map((plan) => plan.recommendation.cropId as string))
    for (const plan of fit.ranked) {
      expect(harness.find(`row-crops-${plan.recommendation.cropId}`)).not.toBeNull()
    }
  })

  it("says each verdict and its reason in the planner's words", async () => {
    const open = await table(fitAt(0))
    expect(new Set(cells(open, '.crops-verdict'))).toEqual(new Set(['Recommended']))
    expect(new Set(cells(open, 'td:nth-of-type(2)'))).toEqual(new Set(['Fits']))
    await open.unmount()

    const shaded = await table(fitAt(0.6))
    expect(new Set(cells(shaded, '.crops-verdict'))).toEqual(new Set(['Not suited']))
    for (const why of cells(shaded, 'td:nth-of-type(2)')) {
      expect(why).toMatch(/^(Not enough light in [A-Z][a-z]{2}|More shade here than it can take)$/)
    }
    // the typed shade beside the ceiling it was held to
    for (const shade of cells(shaded, 'td:nth-of-type(4)')) {
      expect(shade).toMatch(/^60%\sof 20%\sallowed$/)
    }
  })

  it('hides the rows the verdict filter leaves out', async () => {
    const fit = fitAt(0)
    const suited = await table(fit, 'recommended')
    expect(ids(suited)).toHaveLength(8)
    await suited.unmount()

    const unsuited = await table(fit, 'excluded')
    expect(ids(unsuited)).toEqual([])
    expect(unsuited.get('status-crops-empty').textContent).toContain('No crop matches')
    await unsuited.unmount()

    const named = await table(fit, 'all', 'PEPPER')
    expect([...ids(named)].sort()).toEqual(['pepper-hot', 'pepper-sweet'])
  })

  it('sorts by a column on a press and reverses on the second', async () => {
    const harness = await table(fitAt(0))
    const header = (): HTMLElement =>
      harness.get('action-crops-sort-crop').closest('th') as HTMLElement
    const names = (): readonly string[] =>
      rows(harness).map((row) => row.querySelector('th')?.firstChild?.textContent ?? '')
    const planFirst = ids(harness)[0]
    expect(header().hasAttribute('aria-sort')).toBe(false)

    await harness.click('action-crops-sort-crop')
    const ascending = [...names()].sort((a, b) => a.localeCompare(b, 'en'))
    expect(names()).toEqual(ascending)
    expect(header().getAttribute('aria-sort')).toBe('ascending')

    await harness.click('action-crops-sort-crop')
    expect(names()).toEqual([...ascending].reverse())
    expect(header().getAttribute('aria-sort')).toBe('descending')
    expect(ids(harness)[0]).not.toBe(planFirst)
  })
})
