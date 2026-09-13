import { citedDerived } from '../types/cited'
import type { NonEmpty } from '../types/cited'
import type { CitationId } from '../types/citation-ids.generated'
import type { TekRuleId } from '../types/ids'
import type {
  DistanceGradientTemplate,
  PracticeStatus,
  TekAttribution,
  TekDesignRule,
  TekRuleKey,
} from '../types/tek'
import type { Fraction, Meters } from '../types/units'
import { lerp } from './util'

const attribution = (
  peoples: readonly string[],
  individualInnovators: readonly string[],
  practiceStatus: PracticeStatus,
  citations: NonEmpty<CitationId>,
): TekAttribution => ({
  peoples,
  individualInnovators,
  practiceStatus,
  researcherAccountOnly: true,
  communityEndorsementSought: false,
  sourceType: 'published-literature',
  citations,
})

/**
 * Seven individually attributed rules. There is deliberately no merged
 * "ancient wisdom preset": pan-indigenous generalisation is the named failure
 * mode in the Decision Record, and a Zuni water-harvesting rule and a Chagga
 * stratification rule are not interchangeable
 */
const RULES: readonly TekDesignRule[] = [
  {
    id: 'tek-vertical-stratification' as TekRuleId,
    key: 'vertical-stratification',
    title: 'Declare two to four canopy tiers, keyed to the light level of each tier',
    guidance:
      'Assign every planting to an explicit tier and size the tier to the modelled DLI at that height under the array. Chagga home gardens on Mt Kilimanjaro stack overstory trees, banana, coffee and an herb understory; Javanese pekarangan gardens run three to four strata. Both select the mid and shrub layers for measured shade tolerance under a real canopy.',
    attribution: attribution(
      ['Chagga (Mt Kilimanjaro, Tanzania)', 'Javanese communities (Indonesia)'],
      [],
      'living',
      ['fernandes1984-chagga', 'hemp2006-chagga-banana-forests', 'kumar2004-tropical-homegardens'],
    ),
  },
  {
    id: 'tek-nurse-plants' as TekRuleId,
    key: 'nurse-plants',
    title: 'Model a nurse-species role distinct from a yield crop',
    guidance:
      'A nurse species earns its place by the microclimate service it provides: shade, wind shelter, humidity or nitrogen. Faidherbia albida in Sahelian and Sudanian parklands is the strongest documented case because its reverse phenology drops the canopy during the crop growing season, which is the living analogue of a seasonally adjustable panel tilt.',
    attribution: attribution(
      ['Sahelian and Sudanian-zone farming communities of West and East African parklands'],
      [],
      'living',
      ['roupsard1999-faidherbia'],
    ),
  },
  {
    id: 'tek-wind-thermal-buffering' as TekRuleId,
    key: 'wind-thermal-buffering',
    title: 'Treat adjacent thermal mass and windbreaks as first-class microclimate modifiers',
    guidance:
      'Panel shade is one microclimate lever among several. Waru waru raised fields around Lake Titicaca use canal water as a thermal mass that absorbs solar energy by day and releases it at night, buffering frost. Size any water, stone or hedge element the way Kolata and Ortloff modelled bed and canal geometry for heat-storage capacity.',
    attribution: attribution(
      [
        'Tiwanaku-era and pre-Inca Andean farmers, whose raised fields are the archaeological record',
        'Aymara and Quechua communities of the Altiplano, who use the revived technique today',
      ],
      [],
      'living',
      ['kolata1989-waru-waru'],
    ),
  },
  {
    id: 'tek-water-harvesting-geometry' as TekRuleId,
    key: 'water-harvesting-geometry',
    title: 'Harvest water at two scales, tied to the array drip line and runoff shadow',
    guidance:
      'Work at the micro scale, a sunken basin plus an inert mulch per plant, and at the macro scale, siting beds to intercept runoff from a catchment larger than the planted area. Zuni waffle gardens combine berm-walled cells with a sand mineral mulch that breaks capillary rise; Mossi zai pits concentrate rainfall and wind-blown organic debris at the planting point. A panel array redistributes rainfall into concentrated drip lines, which is exactly the resource these geometries capture.',
    attribution: attribution(
      ['Zuni (A:shiwi) of the US Southwest', 'Mossi farmers of Burkina Faso'],
      ['Yacouba Sawadogo, for the modern zai revival'],
      'living',
      ['elamri2018-rain-concentration'],
    ),
  },
  {
    id: 'tek-temporal-succession' as TekRuleId,
    key: 'temporal-succession',
    title: 'Make the planting schedule aware of the shade schedule as well as the frost calendar',
    guidance:
      "Pair each crop growth stage against the array's own seasonal and diurnal shade pattern, including the tilt schedule where the mount allows one. Japanese solar sharing is the direct ancestor of this idea: Nagashima sized narrow modules and light-permeable gaps to the specific crop shade tolerance and treated crop light-use efficiency as a first-order sizing input alongside panel output.",
    attribution: attribution(
      ['Japanese farming communities practising solar sharing under the satoyama land-use ethic'],
      ['Akira Nagashima, named inventor of solar sharing, which is a modern invention'],
      'living',
      ['sekiyama2019-solar-sharing'],
    ),
  },
  {
    id: 'tek-landrace-adaptation' as TekRuleId,
    key: 'landrace-adaptation',
    title: 'Treat named landraces as distinct plantable entities with their own traits',
    guidance:
      'Allow several named varieties of one species in a single bed and annotate each with its own shade tolerance. Southern Ethiopian highland households curate dozens of named enset landraces per community, and that within-species diversity is the documented risk-spreading mechanism. This app records only published trait descriptions and encodes no community-held seed genetics.',
    attribution: attribution(
      ['Sidama, Wolaita, Kambata and Gurage peoples of the southern Ethiopian highlands'],
      [],
      'living',
      ['mueller2025-eastern-ag-complex'],
    ),
  },
  {
    id: 'tek-polyculture-risk-spreading' as TekRuleId,
    key: 'polyculture-risk-spreading',
    title: 'Report portfolio yield across the whole bed',
    guidance:
      'Score a planting plan on aggregate output and a land-equivalent-ratio-style metric. In the Haudenosaunee three-sisters intercrop the individual bean and squash yields are legitimately suppressed by maize competition while total system output per unit area rises, and the Andean vertical archipelago spread production deliberately across ecological zones for the same reason. Show labour cost alongside the land-efficiency gain.',
    attribution: attribution(
      [
        'Haudenosaunee (Iroquois) nations of the Northeastern Woodlands',
        'Quechua and Aymara-speaking Andean communities, for the historical vertical archipelago',
      ],
      [],
      'living',
      ['mt-pleasant2010-iroquoian', 'cryan2024-three-sisters-labor'],
    ),
  },
]

