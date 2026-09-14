import { DEFAULT_WILDLIFE } from './defaults'
import { describe, expect, it } from 'bun:test'
import { vi } from '../../test/vi'
import { assertBanded, POINT_ESTIMATE_REFUSED } from '../ui/format'
import { banded, interval } from '../types/band'
import type { Bed, GardenPlot, Planting } from '../types/garden'
import { bedId, cropId, plantingId } from '../types/ids'
import { SCHEMA_VERSION } from '../types/persist'
import { dayOfYear, epochMillis, fraction, meters, type Fraction } from '../types/units'
import { makeArray, makeBed, makeHouse, makePlot, makeTree } from './defaults'
import { DEFAULT_WIZARD_ANSWERS } from './onboarding'
import {
  debounce,
  decodeDesign,
  defaultDesign,
  designBytes,
  detectStorage,
  encodeDesign,
  isQuotaError,
  loadDesign,
  migrateDesign,
  MIGRATIONS,
  PERSISTED_KEYS,
  removeDesign,
  sameDesign,
  snapshotDesign,
  STORAGE_KEY,
  STORAGE_QUOTA,
  STORAGE_UNAVAILABLE,
  writeDesign,
  type PersistedDesign,
  type StorageLike,
} from './persist'

/* ------------------------------- test fixtures -------------------------------- */

const memoryStorage = (): StorageLike & { readonly items: Map<string, string> } => {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
    removeItem: (key) => {
      items.delete(key)
    },
  }
}

const throwingStorage = (error: unknown): StorageLike => ({
  getItem: () => null,
  setItem: () => {
    throw error
  },
  removeItem: () => undefined,
})

const planting = (bed: Bed, crop: string, sow: number): Planting => ({
  id: plantingId(`${bed.id}-${crop}`),
  bedId: bed.id,
  cropId: cropId(crop),
  cultivarId: null,
  role: 'target-crop',
  tier: 'herb-ground',
  sowDay: dayOfYear(sow),
  harvestStartDay: dayOfYear(sow + 60),
  harvestEndDay: dayOfYear(sow + 90),
  plantCount: 24,
})

/** A plot a grower would actually have: two arrays, four beds and plantings in each */
const realisticPlot = (): GardenPlot => {
  const base = makePlot()
  const beds = [...base.beds, makeBed(4)].map((bed) => ({
    ...bed,
    plantings: [planting(bed, 'lettuce', 110), planting(bed, 'bush-bean', 140)],
  }))
  return { ...base, beds, arrays: [...base.arrays, makeArray(2)] }
}

const realisticDesign = (): PersistedDesign => ({
  ...defaultDesign(),
  plot: realisticPlot(),
  selectedBedId: bedId('bed-2'),
  preferences: {
    entries: [{ cropId: cropId('lettuce'), kind: 'prefer', weight: 0.8 as Fraction }],
    influence: 0.3 as Fraction,
  },
  overlay: { visible: false, slice: 7, channel: 'rsr', opacity: 0.4 },
  imageryEnabled: true,
  // not both defaults, so the round trip is asked to carry an answer rather than a shape
  wildlife: { favourNative: false, favourPollinators: true },
  // and the same for the answers and the open step: what was said, and where they were reading
  answers: {
    ...DEFAULT_WIZARD_ANSWERS,
    ambition: 'fruiting-and-berries',
    mounting: 'ground-rows',
    maxHeightM: meters(2.4),
    irrigationAvailable: false,
    experience: 'experienced',
  },
  sidebarStep: 'plants',
})

const AT = epochMillis(1_720_000_000_000)

const roundTrip = (design: PersistedDesign): PersistedDesign => {
  const storage = memoryStorage()
  writeDesign(storage, design, AT)
  const loaded = loadDesign(storage)
  expect(loaded.status.outcome).toBe('restored')
  expect(loaded.design).not.toBeNull()
  return loaded.design as PersistedDesign
}

/* ---------------------------------- the tests ---------------------------------- */

