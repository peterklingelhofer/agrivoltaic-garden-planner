import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import type { LaubCropGroup } from '../types/crop'
import type { PinnedNumber } from '../types/pinned'
import { LAUB_GROUPS, LAUB_RSR_LEVELS_PERCENT } from './catalog/laub.generated'
import { CROP_ROWS } from './catalog/rows'
import { DLI_CLASSES, type CropRow, expandRow } from './catalog/schema'
import * as FIGURES from './pinned-figures'

interface LedgerQuote {
  readonly text: string
  readonly locator: string
}

/**
 * The bibliography read as text and parsed here, with no import, so `tsc` never has to walk a
 * 500-entry JSON file to type-check this suite
 */
const LEDGER = JSON.parse(
  readFileSync(`${import.meta.dir}/../../docs/CITATIONS.csl.json`, 'utf8'),
) as readonly {
  readonly id?: string
  readonly custom?: { readonly quotes?: readonly LedgerQuote[] }
}[]

/** The quotes one entry carries, or none where the ledger has no such entry */
const quotesOf = (citation: string): readonly LedgerQuote[] =>
  LEDGER.find((entry) => entry.id === citation)?.custom?.quotes ?? []

const isPin = (value: unknown): value is PinnedNumber =>
  typeof value === 'object' &&
  value !== null &&
  'citation' in value &&
  'quote' in value &&
  'value' in value

/** Every pin the module exports by name, then the Laub ones by group */
const PINS: readonly (readonly [name: string, pin: PinnedNumber])[] = [
  ...Object.entries(FIGURES as Record<string, unknown>).flatMap(
    ([name, exported]): [string, PinnedNumber][] => (isPin(exported) ? [[name, exported]] : []),
  ),
  ...Object.entries(FIGURES.LAUB_YIELD_AT_40_PERCENT).map(
    ([group, pin]): [string, PinnedNumber] => [`LAUB_YIELD_AT_40_PERCENT.${group}`, pin],
  ),
]

const cropRow = (id: string): CropRow | undefined => CROP_ROWS.find((row) => row[0] === id)

describe('pinned-figures: the numbers against the bibliography', () => {
  it('sweeps the eleven named pins and the seven Laub ones', () => {
    expect(PINS.length).toBeGreaterThanOrEqual(18)
    expect(Object.keys(FIGURES.LAUB_YIELD_AT_40_PERCENT)).toHaveLength(7)
  })

  it("names an entry the ledger carries, and quotes one of that entry's quotes word for word", () => {
    for (const [name, pin] of PINS) {
      const quotes = quotesOf(pin.citation)
      expect(
        quotes.length,
        `${name}: ${pin.citation} carries no quotes in the ledger`,
      ).toBeGreaterThan(0)
      const quote = quotes.find((one) => one.text === pin.quote)
      expect(
        quote,
        `${name}: no quote of ${pin.citation} reads "${pin.quote.slice(0, 60)}"`,
      ).toBeDefined()
      // the locator of that quote, which for an empty one is the empty string
      expect(pin.locator, `${name}: ${pin.citation}`).toBe(quote?.locator)
    }
  })

  it('spells its own value inside that quote', () => {
    for (const [name, pin] of PINS) {
      const spelling = pin.spelled ?? String(pin.value)
      expect(spelling.length, name).toBeGreaterThan(0)
      expect(pin.quote, `${name}: ${spelling}`).toContain(spelling)
      // the spelling is the value as written or the same share written as a percent
      const written = Number.parseFloat(spelling)
      const asPercent = Math.abs(written - pin.value * 100) < 1e-9
      expect(written === pin.value || asPercent, `${name}: ${spelling} against ${pin.value}`).toBe(
        true,
      )
    }
  })

  it('holds each Laub figure to its Table S2 value at 40 percent RSR, within half a point', () => {
    // Table S2 prints 102.5 for fruity vegetables where the results text says 102, and a tie
    // rounds either way, so the bound is half a point where Math.round would read 103
    const at40 = LAUB_RSR_LEVELS_PERCENT.indexOf(40)
    expect(at40).toBeGreaterThanOrEqual(0)
    for (const [group, pin] of Object.entries(FIGURES.LAUB_YIELD_AT_40_PERCENT)) {
      const table = LAUB_GROUPS[group as LaubCropGroup].predicted[at40] ?? Number.NaN
      expect(
        Math.abs(pin.value - table),
        `${group}: ${pin.value} against ${table}`,
      ).toBeLessThanOrEqual(0.5)
    }
  })
})