export const loadTekRules = (): Promise<readonly TekDesignRule[]> => Promise.resolve(RULES)

export const tekRule = (rules: readonly TekDesignRule[], key: TekRuleKey): TekDesignRule => {
  const found = rules.find((rule) => rule.key === key)
  if (found === undefined) throw new Error(`no TEK rule for key ${key}`)
  return found
}

/**
 * The dehesa and montado oak-pasture gradient is a geometry-derived stand-in for
 * distance-from-panel-edge modelling, not a reproduction of a fitted curve. Montero, Moreno &
 * Bertomeu (2008, montero2008-dehesa-light) fitted transmitted light against distance from the
 * trunk as a logistic curve (R^2 > 0.88 across covariates), but their regression coefficients sit
 * behind a paywall and were never obtained, so only the qualitative shape is usable here: light
 * rises with distance from the trunk and levels off beyond roughly 20 m. No source held in the
 * corpus reports soil moisture as a function of distance either; the dehesa moisture literature
 * contrasts beneath-canopy against beyond-canopy water content in discrete zones, not a curve.
 *
 * The per-distance magnitudes below are NOT reproduced from any paper. Only
 * the endpoints and the monotone direction are supported by the sources held
 * here; the intermediate samples are interpolated. Use the shape, treat the
 * magnitudes as provisional, and render DEHESA_GRADIENT_CAVEAT alongside them
 */