describe('what is persisted', () => {
  it('writes every persisted slice and not one derived one', () => {
    const storage = memoryStorage()
    writeDesign(storage, realisticDesign(), AT)
    const payload = JSON.parse(storage.items.get(STORAGE_KEY) ?? '') as {
      version: number
      design: Record<string, unknown>
    }
    expect(payload.version).toBe(SCHEMA_VERSION)
    expect(Object.keys(payload.design).sort()).toEqual([...PERSISTED_KEYS].sort())
    for (const derived of [
      'raster',
      'weather',
      'site',
      'energy',
      'sets',
      'calendars',
      'suggestions',
      'surface',
      'bedLight',
      'compliance',
      'catalog',
      'progress',
      'draft',
      'dragging',
      'mode',
    ]) {
      expect(payload.design[derived], `${derived} must not be persisted`).toBeUndefined()
    }
  })

  it('restores the plot, its beds, its arrays and their plantings unchanged', () => {
    const design = realisticDesign()
    const back = roundTrip(design)
    expect(back.plot?.beds.length).toBe(4)
    expect(back.plot?.arrays.length).toBe(2)
    expect(back.plot?.beds.map((bed) => bed.plantings.length)).toEqual([2, 2, 2, 2])
    expect(back.plot).toEqual(design.plot)
  })

  it('restores a house drawn on the ground unchanged', () => {
    const design = realisticDesign()
    const plot = design.plot as GardenPlot
    const house = makeHouse(1, plot.boundary, 'south')
    const withHouse = { ...design, plot: { ...plot, obstructions: [house] } }
    const back = roundTrip(withHouse)
    expect(back.plot?.obstructions).toEqual([house])
  })

  it('restores a tree drawn on the ground unchanged', () => {
    const design = realisticDesign()
    const plot = design.plot as GardenPlot
    const tree = makeTree(1, plot.boundary, 'south')
    const withTree = { ...design, plot: { ...plot, obstructions: [tree] } }
    const back = roundTrip(withTree)
    expect(back.plot?.obstructions).toEqual([tree])
  })

  it('restores the location, preferences, weights and durable UI choices', () => {
    const design = realisticDesign()
    const back = roundTrip(design)
    for (const key of PERSISTED_KEYS) expect(back[key], key).toEqual(design[key])
  })

  /**
   * A reload that remembered the plot but forgot that its grower had said "mostly food" and was
   * reading the plants step would look like the app forgetting, so both are written with the design
   */
  it('restores the answers and the open step, so a reload lands where the grower was', () => {
    const design = realisticDesign()
    const back = roundTrip(design)
    expect(back.answers).toEqual(design.answers)
    expect(back.answers.ambition).toBe('fruiting-and-berries')
    expect(back.answers.maxHeightM).toBe(2.4)
    expect(back.sidebarStep).toBe('plants')
  })

  it('drops a half-read set of answers, or a step this build has no such step for', () => {
    const design = realisticDesign()
    const storage = memoryStorage()
    writeDesign(
      storage,
      {
        ...design,
        answers: { ...design.answers, mounting: 'on-the-roof' } as unknown as typeof design.answers,
        sidebarStep: 'pairs' as unknown as typeof design.sidebarStep,
      },
      AT,
    )
    const loaded = loadDesign(storage)
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.design?.answers).toEqual(DEFAULT_WIZARD_ANSWERS)
    expect(loaded.design?.sidebarStep).toBe('place')
  })

  it('recomputes bed area and array metrics rather than trusting the stored ones', () => {
    const design = realisticDesign()
    const plot = design.plot as GardenPlot
    const storage = memoryStorage()
    // a payload whose derived numbers disagree with its geometry, as a changed derivation
    // would leave behind
    writeDesign(
      storage,
      {
        ...design,
        plot: {
          ...plot,
          beds: plot.beds.map((bed) => ({ ...bed, areaM2: 9999 as Bed['areaM2'] })),
          arrays: plot.arrays.map((array) => ({
            ...array,
            derived: { ...array.derived, groundCoverRatio: 9999 as never },
          })),
        },
      },
      AT,
    )
    const back = loadDesign(storage).design as PersistedDesign
    expect(back.plot?.beds[0]?.areaM2).toBeCloseTo(plot.beds[0]?.areaM2 ?? 0, 6)
    expect(back.plot?.arrays[0]?.derived.groundCoverRatio).toBeCloseTo(
      plot.arrays[0]?.derived.groundCoverRatio ?? 0,
      6,
    )
  })

  it('leaves brands intact, because a brand is a phantom type with no runtime key', () => {
    const design = realisticDesign()
    const back = roundTrip(design)
    const bed = back.plot?.beds[0]
    expect(typeof bed?.raisedHeightM).toBe('number')
    expect(bed?.raisedHeightM).toBe(design.plot?.beds[0]?.raisedHeightM)
    expect(typeof bed?.id).toBe('string')
    // nothing but the primitive is serialised, so nothing about the brand can be lost
    expect(JSON.parse(JSON.stringify({ m: meters(1.5), f: fraction(0.25) }))).toEqual({
      m: 1.5,
      f: 0.25,
    })
  })
})

