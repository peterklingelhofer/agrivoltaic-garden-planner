import type { DerivedCited, InferredCited, MaybeCited, SourcedCited, VerbatimCited } from './cited'
import type { CitationId } from './citation-ids.generated'
import type { Licensed } from './evidence'
import type { PlantingRole } from './garden'
import type { Polygon2D } from './geo'
import type { CropId, CultivarId } from './ids'
import type { GrowingWindow } from './light'
import type { ChillMetric } from './site'
import type {
  Celsius,
  DayOfYear,
  DegreeDaysC,
  Days,
  Fraction,
  Meters,
  Millimeters,
  MolPerM2Day,
  PhUnits,
} from './units'

export type LaubCropGroup =
  | 'berries'
  | 'fruits'
  | 'fruity-vegetables'
  | 'forages'
  | 'leafy-vegetables'
  | 'tubers-root-crops'
  | 'c3-cereals'
  | 'grain-legumes'
  | 'maize-c4'

export type DliClass =
  | 'understory-herbs'
  | 'leafy-greens'
  | 'forages-c3-pasture'
  | 'cane-bush-berries'
  | 'strawberry'
  | 'brassicas'
  | 'root-tuber'
  | 'solanaceae'
  | 'cucurbits'
  | 'alliums'
  | 'grain-legumes'
  | 'c3-cereals'
  | 'maize-c4'

/**
 * How much of a crop's yield rests on an insect visit, in the classes Klein et al. 2007 use.
 * A statement about the CROP's need, not about what it gives back
 */
export type PollinatorDependence = 'essential' | 'great' | 'modest' | 'little' | 'none'

/** What the plant offers flower-visiting insects in return, which is the other direction */
export type PollinatorForage = 'high' | 'some' | 'none'

export interface WildlifeValue {
  readonly dependence: InferredCited<PollinatorDependence>
  readonly forage: InferredCited<PollinatorForage>
}

export type LifeCycle = 'annual' | 'biennial' | 'perennial' | 'woody-perennial'

export interface Trapezoid<T extends number> {
  readonly absoluteMin: T
  readonly optimumMin: T
  readonly optimumMax: T
  readonly absoluteMax: T
}

export interface EcocropEnvelope {
  readonly temperatureC: Trapezoid<Celsius>
  readonly annualRainfallMm: Trapezoid<Millimeters>
  readonly soilPh: Trapezoid<PhUnits>
  readonly cycleLengthDays: { readonly min: Days; readonly max: Days }
  readonly koppenCodes: readonly string[]
  /** The works the trapezoids are transcribed from, so a crop-vs-crop verdict can cite them */
  readonly citations: readonly CitationId[]
}

export type EcocropParameter = 'temperature' | 'rainfall' | 'soil-ph' | 'cycle-length' | 'koppen'

export interface LightRequirement {
  readonly dliMinMolM2Day: SourcedCited<MolPerM2Day>
  readonly dliTargetMolM2Day: SourcedCited<MolPerM2Day>
  readonly dliMaxBeforeDisorderMolM2Day: MaybeCited<MolPerM2Day>
  readonly disorderSustainedDays: Days
  readonly maxDesignRsr: SourcedCited<Fraction>
  readonly shadeBenefitingWhenWaterLimited: boolean
}

export type PlantHabit =
  | 'rosette'
  | 'upright-herb'
  | 'bush'
  | 'vining-ground'
  | 'vining-trellised'
  | 'caned'
  | 'columnar-tree'
  | 'vase-tree'
  | 'spreading-tree'
  | 'groundcover'
  | 'clumping-grass'
  | 'rhizomatous'

export type CanopyShape =
  | 'sphere'
  | 'hemisphere'
  | 'ellipsoid'
  | 'cone'
  | 'cylinder'
  | 'columnar'
  | 'vase'
  | 'spreading'
  | 'flat-disc'
  | 'irregular'

export type SupportRequirement = 'none' | 'stake' | 'cage' | 'trellis' | 'arbor' | 'espalier'

export interface DimensionRange {
  readonly minM: Meters
  readonly typicalM: Meters
  readonly maxM: Meters
}

export interface MatureFootprint {
  readonly habit: PlantHabit
  readonly canopyShape: CanopyShape
  readonly heightM: DimensionRange
  readonly widthM: DimensionRange
  readonly canopyBaseHeightM: Meters
  readonly leafAreaIndex: number
  readonly lightExtinctionK: number
  readonly deciduous: boolean
  readonly yearsToMature: number | null
  readonly support: SupportRequirement
  readonly footprintPolygon: Polygon2D | null
}