export const DEHESA_GRADIENT_CAVEAT =
  'Shape only. The endpoints follow the published qualitative gradient, deep shade and moist soil under the crown giving way to full light and drier soil beyond the canopy edge, but the intermediate samples are interpolated. Treat the magnitudes as illustrative only.'

const DEHESA_MIN_M = 0.5
const DEHESA_MAX_M = 30
const DEHESA_SAMPLE_COUNT = 12
const DEHESA_TRANSMISSION_AT_TRUNK = 0.25
const DEHESA_TRANSMISSION_BEYOND_CANOPY = 1
const DEHESA_MOISTURE_AT_TRUNK = 1
const DEHESA_MOISTURE_BEYOND_CANOPY = 0.72

export const dehesaGradient = (): DistanceGradientTemplate => ({
  key: 'dehesa-montado',
  samples: citedDerived(
    Array.from({ length: DEHESA_SAMPLE_COUNT }, (_, index) => {
      const t = index / (DEHESA_SAMPLE_COUNT - 1)
      return {
        distanceFromEdgeM: lerp(DEHESA_MIN_M, DEHESA_MAX_M, t) as Meters,
        transmittedRadiationFraction: lerp(
          DEHESA_TRANSMISSION_AT_TRUNK,
          DEHESA_TRANSMISSION_BEYOND_CANOPY,
          Math.min(t * 2.5, 1),
        ) as Fraction,
        relativeSoilMoisture: lerp(
          DEHESA_MOISTURE_AT_TRUNK,
          DEHESA_MOISTURE_BEYOND_CANOPY,
          Math.min(t * 2, 1),
        ) as Fraction,
        origin: index === 0 || index === DEHESA_SAMPLE_COUNT - 1 ? 'measured' : 'interpolated',
      }
    }),
    'B',
    ['moreno2009-dehesa', 'simionesei2018-montado-water', 'montero2008-dehesa-light'],
    'Endpoint magnitudes are taken from the dehesa and montado field studies; the ten intermediate samples are linearly interpolated between them',
  ),
  validRangeM: { min: DEHESA_MIN_M as Meters, max: DEHESA_MAX_M as Meters },
  caveat:
    'Provisional magnitudes. Only the trunk-edge and beyond-canopy endpoints are measured; the shape between them is assumed linear, with no curve fitted to data',
  attribution: attribution(
    [
      'Iberian smallholders and estate managers of Extremadura, Andalusia and the Alentejo, who created and maintain the dehesa and montado',
    ],
    [],
    'living',
    ['moreno2009-dehesa', 'simionesei2018-montado-water'],
  ),
})

const sampleAt = (
  template: DistanceGradientTemplate,
  distanceM: number,
  read: (index: number) => number,
): number => {
  const samples = template.samples.value
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (first === undefined || last === undefined) return 1
  if (distanceM <= first.distanceFromEdgeM) return read(0)
  if (distanceM >= last.distanceFromEdgeM) return read(samples.length - 1)
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    if (previous === undefined || current === undefined) continue
    if (distanceM <= current.distanceFromEdgeM) {
      const span = current.distanceFromEdgeM - previous.distanceFromEdgeM
      const t = span === 0 ? 0 : (distanceM - previous.distanceFromEdgeM) / span
      return lerp(read(index - 1), read(index), t)
    }
  }
  return read(samples.length - 1)
}

export const transmissionAtDistance = (
  template: DistanceGradientTemplate,
  distanceM: Meters,
): Fraction =>
  sampleAt(
    template,
    distanceM,
    (index) => template.samples.value[index]?.transmittedRadiationFraction ?? 1,
  ) as Fraction

export const soilMoistureAtDistance = (
  template: DistanceGradientTemplate,
  distanceM: Meters,
): Fraction =>
  sampleAt(
    template,
    distanceM,
    (index) => template.samples.value[index]?.relativeSoilMoisture ?? 1,
  ) as Fraction
