import type { CitationId } from '../types/citation-ids.generated'
import { citedReason, type SourcedCited } from '../types/cited'
import type { DliClass, LifeCycle } from '../types/crop'
import type { DataTier } from '../types/evidence'
import { type CropRow, DLI_CLASSES, type DliClassSpec, expandRow } from './catalog/schema'
import { cropLabel } from './crops'

/**
 * The crop light table on the docs site, as data: every row of the catalog with the light
 * figures the app holds for it, which tier each figure is, and the note the app prints beside
 * it. `scripts/render-docs.mjs` turns this into the page and its CSV at build time, through
 * `expandRow`, so the page can't say anything the app doesn't.
 *
 * Grouped by class in the decision record's order, because a Tier C row's figures are set by
 * analogy with its class, and a reader should meet the class before the crop
 */

/**
 * One word after the tier that says where a light figure is from. `class` is this app's own
 * figure, set by analogy with the crops in its class, with no cited work behind it. `printed` is
 * a number a cited work prints for the crop or its group without a trial of its own. `trial` is
 * measured on this crop. `study` is a shade or field study of the crop
 */
export type LightBasis = 'class' | 'printed' | 'trial' | 'study'

/** `own` is this app's bound for the class, `study` a study in the quantity the ceiling uses */
export type CeilingBasis = 'own' | 'study'

/**
 * Days for an annual or biennial, years to full size for a perennial whose row sets them, and
 * `perennial` alone where the row leaves the years to `expandRow`'s default of three, which is a
 * placeholder for the scene's growth and no figure to print
 */
export type CropMaturity =
  | { readonly kind: 'days'; readonly days: number; readonly from: 'sow' | 'transplant' }
  | { readonly kind: 'years'; readonly years: number }
  | { readonly kind: 'perennial' }

export type NoteKind = 'light' | 'ceiling' | 'disorder' | 'survival'

export interface CropLightNote {
  readonly kind: NoteKind
  readonly text: string
  /** The figure the note is about, for the two ceilings that appear on a few crops only */
  readonly value: number | null
  /** True for a class default the page prints once, false for a note that belongs under its crops */
  readonly classDefault: boolean
  /** 1-based among the notes that aren't class defaults, null for a class default */
  readonly number: number | null
  readonly crops: readonly { readonly id: string; readonly name: string }[]
}

export interface CropLightRow {
  readonly id: string
  readonly name: string
  readonly otherNames: readonly string[]
  readonly acceptedName: string
  readonly family: string
  readonly dliClass: DliClass
  readonly lifeCycle: LifeCycle
  readonly floor: number
  readonly targetLow: number
  readonly targetHigh: number
  readonly lightTier: DataTier
  readonly lightBasis: LightBasis
  readonly lightCitations: readonly CitationId[]
  readonly lightNote: string
  /** A fraction of the bed's open-sky light over the season */
  readonly ceiling: number
  readonly ceilingTier: DataTier
  readonly ceilingBasis: CeilingBasis
  readonly ceilingCitations: readonly CitationId[]
  readonly ceilingNote: string
  readonly disorderCeiling: number | null
  readonly survivalCeiling: number | null
  readonly survivalCitations: readonly CitationId[]
  readonly shadeBenefit: boolean
  readonly maturity: CropMaturity
  readonly inRowCm: number
  readonly betweenRowsCm: number
  /** The numbers of this crop's own notes in `CropLightTable.notes` */
  readonly noteNumbers: readonly number[]
}

export interface CropLightClass {
  readonly dliClass: DliClass
  readonly name: string
  readonly spec: DliClassSpec
  readonly rows: readonly CropLightRow[]
}

export interface CropLightTable {
  readonly classes: readonly CropLightClass[]
  /** Every row in page order: class by class, alphabetical within a class */
  readonly rows: readonly CropLightRow[]
  readonly lightTiers: Readonly<Record<DataTier, number>>
  readonly ceilingTiers: Readonly<Record<DataTier, number>>
  readonly notes: readonly CropLightNote[]
}

/** The decision record's names for the classes, in its order */
export const CLASS_NAME: Readonly<Record<DliClass, string>> = {
  'understory-herbs': 'Understory herbs',
  'leafy-greens': 'Leafy greens',
  'forages-c3-pasture': 'Forages and C3 pasture',
  'cane-bush-berries': 'Cane and bush berries',
  strawberry: 'Strawberry',
  brassicas: 'Brassicas',
  'root-tuber': 'Roots and tubers',
  solanaceae: 'Solanaceae',
  cucurbits: 'Cucurbits',
  alliums: 'Alliums',
  'grain-legumes': 'Grain legumes',
  'c3-cereals': 'C3 cereals',
  'corn-c4': 'Corn and other C4 crops',
}