/**
 * Decision Record 7 territory. `assertBanded` throws for a value that crossed a JSON
 * boundary and lost its shape, so the rule here is: persist no `Banded<T>` at all. The
 * scan proves the payload holds none, and the control proves the scan can see one
 */
describe('bands never enter the payload', () => {
  const bandLike = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(bandLike)
    if (typeof value !== 'object' || value === null) return false
    const record = value as Record<string, unknown>
    const bounds = record.interval as Record<string, unknown> | undefined
    if (typeof bounds?.lower === 'number' && typeof bounds.upper === 'number') return true
    return Object.values(record).some(bandLike)
  }

  const sampleBand = banded(
    interval(0.1 as Fraction, 0.4 as Fraction),
    0.9,
    'confidence',
    'crop-response',
    [],
  )

  it('finds no band anywhere in a realistic payload', () => {
    const payload = JSON.parse(encodeDesign(realisticDesign(), AT)) as unknown
    expect(bandLike(payload)).toBe(false)
  })

  it('would find one if a band were ever added, and such a band does survive JSON', () => {
    expect(bandLike({ design: { deep: [{ band: sampleBand }] } })).toBe(true)
    // so the exclusion is a decision about size and staleness, not about JSON: a band that
    // was persisted would rehydrate as a real band
    const crossed = JSON.parse(JSON.stringify(sampleBand)) as typeof sampleBand
    expect(() => assertBanded(crossed)).not.toThrow()
    expect(assertBanded(crossed).interval.upper).toBeCloseTo(0.4, 12)
    // and the thing it refuses is exactly what a point estimate looks like after JSON
    expect(() => assertBanded(0.25 as never)).toThrow(POINT_ESTIMATE_REFUSED)
  })
})

