import type { DataTier } from '../../types/evidence'
import { citedInferred, citedVerbatim, unsourcedClaim } from '../../types/cited'
import type { NonEmpty, SourcedCited } from '../../types/cited'
import type { CitationId } from '../../types/citation-ids.generated'
import type { PlantingRole } from '../../types/garden'
import type { CropId } from '../../types/ids'
import { wildlifeOf } from './wildlife'
import type {
  CanopyShape,
  Crop,
  DliClass,
  DtmReference,
  EcocropEnvelope,
  LaubCropGroup,
  LifeCycle,
  PerennialHarvest,
  PlantHabit,
  SupportRequirement,
} from '../../types/crop'
import type {
  Celsius,
  DayOfYear,
  Days,
  DegreeDaysC,
  Fraction,
  Meters,
  Millimeters,
  MolPerM2Day,
  PhUnits,
} from '../../types/units'

// re-exported so every existing importer keeps working; it lives in its own leaf module because
// the catalogue generator reads it in plain Node, and this file's runtime imports defeat that
import { CATALOG_PROVENANCE } from './provenance'

export { CATALOG_PROVENANCE }

export type ThermalArchetype =
  | 'cool'
  | 'warm'
  | 'hot'
  | 'hardy-perennial'
  | 'temperate-tree'
  | 'subtropical'
  | 'cool-perennial'

export interface ArchetypeSpec {
  readonly temperatureC: readonly [number, number, number, number]
  readonly rainfallMm: readonly [number, number, number, number]
  readonly cycleDays: readonly [number, number]
  readonly gddBaseC: number
  readonly gddUpperCutoffC: number | null
  readonly window: readonly [number, number]
  readonly minSoilTempC: number
  readonly frostOffsetDays: number
  readonly koppenCodes: readonly string[]
  readonly lifeCycle: LifeCycle
}

const TEMPERATE_KOPPEN = ['Cfa', 'Cfb', 'Csa', 'Csb', 'Dfa', 'Dfb', 'Dwa', 'Dwb']
const WARM_KOPPEN = ['Cfa', 'Cfb', 'Csa', 'Csb', 'Cwa', 'Dfa', 'Dfb', 'BSh', 'BSk']
const HOT_KOPPEN = ['Cfa', 'Csa', 'Cwa', 'Aw', 'Am', 'BSh']

export const ARCHETYPES: Readonly<Record<ThermalArchetype, ArchetypeSpec>> = {
  cool: {
    temperatureC: [2, 10, 20, 30],
    rainfallMm: [300, 500, 1200, 2500],
    cycleDays: [45, 130],
    gddBaseC: 4.4,
    gddUpperCutoffC: null,
    window: [3, 6],
    minSoilTempC: 5,
    frostOffsetDays: -14,
    koppenCodes: TEMPERATE_KOPPEN,
    lifeCycle: 'annual',
  },
  warm: {
    temperatureC: [8, 18, 27, 35],
    rainfallMm: [400, 600, 1400, 2800],
    cycleDays: [55, 150],
    gddBaseC: 10,
    gddUpperCutoffC: 30,
    window: [5, 9],
    minSoilTempC: 13,
    frostOffsetDays: 7,
    koppenCodes: WARM_KOPPEN,
    lifeCycle: 'annual',
  },
  hot: {
    temperatureC: [12, 22, 32, 40],
    rainfallMm: [400, 600, 1400, 2800],
    cycleDays: [70, 180],
    gddBaseC: 12.8,
    gddUpperCutoffC: 35,
    window: [6, 9],
    minSoilTempC: 18,
    frostOffsetDays: 14,
    koppenCodes: HOT_KOPPEN,
    lifeCycle: 'annual',
  },
  'hardy-perennial': {
    temperatureC: [0, 12, 24, 34],
    rainfallMm: [400, 600, 1500, 3000],
    cycleDays: [150, 365],
    gddBaseC: 5,
    gddUpperCutoffC: null,
    window: [4, 10],
    minSoilTempC: 5,
    frostOffsetDays: -21,
    koppenCodes: TEMPERATE_KOPPEN,
    lifeCycle: 'perennial',
  },
  'cool-perennial': {
    temperatureC: [-2, 8, 20, 30],
    rainfallMm: [400, 600, 1600, 3000],
    cycleDays: [120, 365],
    gddBaseC: 4.4,
    gddUpperCutoffC: null,
    window: [4, 9],
    minSoilTempC: 4,
    frostOffsetDays: -28,
    koppenCodes: TEMPERATE_KOPPEN,
    lifeCycle: 'perennial',
  },
  'temperate-tree': {
    temperatureC: [-1, 13, 25, 35],
    rainfallMm: [450, 700, 1500, 2600],
    cycleDays: [180, 365],
    gddBaseC: 5,
    gddUpperCutoffC: null,
    window: [4, 10],
    minSoilTempC: 5,
    frostOffsetDays: -30,
    koppenCodes: TEMPERATE_KOPPEN,
    lifeCycle: 'woody-perennial',
  },
  subtropical: {
    temperatureC: [8, 18, 30, 40],
    rainfallMm: [400, 700, 1600, 3000],
    cycleDays: [180, 365],
    gddBaseC: 10,
    gddUpperCutoffC: null,
    window: [3, 11],
    minSoilTempC: 12,
    frostOffsetDays: 14,
    koppenCodes: HOT_KOPPEN,
    lifeCycle: 'woody-perennial',
  },
}

