import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { CROP_ROWS } from './catalog/rows'
import { expandRow } from './catalog/schema'
import { cropLightTable } from './crop-light-table'

/**
 * The counts the decision record and the validation record write out by hand, held against the
 * catalog they count. Each sentence is found by its own words, so a batch of crops that leaves one
 * behind fails here with the sentence and both numbers
 */

/** A document with its line breaks read as spaces, so a sentence wrapped across lines still matches */
const flat = (name: string): string =>
  readFileSync(`${import.meta.dir}/../../docs/${name}`, 'utf8').replace(/\s+/g, ' ')

/**
 * Pinned, because no field of a row says it contradicts a document. Record 23 names these ten as
 * the rows whose figure differs from the one VCE or the Purdue chart prints, and each cites nothing
 * for light, so the catalog counts them among the rows that cite nothing and only this list tells
 * them apart
 */
const CONTRADICTING = [
  'cilantro',
  'squash-summer',
  'parsley',
  'thyme',
  'lavender',
  'marigold-french',
  'marigold-african',
  'lanceleaf-coreopsis',
  'echinacea',
  'sweet-alyssum',
]

const table = cropLightTable(CROP_ROWS)
const tiers = table.lightTiers
const citeNothing = table.rows.filter(
  (row) => row.lightTier === 'C' && row.lightCitations.length === 0,
)
const printedNowhere = citeNothing.filter((row) => !CONTRADICTING.includes(row.id)).length
const leafy = CROP_ROWS.map(expandRow).filter((crop) => crop.laubGroup === 'leafy-vegetables')

/** Each counted sentence: its document, its words with a group per count, the tallies in order */
const COUNTED: readonly (readonly [string, RegExp, readonly number[]])[] = [
  ['00-DECISIONS.md', /each of the (\d+) Tier C rows/, [tiers.C]],
  ['00-DECISIONS.md', /\*\*Printed nowhere\*\*, (\d+) rows/, [printedNowhere]],
  [
    '00-DECISIONS.md',
    /\*\*The tiers\.\*\* (\d+) A, (\d+) B and (\d+) C/,
    [tiers.A, tiers.B, tiers.C],
  ],
  ['00-DECISIONS.md', /a reader sees (\d+) greens/, [leafy.length]],
  ['VALIDATION.md', /it holds (\d+) of the (\d+) catalog rows/, [leafy.length, CROP_ROWS.length]],
  ['VALIDATION.md', /(\d+) of the (\d+) per-crop DLI rows are Tier C/, [tiers.C, CROP_ROWS.length]],
  ['VALIDATION.md', /(\d+) of them cite nothing for light/, [citeNothing.length]],
]

describe('the counts the records write out by hand', () => {
  it('match the catalog they count', () => {
    const problems: string[] = []
    for (const [file, words, tallies] of COUNTED) {
      const match = words.exec(flat(file))
      if (match === null) {
        problems.push(`${file}: no sentence matches ${words.source}`)
        continue
      }
      for (const [at, tally] of tallies.entries()) {
        const stated = Number(match[at + 1])
        if (stated !== tally) {
          problems.push(
            `${file}, "${match[0]}": says ${String(stated)}, the catalog counts ${String(tally)}`,
          )
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('finds the three contradicting rows among the rows that cite nothing', () => {
    expect(CONTRADICTING.filter((id) => !citeNothing.some((row) => row.id === id))).toEqual([])
  })
})