describe('schema version', () => {
  const envelope = (version: unknown): string =>
    JSON.stringify({ version, savedAtUtcMillis: AT, design: realisticDesign() })

  const loadedFrom = (raw: string): ReturnType<typeof loadDesign> => {
    const storage = memoryStorage()
    storage.items.set(STORAGE_KEY, raw)
    return loadDesign(storage)
  }

  it('walks a payload of the current version through untouched', () => {
    expect(migrateDesign(SCHEMA_VERSION, { a: 1 })).toEqual({ ok: true, design: { a: 1 } })
  })

  it('refuses a version newer than this build', () => {
    const result = migrateDesign(SCHEMA_VERSION + 1, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('newer version')
  })

  it('refuses an older version it has no migration for', () => {
    // 0 rather than `SCHEMA_VERSION - 1`, which stopped meaning "no migration" the moment the
    // first one was written: the assertion is about a gap in the chain, not about the last step
    const result = migrateDesign(0, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('no migration')
  })

  /**
   * A field that did not exist when a design was written is not a corrupt field, and telling a
   * returning visitor otherwise is what this step exists to stop
   */
  it('carries a design written before the wildlife answers onto their defaults', () => {
    const result = migrateDesign(1, { plot: null })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.design as { wildlife?: unknown }).wildlife).toEqual(DEFAULT_WILDLIFE)
    }
  })

  it('leaves a wildlife answer the visitor actually made alone', () => {
    const chosen = { favourNative: true, favourPollinators: false }
    const result = migrateDesign(1, { wildlife: chosen })
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.design as { wildlife?: unknown }).wildlife).toEqual(chosen)
  })

  it('carries a design written before the simulation existed onto no seasons run', () => {
    const result = migrateDesign(2, { plot: null })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const design = result.design as { simulation?: { season?: number; history?: unknown } }
      expect(design.simulation?.season).toBe(0)
      expect(design.simulation?.history).toEqual([])
    }
  })

  /** A design saved before the questions became steps answered nothing and opens on step one */
  it('carries a design written before the answers and the step were saved onto their defaults', () => {
    const result = migrateDesign(3, { plot: null })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const design = result.design as { answers?: unknown; sidebarStep?: unknown }
    expect(design.answers).toEqual(DEFAULT_WIZARD_ANSWERS)
    expect(design.sidebarStep).toBe('place')
  })

  it('restores a whole design saved at schema 3 with the defaults for both', () => {
    const { answers: _answers, sidebarStep: _step, ...older } = realisticDesign()
    const storage = memoryStorage()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, savedAtUtcMillis: AT, design: older }),
    )
    const loaded = loadDesign(storage)
    expect(loaded.status.outcome).toBe('restored')
    expect(loaded.design?.answers).toEqual(DEFAULT_WIZARD_ANSWERS)
    expect(loaded.design?.sidebarStep).toBe('place')
    expect(loaded.design?.plot).toEqual(older.plot)
  })

  /** A design saved before a house could be drawn had nothing drawn, which is an empty list */
  it('restores a whole design saved at schema 4 with an empty obstruction list', () => {
    const design = realisticDesign()
    const plot = design.plot as GardenPlot
    const { obstructions: _obstructions, ...olderPlot } = plot
    const storage = memoryStorage()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 4,
        savedAtUtcMillis: AT,
        design: { ...design, plot: olderPlot },
      }),
    )
    const loaded = loadDesign(storage)
    expect(loaded.status.outcome).toBe('restored')
    expect(loaded.design?.plot?.obstructions).toEqual([])
    expect(loaded.design?.plot?.beds.length).toBe(plot.beds.length)
  })

  it('leaves the seasons a visitor actually ran alone', () => {
    const ran = {
      seed: 9,
      season: 2,
      yearChoice: 'typical',
      history: [],
      reports: [],
      trials: [],
      revealed: [],
    }
    const result = migrateDesign(2, { simulation: ran })
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.design as { simulation?: unknown }).simulation).toEqual(ran)
  })

  it('refuses a payload carrying no version at all', () => {
    const result = migrateDesign(undefined, {})
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('no schema version')
  })

  it('discards a mismatched payload whole rather than half-loading it', () => {
    const loaded = loadedFrom(envelope(SCHEMA_VERSION + 1))
    expect(loaded.design).toBeNull()
    expect(loaded.status.outcome).toBe('discarded')
    expect(loaded.status.message).toContain('newer version')
  })

  // this passes vacuously today, since there is no version below 1 to step from, and that is
  // the point: it fails the day SCHEMA_VERSION is bumped past 1 without a matching migration
  // added below, rather than letting loadDesign quietly turn every saved garden into null
  it('has a migration registered for every version below the current schema', () => {
    for (let version = 1; version < SCHEMA_VERSION; version += 1) {
      expect(MIGRATIONS[version], `no migration from schema ${String(version)}`).toBeDefined()
    }
  })
})

