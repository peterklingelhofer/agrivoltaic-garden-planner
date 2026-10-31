import { DEFAULT_FROST_PERCENTILE } from '../data/site'
import { type CropPlan, planBed } from '../recommend/auto'
import type { Crop } from '../types/crop'
import { irrigationOf, type IrrigationMethod } from '../types/garden'
import { bedId } from '../types/ids'
import type { BedLight } from '../types/light'
import type { ExceedancePercentile, Site, SoilProfile } from '../types/site'
import { type ByMonth, type Fraction, fraction, meters, type MolPerM2Day } from '../types/units'
import { makeBed, makePlot, soilForSite } from './defaults'
import { polygonOf, rectangleRing, vec2 } from './geom'

/**
 * The soil a place is judged by. A pH the person typed can rule a crop out, the way a typed bed
 * pH does in the planner. The soil map's reading for the place only lowers a crop's standing,
 * since a map pixel is the native ground and a bed is usually limed
 */
export type SiteFitSoil =
  | { readonly kind: 'own'; readonly phUnits: number }
  | { readonly kind: 'map' }

export interface SiteFitInput {
  readonly site: Site
  readonly catalog: readonly Crop[]
  /** The share of full sun the ground loses to shade across the season, 0 to 1, from whatever casts it */
  readonly shade: Fraction
  readonly soil: SiteFitSoil
  readonly irrigation: IrrigationMethod
  readonly frostPercentile?: ExceedancePercentile
}

export interface SiteFit {
  /** The light the crops were judged against: the place's open-field months under the shade */
  readonly light: BedLight
  /** The soil the crops were judged against */
  readonly soil: SoilProfile
  /** Every crop in the catalog, suited first, then limited, then unsuited, each with its calendar */
  readonly ranked: readonly CropPlan[]
}

/** The one bed a place is judged as */
export const SITE_FIT_BED_ID = bedId('place')

/**
 * Wide and deep enough that no crop in the catalog is turned away for want of room or soil depth.
 * The question is the place, and a bed's size is a question for the planner
 */
const PLACE_BED_SIDE_M = 20
const PLACE_SOIL_DEPTH_M = 2

const twelve = <T>(value: T): ByMonth<T> => [
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
  value,
]

const monthly = <T>(values: readonly T[]): ByMonth<T> => {
  if (values.length !== 12) {
    throw new Error(`twelve monthly figures expected, got ${String(values.length)}`)
  }
  return values as unknown as ByMonth<T>
}

/**
 * A place's open-field light under a uniform shade, in the record the crop rules read.
 *
 * The planner's record comes off the light simulation, one bed at a time. The finder has no bed
 * and no panels. It has the place's thirty-year monthly light (`Site.normals`, daily shortwave
 * times the PAR fraction and the photon conversion) and one number a person typed for the shade
 * over the ground. So every month is the open-field mean times what the shade leaves, every cell
 * is the same, and the baked mean equals the mean. That puts the typed shade in front of the
 * crop's shade ceiling as well as its light floor: the ceiling reads `bakedRsr`, and here the
 * shade is the only thing between the sky and the ground
 */
export const openFieldBedLight = (site: Site, shade: Fraction): BedLight => {
  const open = monthly(site.normals.monthlyMeanDliMolM2Day.map((value) => value as MolPerM2Day))
  // a number field's min and max don't stop a typed value, and shade past the sky is no shade
  const shaded = Math.min(Math.max(shade, 0), 1) as Fraction
  const keep = 1 - shaded
  const under = monthly(open.map((value) => (value * keep) as MolPerM2Day))
  const annual = under.reduce<number>((sum, value) => sum + value, 0) / 12
  return {
    bedId: SITE_FIT_BED_ID,
    cellCount: 1,
    monthlyMeanDliMolM2Day: under,
    monthlyBakedMeanDliMolM2Day: under,
    monthlyMinDliMolM2Day: under,
    monthlyOpenSkyDliMolM2Day: open,
    monthlyRsr: twelve(shaded),
    annualMeanDliMolM2Day: annual as MolPerM2Day,
    skyViewFactor: keep as Fraction,
    homogeneity: { coefficientOfVariation: fraction(0), minOverMean: fraction(1) },
    // no sky model stands behind these figures and the type asks for one, so the counts are zero
    // and the two conversion factors are the ones the normals were made with
    quality: {
      subdivision: 'tregenza-mf1',
      sunDirectionCount: 0,
      substepsPerHour: 0,
      parFraction: fraction(0.45),
      photonConversionUmolPerJ: 4.57,
      interreflectionApplied: false,
      seasonalParHalfWidthFraction: fraction(0),
    },
  }
}

/** The soil profile a place is judged by: the site's own, deep, with the typed pH over it when there is one */
export const siteFitSoil = (site: Site, soil: SiteFitSoil): SoilProfile => {
  const base: SoilProfile = { ...soilForSite(site), effectiveDepthM: meters(PLACE_SOIL_DEPTH_M) }
  return soil.kind === 'own' ? { ...base, phUnits: soil.phUnits, sourceId: 'user' } : base
}

/**
 * Every crop in the catalog read against a place: its climate, the light its ground gets under
 * the shade over it, its soil and its watering. The same rules the planner runs on a bed, run on
 * one wide, deep, unplanted bed with no panels over it, so a crop stands or falls on the place
 */
export const cropsForConditions = (input: SiteFitInput): SiteFit => {
  const soil = siteFitSoil(input.site, input.soil)
  const bed = makeBed(1, {
    id: SITE_FIT_BED_ID,
    label: 'This place',
    footprint: polygonOf(rectangleRing(vec2(0, 0), PLACE_BED_SIDE_M, PLACE_BED_SIDE_M)),
    soil,
    irrigation: irrigationOf(input.irrigation),
    raisedHeightM: meters(0),
  })
  const plot = { ...makePlot(), beds: [bed], arrays: [] }
  const light = openFieldBedLight(input.site, input.shade)
  const plan = planBed(
    {
      site: input.site,
      plot,
      bedLight: [light],
      catalog: input.catalog,
      companionRules: [],
      rotationConstraints: [],
      frostPercentile: input.frostPercentile ?? DEFAULT_FROST_PERCENTILE,
    },
    light,
  )
  return { light, soil, ranked: plan.ranked }
}