export interface HabitSpec {
  readonly canopyShape: CanopyShape
  readonly leafAreaIndex: number
  readonly lightExtinctionK: number
  readonly canopyBaseHeightM: number
  readonly support: SupportRequirement
  readonly deciduous: boolean
}

export const HABITS: Readonly<Record<PlantHabit, HabitSpec>> = {
  rosette: {
    canopyShape: 'flat-disc',
    leafAreaIndex: 2.5,
    lightExtinctionK: 0.8,
    canopyBaseHeightM: 0,
    support: 'none',
    deciduous: false,
  },
  'upright-herb': {
    canopyShape: 'cylinder',
    leafAreaIndex: 2.2,
    lightExtinctionK: 0.55,
    canopyBaseHeightM: 0.05,
    support: 'none',
    deciduous: false,
  },
  bush: {
    canopyShape: 'hemisphere',
    leafAreaIndex: 3,
    lightExtinctionK: 0.6,
    canopyBaseHeightM: 0.1,
    support: 'none',
    deciduous: false,
  },
  'vining-ground': {
    canopyShape: 'flat-disc',
    leafAreaIndex: 3.5,
    lightExtinctionK: 0.8,
    canopyBaseHeightM: 0,
    support: 'none',
    deciduous: false,
  },
  'vining-trellised': {
    canopyShape: 'cylinder',
    leafAreaIndex: 3.2,
    lightExtinctionK: 0.65,
    canopyBaseHeightM: 0.2,
    support: 'trellis',
    deciduous: false,
  },
  caned: {
    canopyShape: 'vase',
    leafAreaIndex: 3,
    lightExtinctionK: 0.6,
    canopyBaseHeightM: 0.3,
    support: 'trellis',
    deciduous: true,
  },
  'columnar-tree': {
    canopyShape: 'columnar',
    leafAreaIndex: 3.5,
    lightExtinctionK: 0.5,
    canopyBaseHeightM: 0.8,
    support: 'stake',
    deciduous: true,
  },
  'vase-tree': {
    canopyShape: 'vase',
    leafAreaIndex: 3.5,
    lightExtinctionK: 0.55,
    canopyBaseHeightM: 1,
    support: 'none',
    deciduous: true,
  },
  'spreading-tree': {
    canopyShape: 'spreading',
    leafAreaIndex: 4,
    lightExtinctionK: 0.55,
    canopyBaseHeightM: 1.2,
    support: 'none',
    deciduous: true,
  },
  groundcover: {
    canopyShape: 'flat-disc',
    leafAreaIndex: 2.8,
    lightExtinctionK: 0.75,
    canopyBaseHeightM: 0,
    support: 'none',
    deciduous: false,
  },
  'clumping-grass': {
    canopyShape: 'cylinder',
    leafAreaIndex: 3,
    lightExtinctionK: 0.35,
    canopyBaseHeightM: 0,
    support: 'none',
    deciduous: false,
  },
  rhizomatous: {
    canopyShape: 'flat-disc',
    leafAreaIndex: 3,
    lightExtinctionK: 0.7,
    canopyBaseHeightM: 0,
    support: 'none',
    deciduous: false,
  },
}

