import { beforeEach, describe, expect, it } from 'bun:test'
import { loadCropCatalog } from '../data/crops'
import { makeBed } from '../state/defaults'
import { polygonOf, rectangleRing, vec2 } from '../state/geom'
import { ready } from '../state/slices'
import { resetAppStore, useAppStore } from '../state/store'
import type { BedCalendar } from '../types/calendar'
import type { Crop } from '../types/crop'
import type { Bed } from '../types/garden'
import { bedId, cropId, plantingId } from '../types/ids'
import type { BedId } from '../types/ids'
import { meters, type DayOfYear, type SquareMeters } from '../types/units'
import { BedStrip } from './BedStrip'
import { cropName } from './format'
import { mount, type Harness } from './testkit'

/**
 * Moving a planting between beds DERIVES it in the destination rather than carrying it across.
 * The destination has its own light field and therefore its own calendar, so a crop that bed
 * cannot support has to come back refused, exactly as it would if the grower had picked it
 * there in the first place. A move that silently kept the old sow day would be the one place
 * in the app where a date was not computed from the bed it belongs to
 */

const A = bedId('bed-1')
const B = bedId('bed-2')
const LETTUCE = cropId('lettuce-leaf')

const bedAt = (id: BedId, index: number, label: string): Bed => ({
  ...makeBed(index),
  id,
  label,
  footprint: polygonOf(rectangleRing(vec2(index * 6, 0), 4, 3)),
  areaM2: 12 as SquareMeters,
  raisedHeightM: meters(0.3),
})

const calendarFixture = (id: BedId): BedCalendar => ({
  bedId: id,
  entries: [
    {
      cropId: LETTUCE,
      plantings: [
        {
          method: 'direct-sow',
          earliest: 100 as DayOfYear,
          recommended: 100 as DayOfYear,
          latest: 220 as DayOfYear,
          basis: { kind: 'catalog-window' },
          citations: [],
        },
      ],
      successions: [],
      harvest: {
        start: 160 as DayOfYear,
        end: 180 as DayOfYear,
        basis: { kind: 'days-to-maturity', backedOffDays: 60 as never },
      },
      feasibility: { kind: 'fits', slackDays: 40 as never },
      frostRiskPercentile: 20,
      notes: [],
    },
  ],
})

const setup = async (calendars: readonly BedCalendar[]): Promise<void> => {
  resetAppStore()
  const store = useAppStore.getState()
  store.upsertBed(bedAt(A, 1, 'Bed 1'))
  store.upsertBed(bedAt(B, 2, 'Bed 2'))
  useAppStore.setState({
    catalog: ready(await loadCropCatalog()),
    calendars: ready(calendars),
  })
  const derived = useAppStore.getState()
  const lettuce = (derived.catalog.status === 'ready' ? derived.catalog.value : []).find(
    (crop) => crop.id === LETTUCE,
  )
  if (lettuce === undefined) throw new Error('lettuce missing from the catalogue')
  store.addPlanting({
    id: plantingId('bed-1:lettuce-leaf:100'),
    bedId: A,
    cropId: LETTUCE,
    cultivarId: null,
    role: 'target-crop',
    tier: 'herb-ground',
    sowDay: 100 as DayOfYear,
    harvestStartDay: 160 as DayOfYear,
    harvestEndDay: 180 as DayOfYear,
    plantCount: 9,
  })
}

const plantingsIn = (id: BedId): number =>
  useAppStore.getState().plot?.beds.find((bed) => bed.id === id)?.plantings.length ?? -1

beforeEach(() => {
  localStorage.clear()
})

