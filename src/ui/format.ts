import type {
  Banded,
  ConfidenceLevel,
  IntervalKind,
  UncertaintyContribution,
  UncertaintySource,
} from '../types/band'
import type { ComplianceOutcome, CriterionResult } from '../types/compliance'
import type {
  Crop,
  EcocropParameter,
  LaubCropGroup,
  PollinatorDependence,
  PollinatorForage,
} from '../types/crop'
import type { EvidenceGrade } from '../types/evidence'
import type { Bed } from '../types/garden'
import type { BedId } from '../types/ids'
import type { PolycultureSuggestion } from '../types/polyculture'
import type { CropRecommendation, LimitingFactor, RecommendationVerdict } from '../types/recommend'
import type { YieldEstimate } from '../types/recommend'
import type { LengthUnit } from '../state/slices'
import type { Fraction, MolPerM2Day, MonthIndex } from '../types/units'
import type { WeatherSourceId } from '../types/weather'
import { metersToFeet, showsFigures, type Experience } from './onboarding'

export const POINT_ESTIMATE_REFUSED =
  'src/ui/format.ts refuses a point estimate: Decision Record 7 requires a band'

/**
 * Re-exported: a crop's name is owned by `data/crops.ts` beside `cropById`,
 * because `recommend` says crop names out loud too and can't import the UI's formatting
 */
export { cropName } from '../data/crops'
import { cropName, laubStudyCount } from '../data/crops'
import { ROOT_DEPTH_FLOOR_M } from '../recommend/stages/space'

/**
 * A count and the word for it, agreeing: "1 job", "9 jobs"
 */