describe('pinned-figures: the catalog reads them', () => {
  it('has every pinned row carry the value in its tuple and in the record it expands to', () => {
    const named = Object.entries(FIGURES.PINNED_ROWS)
    expect(named.length).toBeGreaterThan(0)
    for (const [id, pins] of named) {
      const row = cropRow(id)
      expect(row, `${id} is not a catalog row`).toBeDefined()
      if (row === undefined) continue
      const { light } = expandRow(row)
      const cited: readonly string[] = row[17]?.dliCitations ?? []
      if (pins.dliMin !== undefined) {
        expect(row[8], `${id} dliMin`).toBe(pins.dliMin.value)
        expect(light.dliMinMolM2Day.value as number, `${id} light.dliMinMolM2Day`).toBe(
          pins.dliMin.value,
        )
        expect(cited, `${id} cites ${pins.dliMin.citation}`).toContain(pins.dliMin.citation)
      }
      if (pins.dliTargetLow !== undefined) {
        expect(row[9], `${id} dliTargetLow`).toBe(pins.dliTargetLow.value)
        expect(cited, `${id} cites ${pins.dliTargetLow.citation}`).toContain(
          pins.dliTargetLow.citation,
        )
      }
      if (pins.dliTargetHigh !== undefined) {
        expect(row[10], `${id} dliTargetHigh`).toBe(pins.dliTargetHigh.value)
        // the record's target is the middle of the row's band
        expect(light.dliTargetMolM2Day.value as number, `${id} light.dliTargetMolM2Day`).toBe(
          (row[9] + pins.dliTargetHigh.value) / 2,
        )
        expect(cited, `${id} cites ${pins.dliTargetHigh.citation}`).toContain(
          pins.dliTargetHigh.citation,
        )
      }
      if (pins.maxRsr !== undefined) {
        expect(row[17]?.maxRsr, `${id} maxRsr`).toBe(pins.maxRsr.value)
        expect(cited, `${id} cites ${pins.maxRsr.citation}`).toContain(pins.maxRsr.citation)
        // the record holds the design shade ceiling as light.maxDesignRsr
        expect(light.maxDesignRsr.value as number, `${id} light.maxDesignRsr`).toBe(
          pins.maxRsr.value,
        )
      }
    }
  })

  it('has the Solanaceae and cucurbit classes carry the PV ceiling and strawberry its own', () => {
    const { PV_SHADE_CEILING, STRAWBERRY_SHADE_CEILING } = FIGURES
    expect(DLI_CLASSES.solanaceae.maxDesignRsr).toBe(PV_SHADE_CEILING.value)
    expect(DLI_CLASSES.cucurbits.maxDesignRsr).toBe(PV_SHADE_CEILING.value)
    expect(DLI_CLASSES.strawberry.maxDesignRsr).toBe(STRAWBERRY_SHADE_CEILING.value)
    expect(DLI_CLASSES.solanaceae.maxDesignRsrCitations).toContain(PV_SHADE_CEILING.citation)
    expect(DLI_CLASSES.cucurbits.maxDesignRsrCitations).toContain(PV_SHADE_CEILING.citation)
    expect(DLI_CLASSES.strawberry.maxDesignRsrCitations).toContain(
      STRAWBERRY_SHADE_CEILING.citation,
    )
  })

  it('has the classes that carry a pinned light figure read it from the pin', () => {
    const { STRAWBERRY_DLI_FLOOR, RASPBERRY_DLI_FLOOR, LETTUCE_DLI_TARGET_HIGH } = FIGURES
    expect(DLI_CLASSES.strawberry.minMolM2Day).toBe(STRAWBERRY_DLI_FLOOR.value)
    expect(DLI_CLASSES['cane-bush-berries'].minMolM2Day).toBe(RASPBERRY_DLI_FLOOR.value)
    expect(DLI_CLASSES['leafy-greens'].targetHighMolM2Day).toBe(LETTUCE_DLI_TARGET_HIGH.value)
    expect(DLI_CLASSES.brassicas.targetHighMolM2Day).toBe(LETTUCE_DLI_TARGET_HIGH.value)
  })

  it('has the wild ginger row read its survival ceiling from the pin', () => {
    const pin = FIGURES.WILD_GINGER_SURVIVAL_CEILING
    const row = cropRow('wild-ginger')
    expect(row).toBeDefined()
    if (row === undefined) return
    expect(row[17]?.survivalCeiling).toBe(pin.value)
    expect(row[17]?.survivalCeilingCitations).toContain(pin.citation)
    expect(expandRow(row).light.dliMaxBeforeSurvivalLossMolM2Day?.value as number).toBe(pin.value)
  })

  it('lets no more rows that cite a source for their light figures go unpinned than the count allows', () => {
    const unpinned = CROP_ROWS.filter(
      (row) => row[17]?.dliCitations !== undefined && FIGURES.PINNED_ROWS[row[0]] === undefined,
    ).map((row) => row[0])
    if (unpinned.length <= FIGURES.UNPINNED_CITED_ROWS) return
    throw new Error(
      [
        `${String(unpinned.length)} rows cite a source for their light figures and carry no pin, and ${String(FIGURES.UNPINNED_CITED_ROWS)} are allowed:`,
        ...unpinned.map((id) => `  ${id}`),
        'pin the figure in src/data/pinned-figures.ts and name the row in PINNED_ROWS',
      ].join('\n'),
    )
  })
})