describe('moving a planting to another bed', () => {
  it('derives it in the destination and takes it out of the source', async () => {
    await setup([calendarFixture(A), calendarFixture(B)])
    const outcome = useAppStore.getState().movePlanting(plantingId('bed-1:lettuce-leaf:100'), A, B)
    expect(outcome.ok).toBe(true)
    expect(plantingsIn(A)).toBe(0)
    expect(plantingsIn(B)).toBe(1)
    const moved = useAppStore.getState().plot?.beds.find((bed) => bed.id === B)?.plantings[0]
    expect(moved?.bedId).toBe(B)
    // the count is the grower's and is carried; the dates are the destination's and are not
    expect(moved?.plantCount).toBe(9)
  })

  it('refuses when the destination has no calendar, and moves nothing', async () => {
    await setup([calendarFixture(A)])
    const outcome = useAppStore.getState().movePlanting(plantingId('bed-1:lettuce-leaf:100'), A, B)
    expect(outcome.ok).toBe(false)
    expect(outcome.ok ? '' : outcome.reason).toContain('no planting calendar')
    expect(plantingsIn(A)).toBe(1)
    expect(plantingsIn(B)).toBe(0)
  })

  it('refuses a move into the bed it is already in', async () => {
    await setup([calendarFixture(A), calendarFixture(B)])
    const outcome = useAppStore.getState().movePlanting(plantingId('bed-1:lettuce-leaf:100'), A, A)
    expect(outcome.ok).toBe(false)
    expect(plantingsIn(A)).toBe(1)
  })

  it('refuses a planting that is no longer there rather than inventing one', async () => {
    await setup([calendarFixture(A), calendarFixture(B)])
    const outcome = useAppStore.getState().movePlanting(plantingId('gone'), A, B)
    expect(outcome.ok).toBe(false)
    expect(plantingsIn(A)).toBe(1)
  })

  it('selects the destination, so the panel shows where the planting went', async () => {
    await setup([calendarFixture(A), calendarFixture(B)])
    useAppStore.getState().selectBed(A)
    useAppStore.getState().movePlanting(plantingId('bed-1:lettuce-leaf:100'), A, B)
    expect(useAppStore.getState().selectedBedId).toBe(B)
  })
})

/**
 * The card used to read "Bed 1, 10.5 m², 3 planted", which two adults in the newcomer walk read
 * as three of something and never learned the name of one of. The count is in the bed panel
 * beside every other figure about the bed; a card is where the beds are told apart
 */
describe('what a bed card says is in it', () => {
  const cardText = (harness: Harness, id: BedId): string =>
    harness.get(`item-bed-card-${id as string}`).textContent ?? ''

  const catalogue = (): readonly Crop[] => {
    const catalog = useAppStore.getState().catalog
    if (catalog.status !== 'ready') throw new Error('the catalogue did not load')
    return catalog.value
  }

  const plantAlso = (index: number, crop: string): void => {
    useAppStore.getState().addPlanting({
      id: plantingId(`bed-1:${crop}:${String(100 + index)}`),
      bedId: A,
      cropId: cropId(crop),
      cultivarId: null,
      role: 'target-crop',
      tier: 'herb-ground',
      sowDay: 100 as DayOfYear,
      harvestStartDay: 160 as DayOfYear,
      harvestEndDay: 180 as DayOfYear,
      plantCount: 1,
    })
  }

  it('names the plants in it, and says so plainly when there are none', async () => {
    await setup([calendarFixture(A), calendarFixture(B)])
    const harness = await mount(<BedStrip />)
    expect(cardText(harness, A)).toContain(cropName(catalogue(), LETTUCE))
    // the area stays: it is the other thing that tells one bed from another
    expect(cardText(harness, A)).toContain('12.0 m²')
    expect(cardText(harness, A)).not.toContain('1 planted')
    expect(cardText(harness, B)).toContain('nothing planted yet')
    await harness.unmount()
  })

  it('names three and counts the rest, so a card stays a card', async () => {
    await setup([calendarFixture(A), calendarFixture(B)])
    for (const [index, crop] of ['tomato', 'cucumber', 'chickpea'].entries()) {
      plantAlso(index, crop)
    }
    const harness = await mount(<BedStrip />)
    const said = cardText(harness, A)
    expect(said).toContain(cropName(catalogue(), LETTUCE))
    expect(said).toContain('and 1 more')
    expect(said).not.toContain(cropName(catalogue(), cropId('chickpea')))
    await harness.unmount()
  })
})