export const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`

/**
 * A plant count the way a grower would say it: exact up to twenty, "about 270" past it. A count
 * off a spacing grid is a planting rate, and "476 pea" reads as an instruction, a wrong one, to
 * anyone who sows two rows on a trellis. The exact figure stays on the row's `data-count` and in
 * the shopping list's arithmetic
 */
export const approxCount = (count: number): string => {
  if (count <= 20) return String(count)
  const unit = count < 100 ? 10 : 10 ** (Math.floor(Math.log10(count)) - 1)
  return `about ${String(Math.round(count / unit) * unit)}`
}

/** `approxCount` with its word: "about 270 plants", "1 plant" */
export const approxPlural = (count: number, one: string, many: string): string =>
  `${approxCount(count)} ${count === 1 ? one : many}`

/**
 * Re-exported like `cropName`: a harvest share to the nearest five is owned by the season's own
 * coach, because the season says its share out loud too and can't import the UI's formatting
 */
export { approxPercent, nearestFivePercent } from '../simulation/coach'

/** The bed's own label, falling back to its id the way `cropName` falls back to a crop's */
export const bedName = (beds: readonly Bed[], id: BedId): string =>
  beds.find((entry) => entry.id === id)?.label ?? (id as string)

const looksBanded = (value: unknown): value is Banded<number> => {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { interval?: { lower?: unknown; upper?: unknown } }
  return (
    typeof candidate.interval?.lower === 'number' && typeof candidate.interval?.upper === 'number'
  )
}

// The type system already makes a PointEstimate<T> unassignable here. This is the runtime
// backstop for values that crossed a worker or JSON boundary untyped
export const assertBanded = <T extends number>(value: Banded<T>): Banded<T> => {
  if (!looksBanded(value)) throw new TypeError(POINT_ESTIMATE_REFUSED)
  return value
}

const decimals = (value: number): number =>
  Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2

const num = (value: number): string => value.toFixed(decimals(value))

export const formatBandPercent = <T extends number>(value: Banded<T>): string => {
  const band = assertBanded(value)
  return `${Math.round(band.interval.lower * 100)}-${Math.round(band.interval.upper * 100)}%`
}

export const formatBandRange = <T extends number>(value: Banded<T>, unit: string): string => {
  const band = assertBanded(value)
  return `${num(band.interval.lower)}-${num(band.interval.upper)}${unit ? ` ${unit}` : ''}`
}

/** Read off the band: a confidence interval can't be labeled a prediction one */
export const intervalNoun = (kind: IntervalKind): string =>
  kind === 'confidence'
    ? 'confidence interval'
    : kind === 'prediction'
      ? 'prediction interval'
      : kind === 'tolerance'
        ? 'tolerance interval'
        : 'plausible range'

export const attributionLabel = (source: UncertaintySource): string =>
  source === 'crop-response'
    ? 'crop response (Laub et al. 2022)'
    : source === 'seasonal-par'
      ? 'seasonal cumulative PAR (+/-10%)'
      : source === 'optical-geometry'
        ? 'optical geometry'
        : source === 'weather-tmy'
          ? 'typical meteorological year'
          : source === 'mount-structure'
            ? 'mount structure (Horowitz et al. 2020)'
            : source === 'crowding'
              ? "crowding at this spacing: this app's own figure"
              : 'soil and water'

/**
 * A term's figure the way it acts on the band: crowding scales both ends down, so its share is
 * a reduction, and every other term is a half-width either side
 */
export const contributionFigure = (contribution: UncertaintyContribution): string =>
  `${contribution.source === 'crowding' ? '-' : '+/-'}${String(Math.round(contribution.halfWidthFraction * 100))}%`

const LAUB_GROUP_LABEL: Readonly<Record<LaubCropGroup, string>> = {
  berries: 'berries',
  fruits: 'fruits',
  'fruity-vegetables': 'fruity vegetables',
  forages: 'forages',
  'leafy-vegetables': 'leafy vegetables',
  'tubers-root-crops': 'tubers and root crops',
  'c3-cereals': 'C3 cereals',
  'grain-legumes': 'grain legumes',
  'corn-c4': 'corn',
}

/**
 * The crop term named by its own curve and the studies behind it, so a band on the leafy
 * vegetables curve says it rests on four studies and one on grain legumes on fourteen
 */
export const cropResponseLabel = (group: LaubCropGroup): string =>
  `crop response: the ${LAUB_GROUP_LABEL[group]} curve, ${String(laubStudyCount(group))} studies (Laub et al. 2022)`

export const confidenceLabel = (confidence: ConfidenceLevel): string =>
  `${Math.round(confidence * 100)}% band`

export const bandBasisLabel = <T extends number>(value: Banded<T>): string =>
  `${Math.round(value.confidence * 100)}% ${intervalNoun(value.intervalKind)}`

export const formatYieldEstimate = (estimate: YieldEstimate): string => {
  const band = assertBanded(estimate.relativeYield)
  const term =
    band.dominantSource === 'crop-response'
      ? cropResponseLabel(estimate.laubGroup)
      : attributionLabel(band.dominantSource)
  return `${formatBandPercent(band)} of full yield, ${bandBasisLabel(band)} dominated by ${term}`
}

export const formatDli = (value: MolPerM2Day): string => `${num(value)} mol/m²/d`

export const formatRsr = (value: Fraction): string => `${Math.round(value * 100)}% shade (RSR)`

export const formatMeters = (value: number): string => `${num(value)} m`

/**
 * A length in whichever unit the design is stored in, for a readout beside a field that shows the
 * same unit. `formatMeters` stays what a caller with no unit to read reaches for: a sentence built
 * from a crop's own root depth, or another figure that isn't the grower's own measurement
 */
export const formatLength = (valueM: number, unit: LengthUnit): string =>
  unit === 'm' ? formatMeters(valueM) : `${num(metersToFeet(valueM))} ft`

/**
 * A temperature in both units, the way every size in this app already prints both meters and
 * feet (`formatBothUnits`).
 *
 * The Celsius stays first because every threshold in the science is stated in it
 */
export const formatCelsius = (celsius: number): string => {
  // a threshold is a whole number of degrees and "30.0 °C" reads as a measurement of something
  const said = Number.isInteger(celsius) ? String(celsius) : celsius.toFixed(1)
  return `${said} °C (${String(Math.round(celsius * 1.8 + 32))} °F)`
}

/** Rain and evaporative demand in both units, for the same reason */
export const formatRainMm = (mm: number): string =>
  `${String(Math.round(mm))} mm (${(mm / 25.4).toFixed(mm >= 254 ? 0 : 1)} in)`

export const formatDegrees = (value: number): string => `${value.toFixed(1)}°`

export const MONTH_LABELS: readonly string[] = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const monthLabel = (month: MonthIndex): string => MONTH_LABELS[month - 1] ?? String(month)

/**
 * The ECOCROP envelope names a database column, which a gardener wouldn't recognize as a reason, so
 * each parameter gets the plain question it is actually standing in for
 */
const ECOCROP_PARAMETER_PLAIN: Readonly<Record<EcocropParameter, string>> = {
  temperature: "the temperature here doesn't suit it",
  rainfall: "the rainfall here doesn't suit it",
  'cycle-length': 'the growing season here is too short for it',
  koppen: "the climate here isn't the kind it grows in",
}

/**
 * How much a raised bed is offered to grow by in one press, and how far past that this app stops
 * offering a press at all: a bed short by a few centimeters is a fix, a bed short by half a
 * meter is a different kind of bed
 */
export const ROOT_DEPTH_RAISE_CAP_M = 0.6
const ROOT_DEPTH_RAISE_STEP_M = 0.05

export interface RootDepthRemedy {
  readonly bedDepthM: number
  readonly cropDepthM: number
  /** How much deeper this bed would need to go for the crop's own root depth to fit it */
  readonly shortfallM: number
  /** The bed's new raised height that would fit the crop, or null past `ROOT_DEPTH_RAISE_CAP_M` */
  readonly raiseToM: number | null
}

/**
 * What a bed would have to grow by for a crop's own root depth to fit it.
 *
 * `raiseToM` is the bed's new `raisedHeightM`, replacing the old value directly: the soil's own
 * depth never changes, so raising the bed is the only knob, and rounding the target UP to the
 * nearest step is what makes "press this and the crop fits" a promise the app can keep
 */
export const rootDepthRemedy = (crop: Crop, bed: Bed): RootDepthRemedy => {
  const bedDepthM = bed.soil.effectiveDepthM + bed.raisedHeightM
  const cropDepthM = crop.roots.maxEffectiveDepthM
  const shortfallM = cropDepthM - bedDepthM
  const neededHeightM = cropDepthM - bed.soil.effectiveDepthM
  /*
    Null once the bed already holds the roots, as well as past the cap. A bed raised past what a
    crop asked for keeps its EXCLUDED badge until the ranking catches up, and without this null the
    remedy under it would offer to raise the bed by minus ten centimeters: `useAutoRecommend`'s key
    is what makes the ranking catch up, and this is what the sentence says in the moment before it
    does
  */
  /*
    The epsilon is doing real work. A bed 0.95 m deep and a crop wanting 1.10 needs 0.15, which is
    exactly three steps, and in binary floating point it comes out a hair over: without the epsilon,
    `Math.ceil` would take a fourth step and the press would raise the bed five centimeters further
    than anything asked for. A billionth of a step is far below what a bed is built to
  */
  const steps = Math.ceil(neededHeightM / ROOT_DEPTH_RAISE_STEP_M - 1e-9)
  const raiseToM =
    shortfallM <= 0 || shortfallM > ROOT_DEPTH_RAISE_CAP_M
      ? null
      : Math.max(0, steps) * ROOT_DEPTH_RAISE_STEP_M
  return { bedDepthM, cropDepthM, shortfallM, raiseToM }
}

/**
 * A bed shallower than the roots would reach in deep soil limits the crop (see
 * `ROOT_DEPTH_FLOOR_M`). Only a bed under the floor refuses it. The plain sentence
 * for each is what every caller without a bed to hand gets. With the bed, the figures follow it
 */
const ROOT_DEPTH_LIMITED =
  "the soil here is shallower than its roots would reach, so it'll need watering more often"
const ROOT_DEPTH_REFUSED = 'the soil here is too shallow for it'

const rootDepthDetail = (remedy: RootDepthRemedy): string =>
  remedy.shortfallM <= 0
    ? `its roots would reach ${formatMeters(remedy.cropDepthM)} and this bed is ${formatMeters(remedy.bedDepthM)} deep now, so it has the room, and the ranking hasn't updated yet`
    : remedy.bedDepthM < ROOT_DEPTH_FLOOR_M
      ? `${ROOT_DEPTH_REFUSED}: this bed is ${formatMeters(remedy.bedDepthM)} deep, under the ${formatMeters(ROOT_DEPTH_FLOOR_M)} a bed needs. Raising it by ${formatMeters(remedy.shortfallM)} would give its roots room`
      : `${ROOT_DEPTH_LIMITED}: in deep soil they'd reach ${formatMeters(remedy.cropDepthM)}, and this bed is ${formatMeters(remedy.bedDepthM)} deep. Raising the bed by ${formatMeters(remedy.shortfallM)} would give them room`

