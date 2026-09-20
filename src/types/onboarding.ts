import type { Banded } from './band'
import type { CitationId } from './citation-ids.generated'
import type { LatLon, Polygon2D } from './geo'
import type { BedId, CropId } from './ids'
import type { BedLight } from './light'
import type { RowGeometry, TrackerConfig } from './pv'
import type {
  Fraction,
  KilowattHours,
  Meters,
  Millimeters,
  MolPerM2Day,
  Ratio,
  SquareMeters,
} from './units'

/** What the user is optimizing for. Weights sum to 1 and are the user's own */
export interface DesignObjective {
  readonly food: number
  readonly energy: number
  readonly water: number
  readonly simplicity: number
}

export type GrowingAmbition = 'leafy-and-herbs' | 'mixed-vegetables' | 'fruiting-and-berries'

export type SiteExposure = 'open' | 'partly-sheltered' | 'overshadowed'

export type MountingPreference = 'overhead-canopy' | 'ground-rows' | 'vertical-bifacial' | 'any'

/** Everything the wizard collects. Every field is answerable without agrivoltaic knowledge */
export interface OnboardingAnswers {
  readonly location: LatLon
  readonly locationLabel: string
  readonly plotWidthM: Meters
  readonly plotDepthM: Meters
  readonly objective: DesignObjective
  readonly ambition: GrowingAmbition
  readonly exposure: SiteExposure
  readonly mounting: MountingPreference
  readonly maxHeightM: Meters | null
  readonly irrigationAvailable: boolean
  readonly experience: 'novice' | 'some' | 'experienced'
  /**
   * The most beds the search may cut the plot into, or null for as many as fit. A 38 by 23 m
   * plot fits twelve, which is close to a full farm beside the three or four a household tends.
   * The count is the grower's to cap, and the light still says where the beds it keeps go
   */
  readonly maxBeds: number | null
}

export type CandidateArchetype =
  | 'food-first'
  | 'balanced'
  | 'energy-first'
  | 'vertical-east-west'
  | 'no-array-control'

/** A proposed array, with the reasoning that produced it rather than a bare geometry */
export interface ArrayCandidate {
  readonly archetype: CandidateArchetype
  readonly label: string
  readonly geometry: RowGeometry
  readonly tracker: TrackerConfig
  readonly groundCoverRatio: Fraction
  readonly rationale: string
  readonly citations: readonly CitationId[]
}

export interface ScenarioLight {
  readonly meanGrowingSeasonDli: MolPerM2Day
  readonly worstCellDli: MolPerM2Day
  readonly meanShadeRatio: Fraction
  readonly homogeneity: Fraction
}

export interface ScenarioYield {
  readonly annualAcKwh: KilowattHours
  readonly landEquivalentRatio: Banded<Ratio>
  readonly cropsAvailable: readonly CropId[]
  readonly cropsLostToShade: readonly CropId[]
}

/** The water balance's reading of a layout's own beds, the figure "Using less water" ranks on */
export interface ScenarioWater {
  /** What the beds go short of over a year with nobody watering, open to the sky: mm, area-weighted */
  readonly deficitOpenSkyMm: Millimeters
  /** The same beds under this layout: its shade month by month, its rain shadows and its drip strips */
  readonly deficitUnderPanelsMm: Millimeters
  /** 1 - under / open. Exactly 0 for the open-sky control, below 0 where a layout leaves its beds shorter than open ground */
  readonly deficitSavedFraction: Fraction
}

/**
 * The shade this planting can absorb against the shade it actually gets, in the same units.
 *
 * The budget is spent on the array's PROJECTED ground coverage, which is a per-pitch quantity under
 * an infinite-row assumption. `measuredRatio` is the season-cumulative shade ratio the bake
 * produces over a plot of a real size. They're not the same number, and neither bounds the other:
 * light reaching in from the sides puts the measured figure below the footprint's on a single
 * widely spaced row, and the moment a second row fits the plot the measured figure can pass the
 * budget with the footprint unchanged. Sizing the footprint is the other check, and this is the one
 * that asks whether the grower got what they asked for
 */
export interface ShadeBudgetCheck {
  readonly maxRatio: Fraction
  readonly measuredRatio: Fraction
  readonly withinBudget: boolean
}

export interface ScenarioFlags {
  /** Whether the candidate clears the geometric design parameters this app can check */
  readonly meetsExpeditedClearance: boolean
  readonly fiftyPercentEverywhere: boolean
  readonly shade: ShadeBudgetCheck
  readonly notes: readonly string[]
}

/**
 * Where a bed sits in the ground light this candidate casts. Under a row array the ground is
 * banded, and the two kinds are the product's whole point: a bed is one or the other and
 * never both, because a bed spanning the boundary has no single light level to plant against
 */
export type LightZoneKind = 'bright-gap' | 'shaded-band' | 'even-light'

/** One bed's own growing-season light, so nothing downstream has to read the plot average */
export interface BedLightSummary {
  readonly meanGrowingSeasonDli: MolPerM2Day
  readonly worstCellGrowingSeasonDli: MolPerM2Day
  readonly shadeRatio: Fraction
}

export interface BedPlacement {
  readonly bedId: BedId
  readonly label: string
  readonly footprint: Polygon2D
  readonly zone: LightZoneKind
  readonly summary: BedLightSummary
  /** The full monthly field, which is what the recommendation pipeline gates crops on */
  readonly light: BedLight
  readonly reason: string
}

export interface BedLayout {
  readonly beds: readonly BedPlacement[]
  /** False when the ground light is one population, which is the open-sky control's case */
  readonly banded: boolean
  readonly explanation: string
  /** Anything the placement wouldn't do, in the words it would be said in */
  readonly refusals: readonly string[]
}

export interface DesignScenario {
  readonly candidate: ArrayCandidate
  readonly light: ScenarioLight
  readonly production: ScenarioYield
  readonly water: ScenarioWater
  readonly flags: ScenarioFlags
  /** Beds placed against this candidate's own baked ground light */
  readonly layout: BedLayout
  /** The electricity partial this scenario was scored on, carried so nothing recomputes it */
  readonly energyRatio: Banded<Fraction>
  readonly score: number
  readonly plainSummary: string
  readonly tradeoff: string
  readonly confidence: 'low' | 'moderate' | 'high'
}

export interface ScenarioSet {
  readonly answers: OnboardingAnswers
  readonly plotAreaM2: SquareMeters
  readonly scenarios: readonly DesignScenario[]
  readonly recommendedArchetype: CandidateArchetype
  /** Named so the wizard can say what it didn't consider */
  readonly notConsidered: readonly string[]
}
