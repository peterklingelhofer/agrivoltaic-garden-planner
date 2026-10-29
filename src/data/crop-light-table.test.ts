import { describe, expect, it } from 'bun:test'
import type { DataTier } from '../types/evidence'
import { CROP_ROWS } from './catalog/rows'
import { type CropRow, DLI_CLASSES, expandRow } from './catalog/schema'
import {
  CLASS_NAME,
  type CropLightNote,
  type CropLightRow,
  type NoteKind,
  cropLightCsv,
  cropLightTable,
} from './crop-light-table'

/**
 * The crop light table held against the app it describes. Each expectation is computed from
 * `CROP_ROWS` through `expandRow`, the path the app takes, so a catalog edit moves the test with it.
 * The few figures written in by hand belong to the named crops and are deliberate pins
 */

const table = cropLightTable(CROP_ROWS)

/** Each catalog row beside the record the app expands it to */
const CATALOG = CROP_ROWS.map((row) => ({ row, crop: expandRow(row) }))

const rowOf = (id: string): CropRow => {
  const row = CROP_ROWS.find((one) => one[0] === id)
  if (row === undefined) throw new Error(`${id} is not a catalog row`)
  return row
}

const printedRowOf = (id: string): CropLightRow => {
  const row = table.rows.find((one) => one.id === id)
  if (row === undefined) throw new Error(`${id} is not on the table`)
  return row
}

/** The ids of the table rows a predicate flags, which is none when the table is sound */
const flagged = (test: (row: CropLightRow) => boolean): string[] =>
  table.rows.filter(test).map((row) => row.id)

/** The classes these rows use, in the order `DLI_CLASSES` lists them */
const classesOf = (rows: readonly CropRow[]): string[] =>
  Object.keys(DLI_CLASSES).filter((dliClass) => rows.some((row) => row[5] === dliClass))

/** The notes of one kind that list a crop */
const notesOn = (id: string, kind: NoteKind): CropLightNote[] =>
  table.notes.filter((note) => note.kind === kind && note.crops.some((crop) => crop.id === id))

const labelOf = (note: CropLightNote): string => `${note.kind} note "${note.text.slice(0, 48)}"`