/**
 * What ruled a crop out or held it back, in words a gardener uses.
 *
 * The parenthetical at the end of every line names the pipeline stage and the fuzzy-logic
 * membership that decided it: real information to someone checking the model, and Greek to everyone
 * else, who would read "membership 0.00" as part of the reason their crop was refused. It's gated
 * behind `showsFigures`, the same novice/expert split every other figure in the app reads.
 *
 * `crop` and `bed` are optional and used only for the root-depth cause, so every other caller,
 * which has neither, still gets the plain sentence below. Without
 * them a shallow bed reads as limiting, which is what it is everywhere above the floor. Only a
 * caller with the bed to hand can say it was refused
 */
export const explainLimitingFactor = (
  factor: LimitingFactor,
  experience: Experience,
  catalog: readonly Crop[],
  crop?: Crop,
  bed?: Bed,
): string => {
  const cause = factor.cause
  const detail =
    cause.kind === 'fao-ecocrop'
      ? ECOCROP_PARAMETER_PLAIN[cause.parameter]
      : cause.kind === 'hardiness'
        ? 'winters here are too cold for it to survive'
        : cause.kind === 'chill'
          ? "winters here aren't cold enough for it to break dormancy"
          : cause.kind === 'cold-winter'
            ? "winters here aren't cold enough for it: it grows only where winters are cold"
            : cause.kind === 'season-gdd'
              ? 'the growing season here is too short for it to reach maturity'
              : cause.kind === 'dli-minimum'
                ? `not enough light in ${monthLabel(cause.month)}`
                : cause.kind === 'dli-disorder-ceiling'
                  ? `too much light in ${monthLabel(cause.month)}`
                  : cause.kind === 'max-design-rsr'
                    ? 'more shade here than it can take'
                    : cause.kind === 'dli-survival-ceiling'
                      ? 'more light here than it can survive'
                      : cause.kind === 'soil-ph'
                        ? "the soil pH here doesn't suit it"
                        : cause.kind === 'water'
                          ? 'not enough water for it here'
                          : cause.kind === 'footprint'
                            ? "no room for it once it's fully grown"
                            : cause.kind === 'root-depth'
                              ? crop === undefined || bed === undefined
                                ? ROOT_DEPTH_LIMITED
                                : rootDepthDetail(rootDepthRemedy(crop, bed))
                              : cause.kind === 'rotation'
                                ? `grown here too recently to keep ${cause.pathogen} from building up`
                                : cause.kind === 'shared-pest-or-pathogen'
                                  ? `shares a pest or disease with ${cropName(catalog, cause.withCropId)}`
                                  : "nothing on its own rules it out, and altogether it's a weak match"
  return showsFigures(experience)
    ? `${detail} (${factor.stage}, membership ${factor.membership.toFixed(2)})`
    : detail
}