const lightBasisOf = (cited: SourcedCited<number>): LightBasis =>
  cited.provenance === 'inferred'
    ? cited.citations.length === 0
      ? 'class'
      : 'printed'
    : cited.tier === 'A'
      ? 'trial'
      : 'study'

const ceilingBasisOf = (cited: SourcedCited<number>): CeilingBasis =>
  cited.provenance === 'inferred' ? 'own' : 'study'

/** What the app prints beside the figure, read from the same field the DLI evidence panel reads */
const noteOf = citedReason

type NoteDraft = { readonly key: string; readonly note: Omit<CropLightNote, 'number' | 'crops'> }

interface Draft {
  readonly row: Omit<CropLightRow, 'noteNumbers'>
  readonly notes: readonly NoteDraft[]
}

const draft = (row: CropRow): Draft => {
  const crop = expandRow(row)
  const overrides = row[17] ?? {}
  const light = crop.light
  const name = cropLabel(crop)
  const maturity: CropMaturity =
    crop.thermal !== null
      ? { kind: 'days', days: crop.thermal.daysToMaturity, from: crop.thermal.dtmReference }
      : overrides.yearsToMature !== undefined
        ? { kind: 'years', years: overrides.yearsToMature }
        : { kind: 'perennial' }
  const notes: NoteDraft[] = [
    {
      key: `light|${noteOf(light.dliMinMolM2Day)}`,
      note: {
        kind: 'light',
        text: noteOf(light.dliMinMolM2Day),
        value: null,
        classDefault: overrides.dliCaveat === undefined,
      },
    },
    {
      key: `ceiling|${noteOf(light.maxDesignRsr)}`,
      note: {
        kind: 'ceiling',
        text: noteOf(light.maxDesignRsr),
        value: null,
        classDefault: overrides.maxRsrNote === undefined,
      },
    },
  ]
  const disorder = light.dliMaxBeforeDisorderMolM2Day
  if (disorder !== null) {
    notes.push({
      key: `disorder|${String(disorder.value)}|${noteOf(disorder)}`,
      note: {
        kind: 'disorder',
        text: noteOf(disorder),
        value: disorder.value,
        classDefault: false,
      },
    })
  }
  const survival = light.dliMaxBeforeSurvivalLossMolM2Day
  if (survival !== null) {
    notes.push({
      key: `survival|${String(survival.value)}|${noteOf(survival)}`,
      note: {
        kind: 'survival',
        text: noteOf(survival),
        value: survival.value,
        classDefault: false,
      },
    })
  }
  return {
    row: {
      id: crop.id,
      name,
      otherNames: crop.taxonomy.commonNames.slice(1),
      acceptedName: crop.taxonomy.acceptedName,
      family: crop.taxonomy.family,
      dliClass: crop.dliClass,
      lifeCycle: crop.lifeCycle,
      floor: light.dliMinMolM2Day.value,
      targetLow: row[9],
      targetHigh: row[10],
      lightTier: light.dliMinMolM2Day.tier,
      lightBasis: lightBasisOf(light.dliMinMolM2Day),
      lightCitations: light.dliMinMolM2Day.citations,
      lightNote: noteOf(light.dliMinMolM2Day),
      ceiling: light.maxDesignRsr.value,
      ceilingTier: light.maxDesignRsr.tier,
      ceilingBasis: ceilingBasisOf(light.maxDesignRsr),
      ceilingCitations: light.maxDesignRsr.citations,
      ceilingNote: noteOf(light.maxDesignRsr),
      disorderCeiling: disorder === null ? null : disorder.value,
      survivalCeiling: survival === null ? null : survival.value,
      survivalCitations: survival === null ? [] : survival.citations,
      shadeBenefit: light.shadeBenefitingWhenWaterLimited,
      maturity,
      inRowCm: crop.spacing.inRowCm,
      betweenRowsCm: crop.spacing.betweenRowsCm,
    },
    notes,
  }
}

const CLASS_ORDER = Object.keys(DLI_CLASSES) as readonly DliClass[]