describe('crop light table: rows and classes', () => {
  it('holds every catalog row exactly once', () => {
    const ids = table.rows.map((row) => row.id)
    expect(ids).toHaveLength(CROP_ROWS.length)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(ids)).toEqual(new Set(CROP_ROWS.map((row) => row[0])))
  })

  it('groups the rows by class in the order of DLI_CLASSES', () => {
    expect(table.classes.map((entry): string => entry.dliClass)).toEqual(classesOf(CROP_ROWS))
    for (const entry of table.classes) {
      expect(entry.name).toBe(CLASS_NAME[entry.dliClass])
      expect(entry.spec).toBe(DLI_CLASSES[entry.dliClass])
      expect(entry.rows.length, entry.dliClass).toBeGreaterThan(0)
      expect(entry.rows.every((row) => row.dliClass === entry.dliClass)).toBe(true)
    }
    const grouped = table.classes.flatMap((entry) => entry.rows.map((row) => row.id))
    expect(grouped).toEqual(table.rows.map((row) => row.id))
  })

  it('sorts the names within a class and repeats none of them', () => {
    for (const entry of table.classes) {
      const names = entry.rows.map((row) => row.name)
      expect(new Set(names).size, `${entry.dliClass} repeats a name`).toBe(names.length)
      expect(names, entry.dliClass).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
    }
  })

  it('gives the same table whatever the order of the catalog', () => {
    expect(cropLightTable([...CROP_ROWS].reverse())).toEqual(table)
  })

  it('builds from the catalog it gets and drops the classes that catalog has no rows for', () => {
    // kale's class comes before broccoli's in DLI_CLASSES, so the table has to reorder this pair
    const pair = [rowOf('broccoli'), rowOf('kale')]
    const small = cropLightTable(pair)
    expect(small.rows.map((row) => row.id)).not.toEqual(pair.map((row) => row[0]))
    expect(small.rows).toHaveLength(pair.length)
    expect(small.classes.map((entry): string => entry.dliClass)).toEqual(classesOf(pair))
  })

  it('refuses a catalog row whose class it has no place for', () => {
    const kale = rowOf('kale')
    const stray = [...kale.slice(0, 5), 'orchard', ...kale.slice(6)] as unknown as CropRow
    expect(() => cropLightTable([stray])).toThrow()
  })

  it('names every class once', () => {
    expect(Object.keys(CLASS_NAME).sort()).toEqual(Object.keys(DLI_CLASSES).sort())
    const names = Object.values(CLASS_NAME)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('crop light table: tier counts', () => {
  const tally = (tiers: readonly DataTier[]): Record<DataTier, number> => {
    const counts: Record<DataTier, number> = { A: 0, B: 0, C: 0 }
    for (const tier of tiers) counts[tier] += 1
    return counts
  }

  it('tallies the light figures by the tier of their record', () => {
    expect(table.lightTiers).toEqual(
      tally(CATALOG.map(({ crop }) => crop.light.dliMinMolM2Day.tier)),
    )
  })

  it('tallies the shade ceilings by the tier of their record', () => {
    expect(table.ceilingTiers).toEqual(
      tally(CATALOG.map(({ crop }) => crop.light.maxDesignRsr.tier)),
    )
  })

  it('counts every row once in each tally', () => {
    for (const counts of [table.lightTiers, table.ceilingTiers]) {
      expect(counts.A + counts.B + counts.C).toBe(CROP_ROWS.length)
    }
  })
})

describe('crop light table: the pinned crops', () => {
  it('prints broccoli with class-basis light figures and an own-basis shade ceiling', () => {
    const row = printedRowOf('broccoli')
    expect(row).toMatchObject({
      floor: 10,
      targetLow: 14,
      targetHigh: 20,
      lightTier: 'C',
      lightBasis: 'class',
      ceiling: 0.3,
      ceilingTier: 'C',
      ceilingBasis: 'own',
    })
    expect(row.ceiling).toBe(expandRow(rowOf('broccoli')).light.maxDesignRsr.value)
    expect(row.maturity).toEqual({ kind: 'days', days: 70, from: 'transplant' })
  })

  it('prints kale with the leafy greens ceiling', () => {
    const row = printedRowOf('kale')
    expect(row).toMatchObject({ floor: 6, targetLow: 12, targetHigh: 18, ceiling: 0.4 })
    expect(row.ceiling).toBe(expandRow(rowOf('kale')).light.maxDesignRsr.value)
  })
})

describe('crop light table: what a tier may claim', () => {
  // each basis word belongs to one tier: a tier C figure is class or printed and never reads as
  // measured, tier A is a trial and tier B a study
  const TIER_OF_BASIS = { class: 'C', printed: 'C', trial: 'A', study: 'B' } as const

  it('pairs every light basis with its own tier', () => {
    expect(flagged((row) => TIER_OF_BASIS[row.lightBasis] !== row.lightTier)).toEqual([])
  })

  it('cites nothing for a class basis and at least one work for every other', () => {
    expect(
      flagged((row) => (row.lightBasis === 'class') !== (row.lightCitations.length === 0)),
    ).toEqual([])
  })

  it('gives a tier C ceiling the basis own and a tier B ceiling the basis study', () => {
    expect(flagged((row) => row.ceilingTier === 'C' && row.ceilingBasis !== 'own')).toEqual([])
    expect(flagged((row) => row.ceilingTier === 'B' && row.ceilingBasis !== 'study')).toEqual([])
  })

  it('cites a work for every shade ceiling', () => {
    expect(flagged((row) => row.ceilingCitations.length === 0)).toEqual([])
  })

  it('agrees with the expanded record on every tier and basis', () => {
    const problems: string[] = []
    for (const { row: source, crop } of CATALOG) {
      const row = printedRowOf(source[0])
      const light = crop.light.dliMinMolM2Day
      const ceiling = crop.light.maxDesignRsr
      if (row.lightTier !== light.tier) {
        problems.push(`${row.id}: light tier ${row.lightTier}, record ${light.tier}`)
      }
      const inferredWithNoWork = light.provenance === 'inferred' && light.citations.length === 0
      if ((row.lightBasis === 'class') !== inferredWithNoWork) {
        problems.push(`${row.id}: light basis ${row.lightBasis}, record ${light.provenance}`)
      }
      if (row.ceilingTier !== ceiling.tier) {
        problems.push(`${row.id}: ceiling tier ${row.ceilingTier}, record ${ceiling.tier}`)
      }
      if ((row.ceilingBasis === 'own') !== (ceiling.provenance === 'inferred')) {
        problems.push(`${row.id}: ceiling basis ${row.ceilingBasis}, record ${ceiling.provenance}`)
      }
    }
    expect(problems).toEqual([])
  })
})

describe('crop light table: the figures', () => {
  it('carries what expandRow resolves for every crop', () => {
    for (const { row: source, crop } of CATALOG) {
      const { light, spacing, taxonomy } = crop
      expect(printedRowOf(source[0])).toMatchObject({
        id: source[0],
        name: taxonomy.commonNames[0],
        otherNames: taxonomy.commonNames.slice(1),
        acceptedName: taxonomy.acceptedName,
        family: taxonomy.family,
        dliClass: source[5],
        lifeCycle: crop.lifeCycle,
        floor: light.dliMinMolM2Day.value,
        targetLow: source[9],
        targetHigh: source[10],
        lightCitations: light.dliMinMolM2Day.citations,
        ceiling: light.maxDesignRsr.value,
        ceilingCitations: light.maxDesignRsr.citations,
        disorderCeiling: light.dliMaxBeforeDisorderMolM2Day?.value ?? null,
        survivalCeiling: light.dliMaxBeforeSurvivalLossMolM2Day?.value ?? null,
        survivalCitations: light.dliMaxBeforeSurvivalLossMolM2Day?.citations ?? [],
        shadeBenefit: light.shadeBenefitingWhenWaterLimited,
        inRowCm: spacing.inRowCm,
        betweenRowsCm: spacing.betweenRowsCm,
      })
    }
  })

  it('gives an annual its days to maturity and a perennial the years its row sets', () => {
    for (const { row: source, crop } of CATALOG) {
      const years = source[17]?.yearsToMature
      const printed = printedRowOf(source[0]).maturity
      expect(printed, source[0]).toEqual(
        crop.thermal !== null
          ? { kind: 'days', days: crop.thermal.daysToMaturity, from: crop.thermal.dtmReference }
          : years === undefined
            ? { kind: 'perennial' }
            : { kind: 'years', years },
      )
    }
  })

  it('has a note beside every light figure and every ceiling', () => {
    expect(flagged((row) => row.lightNote === '' || row.ceilingNote === '')).toEqual([])
  })
})

describe('crop light table: notes', () => {
  it('lists every distinct note once', () => {
    const keys = table.notes.map((note) => `${note.kind}|${String(note.value)}|${note.text}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('numbers the notes that are not class defaults from 1, in array order', () => {
    const mismatched = table.notes.filter((note) => (note.number === null) !== note.classDefault)
    expect(mismatched.map(labelOf)).toEqual([])
    const numbers = table.notes.flatMap((note) => (note.number === null ? [] : [note.number]))
    expect(numbers).toEqual(numbers.map((_, at) => at + 1))
  })

  it('keeps class defaults to light and ceiling notes and figures to the two rare ceilings', () => {
    for (const note of table.notes) {
      const rare = note.kind === 'disorder' || note.kind === 'survival'
      expect(note.value !== null, labelOf(note)).toBe(rare)
      expect(note.classDefault && rare, labelOf(note)).toBe(false)
    }
  })

  it('calls a note a class default exactly when none of its crops overrides that note', () => {
    const overrideOf = { light: 'dliCaveat', ceiling: 'maxRsrNote' } as const
    for (const note of table.notes) {
      if (note.kind !== 'light' && note.kind !== 'ceiling') continue
      for (const { id } of note.crops) {
        const overridden = rowOf(id)[17]?.[overrideOf[note.kind]] !== undefined
        expect(note.classDefault, `${id} on ${labelOf(note)}`).toBe(!overridden)
      }
    }
  })

  it('points a row only at numbered notes that list it, and lists only the rows that point', () => {
    const byNumber = new Map<number, CropLightNote>()
    for (const note of table.notes) if (note.number !== null) byNumber.set(note.number, note)
    for (const row of table.rows) {
      expect(new Set(row.noteNumbers).size, row.id).toBe(row.noteNumbers.length)
      for (const number of row.noteNumbers) {
        const note = byNumber.get(number)
        expect(note, `${row.id} points at note ${number}`).toBeDefined()
        expect(note?.classDefault, `${row.id} points at note ${number}`).toBe(false)
        expect(
          note?.crops.map((crop) => crop.id),
          `${row.id} on note ${number}`,
        ).toContain(row.id)
      }
    }
    for (const [number, note] of byNumber) {
      const pointing = table.rows.filter((row) => row.noteNumbers.includes(number))
      expect(note.crops.map((crop) => crop.id).sort(), labelOf(note)).toEqual(
        pointing.map((row) => row.id).sort(),
      )
      expect(note.crops.map((crop) => crop.name).sort(), labelOf(note)).toEqual(
        pointing.map((row) => row.name).sort(),
      )
    }
  })

  it('puts every row on one light note and one ceiling note, each with its own words', () => {
    for (const row of table.rows) {
      expect(
        notesOn(row.id, 'light').map((note) => note.text),
        row.id,
      ).toEqual([row.lightNote])
      expect(
        notesOn(row.id, 'ceiling').map((note) => note.text),
        row.id,
      ).toEqual([row.ceilingNote])
    }
  })

  it('puts a row on a disorder or survival note exactly when it has that ceiling', () => {
    for (const row of table.rows) {
      const ceilings = [
        ['disorder', row.disorderCeiling],
        ['survival', row.survivalCeiling],
      ] as const
      for (const [kind, value] of ceilings) {
        expect(
          notesOn(row.id, kind).map((note) => note.value),
          `${row.id} ${kind}`,
        ).toEqual(value === null ? [] : [value])
      }
    }
  })

  it('prints a class row the basis of its own record as the light note', () => {
    const wrong = CATALOG.filter(({ row: source, crop }) => {
      const printed = printedRowOf(source[0])
      const record = crop.light.dliMinMolM2Day
      return (
        printed.lightBasis === 'class' &&
        !(record.provenance === 'inferred' && printed.lightNote === record.basis)
      )
    })
    expect(wrong.map(({ row }) => row[0])).toEqual([])
  })

  it('shares one disorder note of 17 between head lettuce and leaf lettuce', () => {
    const head = notesOn('lettuce-head', 'disorder')
    const leaf = notesOn('lettuce-leaf', 'disorder')
    expect(head).toHaveLength(1)
    expect(leaf).toHaveLength(1)
    expect(head[0]).toBe(leaf[0])
    expect(head[0]?.value).toBe(17)
    expect(head[0]?.crops.map((crop) => crop.id)).toContain('lettuce-leaf')
    expect(printedRowOf('lettuce-head').disorderCeiling).toBe(17)
    expect(printedRowOf('lettuce-leaf').disorderCeiling).toBe(17)
  })

  it('gives wild ginger the one survival note, of 36.4', () => {
    const notes = notesOn('wild-ginger', 'survival')
    expect(notes).toHaveLength(1)
    expect(notes[0]?.value).toBe(36.4)
    expect(notes[0]?.crops.map((crop) => crop.id)).toEqual(['wild-ginger'])
  })
})

/**
 * A small RFC 4180 reader: quoted fields, doubled quotes inside them, and commas or line breaks
 * inside quotes. The last record may lack its line break, as the RFC allows, and a quote left open
 * at the end of the text throws
 */
const parseCsv = (text: string): string[][] => {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at)
    if (quoted) {
      if (char !== '"') field += char
      else if (text.charAt(at + 1) === '"') {
        field += '"'
        at += 1
      } else quoted = false
    } else if (char === '"') quoted = true
    else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else field += char
  }
  if (quoted) throw new Error('the text ends inside a quoted field')
  if (field !== '' || record.length > 0) records.push([...record, field])
  return records
}

/** A record keyed by the header's column names */
const keyed = (
  header: readonly string[],
  record: readonly string[] = [],
): Record<string, string | undefined> =>
  Object.fromEntries(header.map((name, at) => [name, record[at]]))

describe('crop light table: the CSV', () => {
  const csv = cropLightCsv(table)

  // read in each test, so a file the reader can't take fails the tests that need it and no others
  const read = () => {
    const [header = [], ...records] = parseCsv(csv)
    return { header, records, cells: records.map((record) => keyed(header, record)) }
  }

  it('reads a quoted field the way RFC 4180 describes', () => {
    expect(parseCsv('a,"b,""c"""\n"d\ne",\n')).toEqual([
      ['a', 'b,"c"'],
      ['d\ne', ''],
    ])
    expect(parseCsv('a,b')).toEqual([['a', 'b']])
    expect(() => parseCsv('a,"b')).toThrow()
  })

  it('ends with a newline and holds one line per crop under the header', () => {
    // no note holds a line break, so a plain split counts the records. A note that gains one fails
    // here, and the tests below say whether the file is still sound
    expect(csv.endsWith('\n')).toBe(true)
    const lines = csv.split('\n')
    expect(lines.pop()).toBe('')
    expect(lines).toHaveLength(table.rows.length + 1)
  })

  it('gives the header and every record the same number of fields', () => {
    const { header, records } = read()
    expect(records).toHaveLength(table.rows.length)
    expect(new Set(header).size).toBe(header.length)
    expect(records.filter((record) => record.length !== header.length).map((r) => r[0])).toEqual([])
  })

  it('lists the ids in table order', () => {
    expect(read().cells.map((cells) => cells.id)).toEqual(table.rows.map((row) => row.id))
  })

  it('spells broccoli the way the table does', () => {
    expect(read().cells.find((cells) => cells.id === 'broccoli')).toMatchObject({
      shade_ceiling_percent: '30',
      ceiling_tier: 'C',
      ceiling_basis: 'own',
      light_tier: 'C',
      light_basis: 'class',
      maturity_days: '70',
      maturity_counted_from: 'transplant',
    })
  })

  it('reads every row back as the table holds it, notes included', () => {
    const { cells } = read()
    for (const [at, row] of table.rows.entries()) {
      expect(cells[at], row.id).toMatchObject({
        id: row.id,
        crop: row.name,
        other_names: row.otherNames.join('|'),
        class: CLASS_NAME[row.dliClass],
        light_floor_mol_m2_d: String(row.floor),
        target_low_mol_m2_d: String(row.targetLow),
        target_high_mol_m2_d: String(row.targetHigh),
        light_tier: row.lightTier,
        light_basis: row.lightBasis,
        light_citations: row.lightCitations.join(' '),
        light_note: row.lightNote,
        shade_ceiling_percent: String(Math.round(row.ceiling * 100)),
        ceiling_tier: row.ceilingTier,
        ceiling_basis: row.ceilingBasis,
        ceiling_citations: row.ceilingCitations.join(' '),
        ceiling_note: row.ceilingNote,
      })
    }
  })

  it('quotes a cell that holds a comma, a quote or a line break', () => {
    // each awkward character sits in a cell of its own, so none can hide behind another
    const odd = {
      ...printedRowOf('broccoli'),
      otherNames: ['x,y'],
      lightNote: 'one\ntwo',
      ceilingNote: 'a "quoted" word',
    }
    const parsed = parseCsv(cropLightCsv({ ...table, rows: [odd] }))
    const [header = [], record = []] = parsed
    expect(parsed).toHaveLength(2)
    expect(record).toHaveLength(header.length)
    expect(keyed(header, record)).toMatchObject({
      other_names: 'x,y',
      light_note: 'one\ntwo',
      ceiling_note: 'a "quoted" word',
    })
  })
})