describe('corrupt and partial payloads', () => {
  const loadedFrom = (raw: string): ReturnType<typeof loadDesign> => {
    const storage = memoryStorage()
    storage.items.set(STORAGE_KEY, raw)
    return loadDesign(storage)
  }

  it('falls back to defaults with a notice when the payload is not JSON', () => {
    const loaded = loadedFrom('{not json at all')
    expect(loaded.design).toBeNull()
    expect(loaded.status.outcome).toBe('discarded')
    expect(loaded.status.message.length).toBeGreaterThan(0)
  })

  it('falls back when the payload is JSON but not a saved design', () => {
    expect(loadedFrom('[1,2,3]').status.outcome).toBe('discarded')
    expect(loadedFrom('"a string"').status.outcome).toBe('discarded')
    expect(loadedFrom(JSON.stringify({ version: SCHEMA_VERSION })).status.outcome).toBe('discarded')
  })

  it('keeps what it can read and resets only the fields it cannot', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as { design: Record<string, unknown> }
    raw.design.frostPercentile = 77
    raw.design.overlay = { visible: 'yes' }
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.status.message).toContain('frostPercentile')
    expect(loaded.status.message).toContain('overlay')
    expect(loaded.design?.frostPercentile).toBe(defaultDesign().frostPercentile)
    expect(loaded.design?.overlay).toEqual(defaultDesign().overlay)
    // and the rest of the design is still the grower's
    expect(loaded.design?.plot?.beds.length).toBe(4)
    // a field the fixture deliberately sets AWAY from its default, so surviving means kept
    expect(defaultDesign().imageryEnabled).toBe(false)
    expect(loaded.design?.imageryEnabled).toBe(true)
  })

  it('drops a plot whose geometry would divide by zero rather than rendering it', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as {
      design: { plot: { arrays: { geometry: { pitchM: number } }[] } }
    }
    const array = raw.design.plot.arrays[0]
    if (array) array.geometry.pitchM = 0
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.design?.plot).toEqual(defaultDesign().plot)
  })

  /** Four corners or it isn't the box the bake would shade with, so the whole plot is unreadable */
  it('drops a plot whose house has three corners rather than rendering it', () => {
    const design = realisticDesign()
    const plot = design.plot as GardenPlot
    const house = makeHouse(1, plot.boundary, 'south')
    const withHouse = { ...design, plot: { ...plot, obstructions: [house] } }
    const raw = JSON.parse(encodeDesign(withHouse, AT)) as {
      design: { plot: { obstructions: { footprint: { exterior: unknown[] } }[] } }
    }
    raw.design.plot.obstructions[0]?.footprint.exterior.pop()
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.design?.plot).toEqual(defaultDesign().plot)
  })

  /** A crown whose top sits below its own base is not a box the bake could shade with */
  it('drops a plot whose tree top is below its crown base rather than rendering it', () => {
    const design = realisticDesign()
    const plot = design.plot as GardenPlot
    const tree = makeTree(1, plot.boundary, 'south')
    const withTree = { ...design, plot: { ...plot, obstructions: [tree] } }
    const raw = JSON.parse(encodeDesign(withTree, AT)) as {
      design: { plot: { obstructions: { heightM: number; crownBaseM: number }[] } }
    }
    const obstruction = raw.design.plot.obstructions[0]
    if (obstruction) obstruction.heightM = obstruction.crownBaseM - 1
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.design?.plot).toEqual(defaultDesign().plot)
  })

  /**
   * A render preference has a meaningful default, so a design written before one existed is a
   * design that predates it and not a damaged one. Upstream data gets the opposite treatment:
   * absent stays absent there, because there is no default for what a site measured
   */
  it('restores a design written before an effect existed without calling it damaged', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as { design: Record<string, unknown> }
    delete raw.design.effects
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('restored')
    expect(loaded.design?.effects).toEqual(defaultDesign().effects)
  })

  /** Money typed in is the grower's, like a typed pH: absent is earlier, malformed is dropped whole */
  it('restores a design written before money could be typed with nothing typed', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as { design: Record<string, unknown> }
    delete raw.design.economyInputs
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('restored')
    expect(loaded.design?.economyInputs).toEqual({
      perKwh: null,
      currency: 'USD',
      installedCost: null,
    })
  })

  it('round-trips a typed tariff and drops one whose currency is not a three-letter code', () => {
    const typed = { perKwh: 0.4, currency: 'EUR', installedCost: 8000 }
    expect(roundTrip({ ...realisticDesign(), economyInputs: typed }).economyInputs).toEqual(typed)
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as { design: Record<string, unknown> }
    raw.design.economyInputs = { perKwh: 0.4, currency: 'euros', installedCost: null }
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.status.message).toContain('economyInputs')
    expect(loaded.design?.economyInputs).toEqual(defaultDesign().economyInputs)
  })

  /**
   * A report saved before a tariff could be typed valued its year under `electricityValueUsd` and
   * carried no typed cost. It is read into the shape a season writes today, so the block on an
   * older report renders the same way as a new one rather than losing its value line
   */
  it('reads an older report’s economy into the shape a season writes today', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as {
      design: { simulation: { reports: Record<string, unknown>[] } }
    }
    raw.design.simulation.reports = [
      {
        season: 1,
        year: { year: null, label: 'typical year' },
        outcomes: [],
        harvestIndex: null,
        energyKwh: 4120,
        energyShare: 0.8,
        advice: { id: 'status', text: 'nothing', bedId: null },
        economy: {
          buildCostUsd: null,
          electricityValueUsd: 1255.78,
          price: null,
          paybackYears: null,
          managementTasks: [],
        },
      },
    ]
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('restored')
    const economy = loaded.design?.simulation.reports[0]?.economy as unknown as Record<
      string,
      unknown
    >
    expect(economy.electricityValue).toBe(1255.78)
    expect(economy.installedCost).toBeNull()
    expect('electricityValueUsd' in economy).toBe(false)
    expect(economy.managementTasks).toEqual([])
  })

  it('drops an effect setting that is not a set of switches', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as { design: Record<string, unknown> }
    raw.design.effects = { ambientOcclusion: 'yes' }
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.status.message).toContain('effects')
    expect(loaded.design?.effects).toEqual(defaultDesign().effects)
  })

  /**
   * Half a pair of switches is worse than none of it: the ranking cannot tell an answer of "no"
   * from an answer that failed to load, so a stored wildlife record that is not two booleans
   * falls back to both off rather than to whichever half survived
   */
  it('drops a wildlife answer that is not a pair of switches', () => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as { design: Record<string, unknown> }
    raw.design.wildlife = { favourNative: true }
    const loaded = loadedFrom(JSON.stringify(raw))
    expect(loaded.status.outcome).toBe('repaired')
    expect(loaded.status.message).toContain('wildlife')
    expect(loaded.design?.wildlife).toEqual(defaultDesign().wildlife)
    // both defaults, so a half-written pair is repaired to a pair and not to the half it held
    expect(defaultDesign().wildlife).toEqual({ favourNative: false, favourPollinators: false })
  })

  it('decodes an outright hostile value into the full default design', () => {
    const decoded = decodeDesign('not an object')
    expect(decoded.dropped).toEqual([...PERSISTED_KEYS])
    expect(decoded.design).toEqual(defaultDesign())
  })
})