export const limitingFactorOf = (outcome: RecommendationVerdict): LimitingFactor | null =>
  outcome.verdict === 'recommended' ? null : outcome.limiting

export const weakestScoreTerm = (outcome: RecommendationVerdict): string => {
  if (outcome.verdict === 'excluded') return 'excluded'
  const s = outcome.score
  // 'light fit' / 'climate fit' / 'soil fit' are the score breakdown's own field names, and each
  // names a model term, when what a gardener actually wants is "why" a crop landed where it did
  const terms: readonly (readonly [string, number])[] = [
    ['how much light it gets', s.lightFit],
    ['how well the climate here suits it', s.climateFit],
    ['how well the soil here suits it', s.soilFit],
  ]
  return terms.reduce(
    (worst, term) => (term[1] < worst[1] ? term : worst),
    terms[0] ?? ['nothing measured', 1],
  )[0]
}

/**
 * The three verdicts in words a beginner reads as advice: "EXCLUDED" beside a
 * crop reads as forbidden, though the row can still be pressed and added anyway, and "Marginal"
 * carries no meaning by itself
 */
export const verdictLabel = (outcome: RecommendationVerdict): string =>
  outcome.verdict === 'recommended'
    ? 'Recommended'
    : outcome.verdict === 'marginal'
      ? 'Limited'
      : 'Not suited'

