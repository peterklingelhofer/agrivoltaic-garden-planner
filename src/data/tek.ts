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
 * Seven individually attributed rules. There's deliberately no merged
 * "ancient wisdom preset": pan-indigenous generalization is the named failure
 * mode in the Decision Record, and a Zuni water-harvesting rule and a Chagga
 * stratification rule aren't interchangeable
 */
const RULES: readonly TekDesignRule[] = [
  {
    id: 'tek-vertical-stratification' as TekRuleId,
    key: 'vertical-stratification',
    title: 'Plan two to four canopy tiers, each matched to its own light level',
    guidance:
      'Give every planting a tier, and match each tier to the modeled daily light integral (DLI) at its height under the array. Chagga home gardens on Mt Kilimanjaro stack overstory trees, banana, coffee and an herb understory. Javanese pekarangan gardens run three to four strata. Both select the mid and shrub layers for measured shade tolerance under a real canopy.',
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
    title: 'Grow nurse plants for the help they give other crops',
    guidance:
      'A nurse species is grown for what it gives the crops around it: shade, wind shelter, humidity or nitrogen. Faidherbia albida in Sahelian and Sudanian parklands is the strongest documented case. It drops its leaves during the crop growing season (reverse phenology), much like a panel tilted out of the way for the season.',
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
    title: 'Use nearby thermal mass and windbreaks to shape the microclimate',
    guidance:
      "Panel shade is one of several ways to change a garden's microclimate. Waru waru raised fields around Lake Titicaca use canal water as a thermal mass that absorbs solar energy by day and releases it at night, buffering frost. Size any water, stone or hedge element the way Kolata and Ortloff modeled bed and canal geometry for heat-storage capacity.",
    attribution: attribution(
      [
        'Tiwanaku-era and pre-Inca Andean farmers, known from the archaeological record of their raised fields',
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
      'Work at the micro scale, a sunken basin plus an inert mulch per plant, and at the macro scale, siting beds to intercept runoff from a catchment larger than the planted area. Zuni waffle gardens combine berm-walled cells with a sand mineral mulch that breaks capillary rise. Mossi zai pits concentrate rainfall and wind-blown organic debris at the planting point. A panel array gathers rainfall into drip lines, and these basins and pits are built to catch that concentrated water.',
    attribution: attribution(
      ['Zuni (A:shiwi) of the US Southwest', 'Mossi farmers of Burkina Faso'],
      ['Yacouba Sawadogo, for the modern zai revival'],
      'living',
      [
        'elamri2018-rain-concentration',
        'cook-mccuen2013-solar-farm-hydrology',
        'wang2024-desert-pv-ecology',
      ],
    ),
  },
  {
    id: 'tek-temporal-succession' as TekRuleId,
    key: 'temporal-succession',
    title: "Time plantings to the panels' shade as well as to the frost dates",
    guidance:
      "Match each crop growth stage to the array's shade through the seasons and through the day, including the tilt schedule where the mount allows one. Japanese solar sharing is the direct ancestor of this idea: Nagashima sized narrow modules and light-permeable gaps to the specific crop shade tolerance, and treated how well the crop uses light as a main sizing input alongside panel output.",
    attribution: attribution(
      ['Japanese farming communities practicing solar sharing under the satoyama land-use ethic'],
      ['Akira Nagashima, the named inventor of solar sharing, a modern practice'],
      'living',
      ['sekiyama2019-solar-sharing'],
    ),
  },
  {
    id: 'tek-landrace-adaptation' as TekRuleId,
    key: 'landrace-adaptation',
    title: 'Grow named landraces as separate varieties, each with its own traits',
    guidance:
      'Allow several named varieties of one species in a single bed, each noted with its own shade tolerance. Southern Ethiopian highland households curate dozens of named enset landraces per community, and that variety within one species is their documented way of spreading risk. This app holds only published trait descriptions, and no community-held seed genetics.',
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
    title: 'Count the yield of the whole bed together',
    guidance:
      'Judge a planting plan by its total output and by a measure like the land equivalent ratio. In the Haudenosaunee three-sisters intercrop, corn competition holds the bean and squash yields down while total output per unit area rises. The Andean vertical archipelago spread production across ecological zones on purpose, for the same reason. Weigh the labor cost alongside the gain in land use.',
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
 * distance-from-panel-edge modeling, and reproduces no fitted curve. Montero, Moreno &
 * Bertomeu (2008, montero2008-dehesa-light) fitted transmitted light against distance from the
 * trunk as a logistic curve (R^2 > 0.88 across covariates), but their regression coefficients sit
 * behind a paywall and were never obtained, so only the qualitative shape is usable here: light
 * rises with distance from the trunk and levels off beyond roughly 20 m. No source held in the
 * corpus reports soil moisture as a function of distance either: the dehesa moisture literature
 * contrasts beneath-canopy against beyond-canopy water content in discrete zones.
 *
 * The per-distance magnitudes below are NOT reproduced from any paper. Only
 * the endpoints and the monotone direction are supported by the sources held
 * here. The intermediate samples are interpolated. Use the shape, treat the
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
    'Endpoint magnitudes are taken from the dehesa and montado field studies, the ten intermediate samples are linearly interpolated between them',
  ),
  validRangeM: { min: DEHESA_MIN_M as Meters, max: DEHESA_MAX_M as Meters },
  caveat:
    'Provisional magnitudes. Only the trunk-edge and beyond-canopy endpoints are measured, the shape between them is assumed linear, with no curve fitted to data',
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