/**
 * The canopy numbers above feed the water model's basal crop coefficient (`canopyCoverFromLai`
 * in `water.ts`, after FAO-56 chapter 9) and the shade one crop casts on another. FAO-56 fixes
 * the extinction coefficient at 0.7 for every crop; the per-habit `lightExtinctionK` and
 * `leafAreaIndex` here are this app's own figures, set so that a rosette closes its canopy and
 * a clumping grass lets light through, and no source tabulates them. Declared so the gap shows
 * on the sources step (Decision Record 23)
 */
export const HABIT_CANOPY_CLAIM = unsourcedClaim(
  HABITS,
  'Leaf area index and light extinction coefficient per plant habit are this app’s own figures: FAO-56 chapter 9 derives the basal crop coefficient from leaf area with a single 0.7 extinction coefficient, and no source in the corpus tabulates either value by habit',
)

export interface DliClassSpec {
  readonly minMolM2Day: number | null
  readonly targetLowMolM2Day: number | null
  readonly targetHighMolM2Day: number | null
  /** Conservative end of the Decision Record 6 range, so the ceiling never over-promises */
  readonly maxDesignRsr: number
  /**
   * The ceiling's own evidence tier, which is a different question from the DLI figures' tier
   * the row column carries. Zhang et al. 2025 fit a segmented regression in the quantity this
   * ceiling is written in, so the two classes it covers are B, and Widmer et al. 2026 measured
   * strawberry under cover, so strawberry is B. Every other ceiling is this app's own band, so
   * it is C and renders as an inference
   */
  readonly maxDesignRsrTier: DataTier
  readonly maxDesignRsrCitations: NonEmpty<CitationId>
  /** Rendered beside the ceiling: the basis on an inference, the caveat on a verbatim record */
  readonly maxDesignRsrNote: string
}

const LAUB_CEILING: NonEmpty<CitationId> = ['laub2022-shade-meta']

const RSR_CLASS_BASIS =
  'The shade ceiling is the conservative end of this app’s own range for the crop, set below the shade the cited meta-analysis classes as tolerable. No shade trial was run on this crop'

const RSR_BERRY_BASIS =
  'This app’s own conservative bound for a class that spans cane fruit, tree fruit and coffee, none of which has a shade trial in this corpus. Laub et al. 2022 class berries as benefiting from shade to 55 percent RSR, so this ceiling sits well inside the published range'

const RSR_SEGMENTED_BASIS =
  'Zhang et al. 2025, a meta-analysis over 20 countries, fit a segmented regression on shading rate: below 20 percent shading, yield shows no statistically significant difference from the control (p = 0.084), and from 20 to 30 percent yield is lower (p < 0.01). The paper recommends that shading from PV systems "should preferably not exceed 20%". The regression pools crops and resolves none of them on its own'

const RSR_STRAWBERRY_BASIS =
  'Widmer et al. 2026 recommend a minimum daily light integral of 25 mol/m2/d for strawberry, which "corresponded to an estimated total shading of 10-30%, depending on the type of cover". The ceiling is the conservative end of that range'

