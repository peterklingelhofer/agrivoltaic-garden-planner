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
  'They shape the canopy-cover curve of every planting’s water demand and the shade one crop casts on another; the annual water total is set elsewhere',
)

export interface DliClassSpec {
  readonly minMolM2Day: number | null
  readonly targetLowMolM2Day: number | null
  readonly targetHighMolM2Day: number | null
  /** Conservative end of the Decision Record 6 range, so the ceiling never over-promises */
  readonly maxDesignRsr: number
  readonly tier: DataTier
}

/** Decision Record section 6. Ranges are collapsed to their conservative bound */
export const DLI_CLASSES: Readonly<Record<DliClass, DliClassSpec>> = {
  'understory-herbs': {
    minMolM2Day: 3,
    targetLowMolM2Day: 4,
    targetHighMolM2Day: 10,
    maxDesignRsr: 0.6,
    tier: 'C',
  },
  'leafy-greens': {
    minMolM2Day: 6,
    targetLowMolM2Day: 12,
    targetHighMolM2Day: 17,
    maxDesignRsr: 0.4,
    tier: 'A',
  },
  'forages-c3-pasture': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.45,
    tier: 'B',
  },
  'cane-bush-berries': {
    minMolM2Day: 15,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.3,
    tier: 'B',
  },
  strawberry: {
    minMolM2Day: 25,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    tier: 'B',
  },
  brassicas: {
    minMolM2Day: null,
    targetLowMolM2Day: 12,
    targetHighMolM2Day: 17,
    maxDesignRsr: 0.3,
    tier: 'C',
  },
  'root-tuber': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    tier: 'C',
  },
  solanaceae: {
    minMolM2Day: 10,
    targetLowMolM2Day: 20,
    targetHighMolM2Day: 30,
    maxDesignRsr: 0.2,
    tier: 'B',
  },
  cucurbits: {
    minMolM2Day: null,
    targetLowMolM2Day: 20,
    targetHighMolM2Day: 30,
    maxDesignRsr: 0.2,
    tier: 'C',
  },
  alliums: {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    tier: 'C',
  },
  'grain-legumes': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.1,
    tier: 'B',
  },
  'c3-cereals': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.15,
    tier: 'B',
  },
  'maize-c4': {
    minMolM2Day: null,
    targetLowMolM2Day: null,
    targetHighMolM2Day: null,
    maxDesignRsr: 0.1,
    tier: 'A',
  },
}

/** 0 = no documented shade tolerance, 1 = tolerates 30-50 %, 2 = frequently improved in heat */
export type ShadeFlag = 0 | 1 | 2

export interface CropOverrides {
  readonly life?: LifeCycle
  /** Set only where the catalogue curates the species for a function rather than a yield */
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
  readonly ph?: readonly [number, number, number, number]
  /** Works the envelope trapezoids are transcribed from, where they are not the default */
  readonly envCitations?: readonly CitationId[]
  readonly temp?: readonly [number, number, number, number]
  readonly rain?: readonly [number, number, number, number]
  readonly cycle?: readonly [number, number]
  readonly koppen?: readonly string[]
  readonly ceiling?: number
  readonly ceilingDays?: number
  readonly maxRsr?: number
  readonly maxRsrTier?: DataTier
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
  readonly dliCitations?: NonEmpty<CitationId>
  /**
   * What a Tier A or B figure is in the cited trial, where the trial states a level rather
   * than a threshold; rendered beside the number as the verbatim record's caveat
   */
  readonly dliCaveat?: string
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
 * How a Tier C class was assigned (Decision Record 23): from the crop's conventional garden sun
 * label, through this app's own conversion of that label into a light band (docs/04 section
 * 3.3). ECOCROP's light descriptor was never the basis, which is why the class methodology and
 * no ECOCROP entry is cited for a DLI figure
 */
const DLI_CLASS_BASIS =
  'a class-level inference: the class comes from the crop’s garden sun label through this app’s own conversion, and the figure is that class’s range from the cited measurement methodology; no cited work measured it for this crop'

const RSR_CLASS_BASIS =
  'a class-level inference: the shade ceiling is the conservative end of the class’s range in this app’s design record, drawn from the cited meta-analysis and strawberry trial; no shade trial was run on this crop'

const COLD_FLOOR_BASIS =
  'a curated cold-hardiness floor with ECOCROP’s killing-temperature and envelope fields as the cited basis; no per-crop trial'

/**
 * Decision Record 7: most per-crop DLI values are Tier C class-level
 * inferences, so tier C is expressed as `inferred` and only A and B rows may
 * claim a value read straight off a source
 */
const sourced = <T>(
  value: T,
  tier: DataTier,
  ids: NonEmpty<CitationId>,
  basis: string,
  caveat: string | null = null,
): SourcedCited<T> =>
  tier === 'C' ? citedInferred(value, ids, basis) : citedVerbatim(value, tier, ids, caveat)

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
  // the class-range methodology only. ECOCROP left this default on 2026-09-11: it holds no
  // light integral, and no class was ever read from its light descriptor (Decision Record 23)
  const dliCitations: NonEmpty<CitationId> = overrides.dliCitations ?? [
    'torres-purdue-dli-b',
    'stallknecht2025-vce-dli',
  ]
  const lifeCycle = overrides.life ?? arch.lifeCycle
  const perennial = lifeCycle === 'perennial' || lifeCycle === 'woody-perennial'

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
    dliClass,
    envelope,
    light: {
      dliMinMolM2Day: sourced(
        dliMin as MolPerM2Day,
        tier,
        dliCitations,
        DLI_CLASS_BASIS,
        overrides.dliCaveat ?? null,
      ),
      dliTargetMolM2Day: sourced(
        ((dliTargetLow + dliTargetHigh) / 2) as MolPerM2Day,
        tier,
        dliCitations,
        DLI_CLASS_BASIS,
        overrides.dliCaveat ?? null,
      ),
      dliMaxBeforeDisorderMolM2Day:
        ceiling === null
          ? null
          : unsourcedClaim(
              ceiling as MolPerM2Day,
              'The lettuce tipburn ceiling of 17 mol/m2/d sustained beyond three days is carried from this app’s own design record. The Cornell CEA lettuce handbook in the corpus reports tipburn as light-limited, at 12 to 17 mol/m2/d by cultivar and airflow, and states no sustained-days rule, so the three-day form stays unsourced',
            ),
      disorderSustainedDays: (overrides.ceilingDays ?? 3) as Days,
      maxDesignRsr: sourced(
        maxDesignRsr as Fraction,
        overrides.maxRsrTier ?? classSpec.tier,
        ['laub2022-shade-meta', 'widmer-strawberry-dli'],
        RSR_CLASS_BASIS,
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