describe('quota and availability', () => {
  it('names a quota failure rather than failing silently', () => {
    const error = new DOMException('exceeded the quota', 'QuotaExceededError')
    const written = writeDesign(throwingStorage(error), realisticDesign(), AT)
    expect(written.outcome).toBe('quota-exceeded')
    expect(written.message).toBe(STORAGE_QUOTA)
    expect(isQuotaError(error)).toBe(true)
  })

  it('reports any other write failure as itself', () => {
    const written = writeDesign(throwingStorage(new Error('disk on fire')), realisticDesign(), AT)
    expect(written.outcome).toBe('failed')
    expect(written.message).toContain('disk on fire')
  })

  it('says so, and does not throw, when the browser allows no storage at all', () => {
    expect(loadDesign(null)).toEqual({
      design: null,
      status: {
        outcome: 'unavailable',
        message: STORAGE_UNAVAILABLE,
        bytes: 0,
        savedAtUtcMillis: null,
      },
    })
    expect(writeDesign(null, realisticDesign(), AT).outcome).toBe('unavailable')
    expect(removeDesign(null).outcome).toBe('unavailable')
  })

  it('feature-detects by writing, so a private mode that throws is detected', () => {
    /*
      Every test file carries a DOM since the move to bun, so the absence a server render has is
      made here rather than inherited from the environment. `detectStorage` reads
      `globalThis.localStorage`, so taking that away IS the absence
    */
    vi.stubGlobal('localStorage', undefined)
    expect(detectStorage()).toBeNull()
    const probe = {
      setItem: () => {
        throw new Error('private mode')
      },
    }
    vi.stubGlobal('localStorage', probe)
    expect(detectStorage()).toBeNull()
    vi.unstubAllGlobals()
  })

  it('removes the payload on an explicit reset', () => {
    const storage = memoryStorage()
    writeDesign(storage, realisticDesign(), AT)
    expect(storage.items.has(STORAGE_KEY)).toBe(true)
    expect(removeDesign(storage).outcome).toBe('cleared')
    expect(storage.items.has(STORAGE_KEY)).toBe(false)
    expect(loadDesign(storage).status.outcome).toBe('idle')
  })
})