/** Decision Record section 6. Ranges are collapsed to their conservative bound */
export const DLI_CLASSES: Readonly<Record<DliClass, DliClassSpec>> = {
  'understory-herbs': {
    minMolM2Day: 3,
    targetLowMolM2Day: 4,
    targetHighMolM2Day: 10,
    maxDesignRsr: 0.6,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'leafy-greens': {
    minMolM2Day: 6,
    targetLowMolM2Day: 12,
    targetHighMolM2Day: 17,
    maxDesignRsr: 0.4,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'forages-c3-pasture': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.45,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'cane-bush-berries': {
    minMolM2Day: 15,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.3,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_BERRY_BASIS,
  },
  strawberry: {
    minMolM2Day: 25,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    // 0.10 is the conservative end of Widmer's own 10 to 30 percent, and it is the one place
    // this number is kept: no row overrides it
    maxDesignRsr: 0.1,
    maxDesignRsrTier: 'B',
    maxDesignRsrCitations: ['widmer-strawberry-dli'],
    maxDesignRsrNote: RSR_STRAWBERRY_BASIS,
  },
  brassicas: {
    minMolM2Day: null,
    targetLowMolM2Day: 12,
    targetHighMolM2Day: 17,
    maxDesignRsr: 0.3,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'root-tuber': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  solanaceae: {
    minMolM2Day: 10,
    targetLowMolM2Day: 20,
    targetHighMolM2Day: 30,
    maxDesignRsr: 0.2,
    maxDesignRsrTier: 'B',
    maxDesignRsrCitations: ['zhang2025-tipping-points', 'laub2022-shade-meta'],
    maxDesignRsrNote: RSR_SEGMENTED_BASIS,
  },
  cucurbits: {
    minMolM2Day: null,
    targetLowMolM2Day: 20,
    targetHighMolM2Day: 30,
    maxDesignRsr: 0.2,
    maxDesignRsrTier: 'B',
    maxDesignRsrCitations: ['zhang2025-tipping-points', 'laub2022-shade-meta'],
    maxDesignRsrNote: RSR_SEGMENTED_BASIS,
  },
  alliums: {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'grain-legumes': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.1,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'c3-cereals': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
  'maize-c4': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.1,
    maxDesignRsrTier: 'C',
    maxDesignRsrCitations: LAUB_CEILING,
    maxDesignRsrNote: RSR_CLASS_BASIS,
  },
}

/** 0 = no documented shade tolerance, 1 = tolerates 30-50 %, 2 = frequently improved in heat */
export type ShadeFlag = 0 | 1 | 2

export interface CropOverrides {
  readonly life?: LifeCycle
  /** Set only where the catalogue curates the species for a function */
  readonly role?: PlantingRole
  /** FAO-56 Table 22 maximum effective rooting depth, midpoint of the published range */
  readonly zr?: number
  /** FAO-56 Table 22 soil-water depletion fraction p */
  readonly p?: number
  readonly coldC?: number
  readonly chillHours?: number
  /** Recorded wild only where winters are cold; see `Crop.coldWinterOnly` */
  readonly coldWinterOnly?: true
  readonly window?: readonly [number, number]
  readonly gddBase?: number
  readonly gddUpper?: number | null
  readonly gddToMaturity?: number
  readonly dtmRef?: DtmReference
  readonly nfix?: true
  readonly succession?: number
  readonly harvestDays?: number
  /**
   * A perennial's picking season from an extension harvest calendar, read against the source
   * region's median last spring freeze: either so many days before or after that freeze, with
   * `harvestDays` as how long picking lasts, or picked right through the growing season where
   * the source says so. Absent, the crop keeps the catalogue growing-window dating
   */
  readonly harvest?:
    | { readonly afterFreezeDays: number; readonly citations: NonEmpty<CitationId> }
    | { readonly wholeSeason: true; readonly citations: NonEmpty<CitationId> }
  readonly ph?: readonly [number, number, number, number]
  /** Works the envelope trapezoids are transcribed from, where they are not the default */
  readonly envCitations?: readonly CitationId[]
  readonly temp?: readonly [number, number, number, number]
  readonly rain?: readonly [number, number, number, number]
  readonly cycle?: readonly [number, number]
  readonly koppen?: readonly string[]
  readonly ceiling?: number
  readonly maxRsr?: number
  readonly maxRsrTier?: DataTier
  /** What stands behind a row's own ceiling, where the class note is untrue of it */
  readonly maxRsrNote?: string
  readonly yearsToMature?: number
  readonly support?: SupportRequirement
  readonly shape?: CanopyShape
  readonly lai?: number
  readonly k?: number
  readonly deciduous?: boolean
  readonly canopyBase?: number
  readonly rowCm?: number
  readonly betweenCm?: number
  readonly frostOffset?: number
  readonly minSoilTempC?: number
  readonly sow?: readonly [number, number]
  readonly fallHarvest?: boolean
  readonly synonyms?: readonly string[]
  readonly gbif?: string
  readonly qid?: string
  /**
   * Set only where a cited work prints this crop's own figure. Absent is the ordinary case and
   * means the row cites nothing for its light numbers, which is true of 198 of the 209 rows
   */
  readonly dliCitations?: NonEmpty<CitationId>
  /** What the figure is in the cited work, rendered beside the number in place of the default */
  readonly dliCaveat?: string
  /**
   * The season-mean DLI at which a cited work measured this crop's own survival fall away: a
   * REFUSAL in the light gate (`dli-survival-ceiling`), unlike the advisory `ceiling` above. Set
   * only where such a figure exists, which today is wild ginger alone, always together with
   * `survivalCeilingTier`, `survivalCeilingCitations` and `survivalCeilingNote`
   */
  readonly survivalCeiling?: number
  readonly survivalCeilingTier?: DataTier
  readonly survivalCeilingCitations?: NonEmpty<CitationId>
  /** What stands behind the figure: the cited work's design and what else moved besides light */
  readonly survivalCeilingNote?: string
  /**
   * Why this crop's Laub group is an analogy and no membership, carried onto the yield curve's
   * own record and into the yield caveats. Set where the group holds no comparable
   * crop, where the harvested organ differs from the group's trials, or where the
   * meta-analysis excluded the species outright
   */
  readonly laubNote?: string
}

/**
 * One catalogue row. Positional and compact on purpose: 150+ rows of named
 * objects would triple the shipped bytes for no added information
 */
export type CropRow = readonly [
  id: string,
  acceptedName: string,
  family: string,
  commonNames: string,
  laubGroup: LaubCropGroup,
  dliClass: DliClass,
  habit: PlantHabit,
  archetype: ThermalArchetype,
  dliMin: number,
  dliTargetLow: number,
  dliTargetHigh: number,
  tier: DataTier,
  shade: ShadeFlag,
  daysToMaturity: number,
  spacingCm: number,
  heightM: number,
  widthM: number,
  overrides?: CropOverrides,
]

const DEFAULT_PH: readonly [number, number, number, number] = [5, 6, 7.2, 8]

/**
 * Mean degree-days accumulated per calendar day in the archetype's own season,
 * used to convert a catalogue days-to-maturity into a transferable GDD target.
 * This is an explicit Tier C derivation, not a measured phenology model
 */
const GDD_PER_DAY: Readonly<Record<ThermalArchetype, number>> = {
  cool: 9,
  warm: 12,
  hot: 14,
  'hardy-perennial': 11,
  'cool-perennial': 10,
  'temperate-tree': 11,
  subtropical: 14,
}

const ROOT_DEFAULT_BY_CLASS: Readonly<Record<DliClass, readonly [number, number]>> = {
  'understory-herbs': [0.4, 0.4],
  'leafy-greens': [0.4, 0.3],
  'forages-c3-pasture': [0.6, 0.55],
  'cane-bush-berries': [0.9, 0.5],
  strawberry: [0.3, 0.2],
  brassicas: [0.55, 0.45],
  'root-tuber': [0.6, 0.35],
  solanaceae: [0.9, 0.4],
  cucurbits: [0.9, 0.5],
  alliums: [0.4, 0.3],
  'grain-legumes': [0.7, 0.45],
  'c3-cereals': [1.2, 0.55],
  'maize-c4': [1, 0.5],
}

const stratumFor = (depthM: number): 'shallow' | 'medium' | 'deep' =>
  depthM < 0.5 ? 'shallow' : depthM <= 1 ? 'medium' : 'deep'

/**
 * What a Tier C light figure is (Decision Record 23): the crop's conventional garden sun label,
 * converted into a band by this app's own arithmetic and set beside the crops in its class that
 * do have a published figure. The two cited extension documents print a band for five of the
 * 209 rows and for none of the rest, so the rest cite nothing and say so
 */
const DLI_CLASS_BASIS =
  'This app’s own figure, set by analogy with the crops in its class for which a published DLI exists. No cited work measured it for this crop, and the sources step lists it as a gap. Trust the ordering it gives, and treat the number itself as provisional'

/** The few rows whose figure a cited table prints for the crop itself, named in the row comment */
const DLI_PRINTED_BASIS =
  'The figure is printed for this crop in the cited table. That table is greenhouse guidance and cites no trial of its own for it'

const COLD_FLOOR_BASIS =
  'a curated cold-hardiness floor with ECOCROP’s killing-temperature and envelope fields as the cited basis, no per-crop trial'

/**
 * Decision Record 7: most per-crop DLI values are Tier C class-level inferences, so tier C is
 * expressed as `inferred` and only A and B rows may claim a value read straight off a source.
 * The note travels either way, as the basis of an inference and as the caveat of a verbatim
 * record, because both are what the UI prints beside the number
 */
const sourced = <T>(
  value: T,
  tier: DataTier,
  ids: NonEmpty<CitationId>,
  note: string,
): SourcedCited<T> =>
  tier === 'C' ? citedInferred(value, ids, note) : citedVerbatim(value, tier, ids, note)

/**
 * The ceiling is this app's own figure and the rule it drives is a monthly one, because a month is
 * the finest the bake resolves. A three-day form can't be evaluated: the counter adds whole months,
 * so it reads 0 or at least 28
 */
const TIPBURN_CEILING_CLAIM =
  'Cornell’s CEA lettuce handbook reports tipburn as light-limited at 12 to 17 mol/m2/d depending on cultivar and on airflow, both of which a greenhouse controls and a field bed does not, and Both et al. 1997 report 17 as the level that produced a marketable head with a downward fan preventing tipburn. A three-day rule would be this app’s own, with no source, and monthly light cannot test one, so what is shown is whether a whole month sits above the ceiling'

export const expandRow = (row: CropRow): Crop => {
  const [
    id,
    acceptedName,
    family,
    commonNames,
    laubGroup,
    dliClass,
    habit,
    archetype,
    dliMin,
    dliTargetLow,
    dliTargetHigh,
    tier,
    shade,
    daysToMaturity,
    spacingCm,
    heightM,
    widthM,
    overrides = {},
  ] = row

  const arch = ARCHETYPES[archetype]
  const habitSpec = HABITS[habit]
  const classSpec = DLI_CLASSES[dliClass]
  const rootDefault = ROOT_DEFAULT_BY_CLASS[dliClass]

  const gddBaseC = overrides.gddBase ?? arch.gddBaseC
  const gddUpper = overrides.gddUpper === undefined ? arch.gddUpperCutoffC : overrides.gddUpper
  const gddToMaturity =
    overrides.gddToMaturity ?? Math.round(daysToMaturity * GDD_PER_DAY[archetype])
  const window = overrides.window ?? arch.window
  const zr = overrides.zr ?? rootDefault[0]
  const maxDesignRsr = overrides.maxRsr ?? classSpec.maxDesignRsr
  const ceiling = overrides.ceiling ?? null
  // no default citation. Purdue HO-238-B-W and VCE SPES-720NP print a band for five rows of
  // the catalogue, so the rows they cover name them and every other row names nothing, which is
  // the state a reader can check (Decision Record 23)
  const dliCitations = overrides.dliCitations ?? null
  const dliNote =
    overrides.dliCaveat ?? (dliCitations === null ? DLI_CLASS_BASIS : DLI_PRINTED_BASIS)
  if (dliCitations === null && tier !== 'C') {
    throw new Error(`${id} claims tier ${tier} for its light figures and cites nothing for them`)
  }
  const dliCited = (value: number): SourcedCited<MolPerM2Day> =>
    dliCitations === null
      ? citedInferred(value as MolPerM2Day, [], dliNote)
      : sourced(value as MolPerM2Day, tier, dliCitations, dliNote)
  const survivalCeiling = overrides.survivalCeiling ?? null
  const survivalCeilingTier = overrides.survivalCeilingTier ?? null
  const survivalCeilingCitations = overrides.survivalCeilingCitations ?? null
  const survivalCeilingNote = overrides.survivalCeilingNote ?? null
  if (
    survivalCeiling !== null &&
    (survivalCeilingTier === null ||
      survivalCeilingCitations === null ||
      survivalCeilingNote === null)
  ) {
    throw new Error(`${id} sets a survival ceiling and is missing its tier, citations or note`)
  }
  const survivalCeilingCited: SourcedCited<MolPerM2Day> | null =
    survivalCeiling === null ||
    survivalCeilingTier === null ||
    survivalCeilingCitations === null ||
    survivalCeilingNote === null
      ? null
      : sourced(
          survivalCeiling as MolPerM2Day,
          survivalCeilingTier,
          survivalCeilingCitations,
          survivalCeilingNote,
        )
  const lifeCycle = overrides.life ?? arch.lifeCycle
  const perennial = lifeCycle === 'perennial' || lifeCycle === 'woody-perennial'
  const perennialHarvest: PerennialHarvest | null =
    overrides.harvest === undefined
      ? null
      : 'wholeSeason' in overrides.harvest
        ? { kind: 'whole-season', citations: overrides.harvest.citations }
        : {
            kind: 'after-last-freeze',
            afterFreezeDays: overrides.harvest.afterFreezeDays,
            citations: overrides.harvest.citations,
          }

  const envelope: EcocropEnvelope = {
    temperatureC: trapezoid(overrides.temp ?? arch.temperatureC),
    annualRainfallMm: trapezoid(overrides.rain ?? arch.rainfallMm),
    soilPh: trapezoid(overrides.ph ?? DEFAULT_PH),
    cycleLengthDays: {
      min: ((overrides.cycle ?? arch.cycleDays)[0] ?? 60) as Days,
      max: ((overrides.cycle ?? arch.cycleDays)[1] ?? 200) as Days,
    },
    koppenCodes: overrides.koppen ?? arch.koppenCodes,
    citations: overrides.envCitations ?? ['fao-ecocrop'],
  }

  return {
    id: id as CropId,
    taxonomy: {
      acceptedName,
      family,
      commonNames: commonNames.split('|'),
      synonyms: overrides.synonyms ?? [],
      gbifTaxonKey: overrides.gbif ?? null,
      wikidataQid: overrides.qid ?? null,
    },
    lifeCycle,
    role: overrides.role ?? null,
    wildlife: wildlifeOf(family, laubGroup, overrides.role ?? null),
    laubGroup,
    laubGroupNote: overrides.laubNote ?? null,
    dliClass,
    envelope,
    light: {
      dliMinMolM2Day: dliCited(dliMin),
      dliTargetMolM2Day: dliCited((dliTargetLow + dliTargetHigh) / 2),
      dliMaxBeforeDisorderMolM2Day:
        ceiling === null ? null : unsourcedClaim(ceiling as MolPerM2Day, TIPBURN_CEILING_CLAIM),
      dliMaxBeforeSurvivalLossMolM2Day: survivalCeilingCited,
      maxDesignRsr: sourced(
        maxDesignRsr as Fraction,
        overrides.maxRsrTier ?? classSpec.maxDesignRsrTier,
        classSpec.maxDesignRsrCitations,
        overrides.maxRsrNote ?? classSpec.maxDesignRsrNote,
      ),
      shadeBenefitingWhenWaterLimited: shade === 2,
    },
    thermal: perennial
      ? null
      : {
          gddBaseC: gddBaseC as Celsius,
          gddUpperCutoffC: gddUpper === null ? null : (gddUpper as Celsius),
          gddToMaturity: gddToMaturity as DegreeDaysC,
          daysToMaturity: daysToMaturity as Days,
          dtmReference: overrides.dtmRef ?? 'sow',
        },
    chill:
      overrides.chillHours === undefined
        ? null
        : { metric: 'chilling-hours', amount: overrides.chillHours },
    coldHardinessMinC:
      overrides.coldC === undefined
        ? null
        : sourced(overrides.coldC as Celsius, 'C', ['fao-ecocrop'], COLD_FLOOR_BASIS),
    coldWinterOnly: overrides.coldWinterOnly ?? false,
    footprint: {
      habit,
      canopyShape: overrides.shape ?? habitSpec.canopyShape,
      heightM: dimension(heightM),
      widthM: dimension(widthM),
      canopyBaseHeightM: (overrides.canopyBase ?? habitSpec.canopyBaseHeightM) as Meters,
      leafAreaIndex: overrides.lai ?? habitSpec.leafAreaIndex,
      lightExtinctionK: overrides.k ?? habitSpec.lightExtinctionK,
      deciduous: overrides.deciduous ?? habitSpec.deciduous,
      yearsToMature: perennial ? (overrides.yearsToMature ?? 3) : null,
      support: overrides.support ?? habitSpec.support,
      footprintPolygon: null,
    },
    roots: {
      maxEffectiveDepthM: zr as Meters,
      depletionFraction: (overrides.p ?? rootDefault[1]) as Fraction,
      stratum: stratumFor(zr),
    },
    spacing: {
      inRowCm: overrides.rowCm ?? spacingCm,
      betweenRowsCm: overrides.betweenCm ?? Math.round(spacingCm * 1.5),
      equidistantCm: spacingCm,
    },
    window: { startMonth: window[0] ?? 4, endMonth: window[1] ?? 9 },
    sowWindow:
      overrides.sow === undefined
        ? null
        : {
            earliest: (overrides.sow[0] ?? 1) as DayOfYear,
            latest: (overrides.sow[1] ?? 365) as DayOfYear,
          },
    fallHarvest: overrides.fallHarvest ?? false,
    frostOffsetDays: (overrides.frostOffset ?? arch.frostOffsetDays) as Days,
    minSoilTempC: (overrides.minSoilTempC ?? arch.minSoilTempC) as Celsius,
    harvestDurationDays: (overrides.harvestDays ?? (perennial ? 30 : 14)) as Days,
    perennialHarvest,
    successionIntervalDays:
      overrides.succession === undefined ? null : (overrides.succession as Days),
    nitrogenFixing: overrides.nfix ?? false,
    provenance: CATALOG_PROVENANCE,
  }
}

function trapezoid<T extends number>(
  values: readonly [number, number, number, number],
): { absoluteMin: T; optimumMin: T; optimumMax: T; absoluteMax: T } {
  return {
    absoluteMin: values[0] as T,
    optimumMin: values[1] as T,
    optimumMax: values[2] as T,
    absoluteMax: values[3] as T,
  }
}

function dimension(typicalM: number): {
  minM: Meters
  typicalM: Meters
  maxM: Meters
} {
  return {
    minM: (typicalM * 0.7) as Meters,
    typicalM: typicalM as Meters,
    maxM: (typicalM * 1.4) as Meters,
  }
}

export type { Millimeters, PhUnits }