const byName = (a: Draft, b: Draft): number => a.row.name.localeCompare(b.row.name, 'en')

export const cropLightTable = (catalog: readonly CropRow[]): CropLightTable => {
  const drafts = CLASS_ORDER.flatMap((dliClass) =>
    catalog
      .filter((row) => row[5] === dliClass)
      .map(draft)
      .sort(byName),
  )
  if (drafts.length !== catalog.length) {
    throw new Error(
      `${String(catalog.length - drafts.length)} catalog rows carry a class CLASS_ORDER doesn't list`,
    )
  }

  // every distinct note once, in the order the page first meets it, with the crops it's on
  const collected = new Map<
    string,
    {
      readonly note: Omit<CropLightNote, 'number' | 'crops'>
      readonly crops: { id: string; name: string }[]
    }
  >()
  for (const { row, notes } of drafts) {
    for (const { key, note } of notes) {
      const entry = collected.get(key) ?? { note, crops: [] }
      entry.crops.push({ id: row.id, name: row.name })
      collected.set(key, entry)
    }
  }
  let next = 1
  const numbered = new Map<string, number | null>()
  const notes: CropLightNote[] = []
  for (const [key, { note, crops }] of collected) {
    const number = note.classDefault ? null : next
    if (number !== null) next += 1
    numbered.set(key, number)
    notes.push({ ...note, number, crops })
  }

  const rows: CropLightRow[] = drafts.map(({ row, notes: own }) => ({
    ...row,
    noteNumbers: own
      .map(({ key }) => numbered.get(key) ?? null)
      .filter((number): number is number => number !== null),
  }))
  const classes: CropLightClass[] = CLASS_ORDER.map((dliClass) => ({
    dliClass,
    name: CLASS_NAME[dliClass],
    spec: DLI_CLASSES[dliClass],
    rows: rows.filter((row) => row.dliClass === dliClass),
  })).filter((entry) => entry.rows.length > 0)

  const tally = (pick: (row: CropLightRow) => DataTier): Record<DataTier, number> => {
    const counts: Record<DataTier, number> = { A: 0, B: 0, C: 0 }
    for (const row of rows) counts[pick(row)] += 1
    return counts
  }
  return {
    classes,
    rows,
    lightTiers: tally((row) => row.lightTier),
    ceilingTiers: tally((row) => row.ceilingTier),
    notes,
  }
}

const CSV_COLUMNS = [
  'id',
  'crop',
  'other_names',
  'botanical_name',
  'family',
  'class',
  'life_cycle',
  'light_floor_mol_m2_d',
  'target_low_mol_m2_d',
  'target_high_mol_m2_d',
  'light_tier',
  'light_basis',
  'light_citations',
  'light_note',
  'shade_ceiling_percent',
  'ceiling_tier',
  'ceiling_basis',
  'ceiling_citations',
  'ceiling_note',
  'disorder_ceiling_mol_m2_d',
  'survival_ceiling_mol_m2_d',
  'shade_benefit_when_hot_and_dry',
  'maturity_days',
  'maturity_counted_from',
  'years_to_full_size',
  'in_row_cm',
  'between_rows_cm',
] as const

const cell = (value: string | number | boolean | null): string => {
  const text =
    value === null ? '' : typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The same rows as a file, one line per crop in page order, the notes included */
export const cropLightCsv = (table: CropLightTable): string => {
  const lines = table.rows.map((row) =>
    [
      row.id,
      row.name,
      row.otherNames.join('|'),
      row.acceptedName,
      row.family,
      CLASS_NAME[row.dliClass],
      row.lifeCycle,
      row.floor,
      row.targetLow,
      row.targetHigh,
      row.lightTier,
      row.lightBasis,
      row.lightCitations.join(' '),
      row.lightNote,
      Math.round(row.ceiling * 100),
      row.ceilingTier,
      row.ceilingBasis,
      row.ceilingCitations.join(' '),
      row.ceilingNote,
      row.disorderCeiling,
      row.survivalCeiling,
      row.shadeBenefit,
      row.maturity.kind === 'days' ? row.maturity.days : null,
      row.maturity.kind === 'days' ? row.maturity.from : null,
      row.maturity.kind === 'years' ? row.maturity.years : null,
      row.inRowCm,
      row.betweenRowsCm,
    ]
      .map(cell)
      .join(','),
  )
  return `${[CSV_COLUMNS.join(','), ...lines].join('\n')}\n`
}