describe('payload size', () => {
  it('keeps a realistic design far inside the origin quota', () => {
    const bytes = designBytes(encodeDesign(realisticDesign(), AT))
    // ~5 MB is the whole-origin budget in every engine that ships localStorage
    expect(bytes).toBeLessThan(64 * 1024)
    console.log(`realistic design (1 plot, 2 arrays, 4 beds, 8 plantings): ${bytes} bytes`)
  })

  /** The number behind the decision not to persist `raster`, measured rather than assumed */
  it('shows why the light raster cannot go in the same store', () => {
    const cells = 85_000
    const slice = Float32Array.from({ length: cells }, (_, index) =>
      Number((12 + Math.sin(index) * 6).toFixed(4)),
    )
    const sliceBytes = designBytes(JSON.stringify([...slice]))
    // skyViewFactor, two annual fields and twelve monthly pairs, before any time window
    const rasterBytes = sliceBytes * 27
    console.log(
      `one ${cells}-cell raster slice: ${sliceBytes} bytes, a 27-slice raster: ${(rasterBytes / 1_048_576).toFixed(1)} MB`,
    )
    expect(rasterBytes).toBeGreaterThan(5 * 1_048_576)
  })

  it('reports the stored size on the status it hands the UI', () => {
    const storage = memoryStorage()
    const written = writeDesign(storage, realisticDesign(), AT)
    expect(written.bytes).toBe(designBytes(storage.items.get(STORAGE_KEY) ?? ''))
    expect(written.savedAtUtcMillis).toBe(AT)
  })
})

describe('change detection and debouncing', () => {
  it('sees a design as unchanged only while every slice keeps its identity', () => {
    const design = realisticDesign()
    expect(sameDesign(design, snapshotDesign(design))).toBe(true)
    expect(sameDesign(design, { ...design, plantYear: 2 })).toBe(false)
  })

  it('runs once after the edits stop, not once per edit', () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const write = debounce(run, 600)
    for (let edit = 0; edit < 40; edit += 1) {
      write()
      vi.advanceTimersByTime(10)
    }
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(600)
    expect(run).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('can be cancelled and can be flushed early', () => {
    vi.useFakeTimers()
    const cancelled = vi.fn()
    const flushed = vi.fn()
    const a = debounce(cancelled, 600)
    const b = debounce(flushed, 600)
    a()
    a.cancel()
    b()
    b.flush()
    vi.advanceTimersByTime(2000)
    expect(cancelled).not.toHaveBeenCalled()
    expect(flushed).toHaveBeenCalledTimes(1)
    // flushing with nothing pending is a no-op rather than a second write
    b.flush()
    expect(flushed).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

/**
 * Ground cover replaced the plot's bare `groundAlbedo` number. Every design saved before that
 * carries the number and no cover, and a decoder that simply rejected them would have thrown
 * away real gardens over one field whose answer is recoverable
 */
describe('a design saved before ground cover existed', () => {
  const loadLegacy = (groundAlbedo: number): ReturnType<typeof loadDesign> => {
    const design = realisticDesign()
    const raw = JSON.parse(encodeDesign(design, AT)) as {
      design: { plot: Record<string, unknown> }
    }
    const { groundCover: _dropped, ...plot } = raw.design.plot
    raw.design.plot = { ...plot, groundAlbedo }
    const storage = memoryStorage()
    storage.items.set(STORAGE_KEY, JSON.stringify(raw))
    return loadDesign(storage)
  }

  it('is kept, not discarded, and its beds come back', () => {
    const loaded = loadLegacy(0.2)
    expect(loaded.design?.plot).not.toBeNull()
    expect(loaded.design?.plot?.beds.length).toBe(4)
  })

  it('comes back on the cover its albedo was nearest to', () => {
    expect(loadLegacy(0.2).design?.plot?.groundCover).toBe('grass')
    expect(loadLegacy(0.35).design?.plot?.groundCover).toBe('straw-mulch')
    expect(loadLegacy(0.02).design?.plot?.groundCover).toBe('bare-soil')
  })

  it('leaves a design that already names a cover exactly as it was', () => {
    const base = realisticDesign()
    const design: PersistedDesign = {
      ...base,
      plot: base.plot === null ? null : { ...base.plot, groundCover: 'straw-mulch' },
    }
    const storage = memoryStorage()
    storage.items.set(STORAGE_KEY, encodeDesign(design, AT))
    expect(loadDesign(storage).design?.plot?.groundCover).toBe('straw-mulch')
  })
})