/**
 * How small a score gap in the leading run of a list must be for a beginner to be told the entries
 * are tied, read as a share of how far apart that list's OWN leaders land.
 *
 * `rank.ts` and `suggest.ts` both break an exact numeric tie at 1e-9, which is finer than
 * either score claims to be accurate to: `lightFit` and `climateFit` mostly rest on Tier C
 * class-level inferences about the crop, so a gap that
 * is small next to how far apart THIS list's own top few otherwise land is inside that same
 * noise, too small to report as a finding on its own. Dividing by the spread being displayed
 * means a bed that clearly favors one crop over the rest gets a tighter margin than one where the
 * whole top of the list scores about the same.
 *
 * This is an unmeasured presentation threshold picked for this screen: nothing here reruns the
 * ranking to see how far its score actually moves. It says a gap this small isn't worth
 * presenting as a ranking. It makes no claim about how precise `rank.ts` or `suggest.ts` are
 */
const TIE_MARGIN_SPREAD_FRACTION = 0.05

/**
 * How many scores, counted from the top of an already-descending list, land within
 * `TIE_MARGIN_SPREAD_FRACTION` of its own spread. Fewer than two scores has nobody to be tied
 * with, so it always reads as zero, and so does a single leader with clear daylight below it
 */
const tiedLeadingCount = (scoresDescending: readonly number[]): number => {
  if (scoresDescending.length < 2) return 0
  const top = scoresDescending[0] as number
  const bottom = scoresDescending[scoresDescending.length - 1] as number
  const spread = top - bottom
  // every score in the list reads the same, so the whole list is the tie
  if (spread <= 1e-9) return scoresDescending.length
  const margin = spread * TIE_MARGIN_SPREAD_FRACTION
  let count = 0
  for (const value of scoresDescending) {
    if (top - value >= margin) break
    count += 1
  }
  return count >= 2 ? count : 0
}

/**
 * How many of the leading RECOMMENDED crops in a bed's ranking are too close on score to tell
 * apart. Marginal and excluded crops never enter this: they already say what held them back
 * (`explainLimitingFactor`), and the tie question only makes sense among crops this bed already
 * calls equally good
 */
export const tiedLeadingCropCount = (ranked: readonly CropRecommendation[]): number =>
  tiedLeadingCount(
    ranked.flatMap((entry) =>
      entry.outcome.verdict === 'recommended' ? [entry.outcome.score.total] : [],
    ),
  )

/**
 * What a truncated ranking says about the part of itself it is not showing.
 *
 * Said as a count of what is missing, because the reader can
 * already see what is shown. It's a `panel-sub`: nothing has gone wrong and
 * nothing needs fixing, the list is simply longer than it is worth reading
 */
export const rankedHiddenNote = (hidden: number): string =>
  `${String(hidden)} more ${hidden === 1 ? 'crop was' : 'crops were'} ranked below these. They scored lower for this bed, and the switch above shows them.`

export const cropTieNote = (tiedCount: number): string =>
  `The top ${String(tiedCount)} crops here score too close together to rank one above another. Any of them suits this bed about equally well, so pick whichever you would most like to grow. Among them, the crops whose light needs were measured are listed first`

/**
 * How many of the leading polyculture combinations are too close on score to tell apart.
 *
 * `suggest.ts` sorts a combination that rests on any inferred light admission behind one that
 * doesn't, ahead of score, so the leading run read here is only the combinations that share
 * the winner's own standing on that question: a combination one rung down on evidence is never
 * called a tie with one that is not, whatever their scores say
 */
export const tiedLeadingSuggestionCount = (
  suggestions: readonly PolycultureSuggestion[],
): number => {
  if (suggestions.length === 0) return 0
  const leaderRestsOnInference =
    (suggestions[0] as PolycultureSuggestion).confidence.inferredLightAdmissions.length > 0
  const leadingRun = suggestions.filter(
    (entry) => entry.confidence.inferredLightAdmissions.length > 0 === leaderRestsOnInference,
  )
  return tiedLeadingCount(leadingRun.map((entry) => entry.score.total))
}

export const suggestionTieNote = (tiedCount: number): string =>
  `The top ${String(tiedCount)} combinations here score too close together to rank one above another. Pick whichever you would most like to grow`