export interface RootProfile {
  readonly maxEffectiveDepthM: Meters
  readonly depletionFraction: Fraction
  readonly stratum: 'shallow' | 'medium' | 'deep'
}

export type DtmReference = 'sow' | 'transplant'

export interface ThermalRequirement {
  readonly gddBaseC: Celsius
  readonly gddUpperCutoffC: Celsius | null
  readonly gddToMaturity: DegreeDaysC
  readonly daysToMaturity: Days
  readonly dtmReference: DtmReference
}

export interface ChillRequirement {
  readonly metric: ChillMetric
  readonly amount: number
}

export interface Spacing {
  readonly inRowCm: number
  readonly betweenRowsCm: number
  readonly equidistantCm: number
}

/** Row spacing is a field convention; a bed is planted on an equidistant grid */
export type SpacingBasis = 'equidistant' | 'row'

export interface CropTaxonomy {
  readonly acceptedName: string
  readonly family: string
  readonly commonNames: readonly string[]
  readonly synonyms: readonly string[]
  readonly gbifTaxonKey: string | null
  readonly wikidataQid: string | null
}

export interface Crop {
  readonly id: CropId
  readonly taxonomy: CropTaxonomy
  readonly lifeCycle: LifeCycle
  /** The function the catalogue curates the species for, null when it is grown for its own yield */
  readonly role: PlantingRole | null
  /** What it asks of pollinators and what it offers them, derived in `catalog/wildlife.ts` */
  readonly wildlife: WildlifeValue
  readonly laubGroup: LaubCropGroup
  readonly dliClass: DliClass
  readonly envelope: EcocropEnvelope
  readonly light: LightRequirement
  readonly thermal: ThermalRequirement | null
  readonly chill: ChillRequirement | null
  readonly coldHardinessMinC: MaybeCited<Celsius>
  /**
   * Recorded wild only where winters are cold, so a site whose coldest month stays above the
   * chilling ceiling refuses it (`coldWinterGate`). Set on the woodland and heath perennials
   * whose envelope is an archetype inference: their growing-season temperatures fit a highland
   * tropical site, and nothing else in the envelope says they need the winter they come from
   */
  readonly coldWinterOnly: boolean
  readonly footprint: MatureFootprint
  readonly roots: RootProfile
  readonly spacing: Spacing
  readonly window: GrowingWindow
  readonly sowWindow: { readonly earliest: DayOfYear; readonly latest: DayOfYear } | null
  /**
   * Grown to mature into autumn: sown late enough that the crop finishes at the first fall
   * freeze rather than as early as the spring allows (brussels sprouts, whose sprouts form in
   * cool weather and sweeten after frost). The calendar dates such a crop from the autumn end
   */
  readonly fallHarvest: boolean
  readonly frostOffsetDays: Days
  readonly minSoilTempC: Celsius
  readonly harvestDurationDays: Days
  readonly successionIntervalDays: Days | null
  readonly nitrogenFixing: boolean
  readonly provenance: Licensed
}

export interface Cultivar {
  readonly id: CultivarId
  readonly cropId: CropId
  readonly name: string
  readonly isLandrace: boolean
  readonly regionOfAdaptation: string | null
  readonly thermal: ThermalRequirement
  readonly chill: ChillRequirement | null
  readonly shadeToleranceNote: string | null
  readonly provenance: Licensed
}

export interface LaubAnchor {
  readonly rsr: Fraction
  readonly relativeYield: Fraction
  readonly ciLow: Fraction
  readonly ciHigh: Fraction
}

export interface LaubCoefficients {
  readonly b1PerPercentRsr: number
  readonly b2PerPercentRsrSquared: number
}

/**
 * Laub tabulates 95 % CONFIDENCE intervals in Table S2 and never tabulates
 * prediction intervals, so the field is pinned to the single correct literal
 * rather than left as a union a caller could get wrong
 */
export type LaubIntervalKind = 'confidence-95'

export interface LaubCurve {
  readonly group: LaubCropGroup
  readonly studyCount: number
  readonly peakRsr: Fraction | null
  readonly intervalKind: LaubIntervalKind
  readonly anchors: VerbatimCited<readonly LaubAnchor[]>
  /** Recovered algebraically, published nowhere: the type forbids quoting them as Laub's */
  readonly coefficients: DerivedCited<LaubCoefficients>
}