// no pass/fail or compliant/non-compliant language: nothing here is a determination
export const OUTCOME_LABEL: Readonly<Record<ComplianceOutcome, string>> = {
  'meets-expedited-parameters': 'Meets every fast-track limit',
  'requires-exception-request': 'Misses a limit, so it would need an exception',
  indeterminate: "Can't be checked from the layout alone",
}

export const criterionSummary = (result: CriterionResult): string => {
  if (result.outcome === 'meets') return `meets: ${num(result.measured)} ${result.unit}`
  if (result.outcome === 'misses')
    return `would need an exception: ${num(result.measured)} ${result.unit}`
  if (result.outcome === 'approximate')
    return `approximate, ${num(result.measured)} ${result.unit} against ${num(result.threshold)}`
  if (result.outcome === 'estimate')
    return `estimate: ${formatBandRange(result.estimated, result.unit)}`
  return `not applicable: ${result.reason}`
}

/* ---------------------------------- wildlife ----------------------------------- */

/**
 * Said wherever the native answer is, because without a region there is no answer at all and a
 * preference that silently does nothing reads exactly like one that worked
 */
export const NATIVE_REGION_UNKNOWN =
  "No botanical region has been computed for this garden yet, because the place hasn't been looked up or its coordinates fall outside the region map. Until there's one, favoring natives changes nothing in the order below"

/**
 * Whether the checklist records this crop growing wild where the garden is, in words.
 *
 * Three states, and the third is the one this function exists for. `isNativeIn` answers `null`
 * for a crop no accepted name could be matched to and for a garden whose coordinates fall off
 * the region grid, and both of those are "nobody has checked". A two-branch ternary would print
 * "it is introduced here" for them, which is a claim Kew hasn't made and which a grower would
 * have no way to challenge
 */
export const nativeNote = (native: boolean | null): string =>
  native === null
    ? "It isn't known whether this is native here. Either Kew's plant checklist has no accepted name matching it, or this garden falls outside the regions the checklist maps, so it isn't marked as introduced (non-native)"
    : native
      ? "Native here: Kew's plant checklist records it growing wild in this region"
      : "Not native here: Kew's plant checklist records it growing wild in other regions only"

/**
 * What the plant offers flower visitors. The half of the pollinator question that moves the
 * ranking, because it's the half that is about the garden
 */
export const forageNote = (forage: PollinatorForage): string =>
  forage === 'high'
    ? 'Feeds pollinators well: its flowers are among those bees and other pollinators visit most'
    : forage === 'some'
      ? 'Feeds pollinators a little: it has to flower before it fruits, and pollinators visit the blossom'
      : "Feeds pollinators nothing here: either it's picked before it flowers, or it's a plant the wind pollinates"

/**
 * What the crop asks of flower visitors, which is the OTHER question and is deliberately never
 * folded into the sentence above. A plant can feed nothing and still need visits (a wind-shy
 * cucurbit under cover), or feed a great deal and need none at all, and a grower deciding what
 * to put where is asking both. Klein et al. name five classes and each gets its own line here
 */
export const dependenceNote = (dependence: PollinatorDependence): string =>
  dependence === 'essential'
    ? 'Needs insect visits to crop: without them it sets almost nothing'
    : dependence === 'great'
      ? 'Needs insect visits to crop well: without them most of the crop is lost'
      : dependence === 'modest'
        ? 'It crops better for insect visits, and still sets something without them'
        : dependence === 'little'
          ? 'Barely needs insect visits: it mostly sets its own crop'
          : 'Needs no insect visits for its own yield'

export const gradeDisplay = (grade: EvidenceGrade): string =>
  grade === 'A' || grade === 'B'
    ? `Grade ${grade}, scored`
    : grade === 'C'
      ? 'Experimental'
      : 'Folklore'

/** Where the weather came from, by name, because "the record" is a promise about a source */
export const SOURCE_NAME: Readonly<Record<WeatherSourceId, string>> = {
  'open-meteo': 'Open-Meteo',
  'nasa-power': 'NASA POWER',
  'pvgis-sarah3': 'PVGIS',
  'nsrdb-psm3': 'NSRDB',
  'user-upload': 'your own weather file',
}
