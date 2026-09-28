import { DEFAULT_MAX_CROPS_PER_BED } from '../recommend/suggest'
import { evenFootprints } from '../recommend/layout'
import { exposureInForce } from '../recommend/surroundings'
import type { Bed, GardenPlot, Irrigation } from '../types/garden'
import type { LatLon } from '../types/geo'
import type {
  ArrayCandidate,
  BedLayout,
  CandidateArchetype,
  DesignObjective,
  DesignScenario,
  GrowingAmbition,
  MountingPreference,
  OnboardingAnswers,
} from '../types/onboarding'
import type { PvArray } from '../types/pv'
import type { SoilProfile } from '../types/site'
import { meters, millimetersPerYear, type Meters } from '../types/units'
import { DEFAULT_SOIL, makeArray, makeBed, makePlot } from './defaults'
import { withDerived } from './derive'
import { extentOf, polygonOf, rectangleRing, vec2 } from './geom'

/**
 * Everything the questions ask for themselves. The location belongs to the site slice, and the plot
 * size belongs to the plot: its boundary is the one source of how big the space is, and
 * `plotSizeOf` reads it off for the search. Two fields for one rectangle would let the ground step
 * and the guided questions disagree about the same yard
 */
export type WizardAnswers = Omit<
  OnboardingAnswers,
  'location' | 'locationLabel' | 'plotWidthM' | 'plotDepthM'
>

export type ObjectiveKey = keyof DesignObjective

export const OBJECTIVE_KEYS: readonly ObjectiveKey[] = ['food', 'energy', 'water', 'simplicity']

export type ObjectivePresetId = 'mostly-food' | 'balanced' | 'mostly-electricity'

export interface ObjectivePreset {
  readonly id: ObjectivePresetId
  readonly label: string
  readonly help: string
  readonly weights: DesignObjective
}

const BALANCED: DesignObjective = { food: 0.35, energy: 0.35, water: 0.15, simplicity: 0.15 }

/**
 * Presets, chosen over four raw sliders. The weights have to sum to 1, and asking someone who
 * has never heard of agrivoltaics to normalize four numbers by hand is asking them to do
 * arithmetic in order to state a preference. The sliders stay available for whoever wants them
 */
export const OBJECTIVE_PRESETS: readonly ObjectivePreset[] = [
  {
    id: 'mostly-food',
    label: 'Mostly food',
    help: 'Grow as much as the space allows and take whatever electricity is left over',
    weights: { food: 0.6, energy: 0.15, water: 0.15, simplicity: 0.1 },
  },
  {
    id: 'balanced',
    label: 'A bit of both',
    help: 'Share the space between what you grow and what you generate',
    weights: BALANCED,
  },
  {
    id: 'mostly-electricity',
    label: 'Mostly electricity',
    help: 'Generate as much as the space allows and grow what still does well underneath',
    weights: { food: 0.15, energy: 0.6, water: 0.1, simplicity: 0.15 },
  },
]

export const objectiveTotal = (objective: DesignObjective): number =>
  OBJECTIVE_KEYS.reduce((total, key) => total + objective[key], 0)

const EVEN: DesignObjective = { food: 0.25, energy: 0.25, water: 0.25, simplicity: 0.25 }

/** The wizard never hands out an objective that doesn't sum to 1, whatever was typed into it */
export const normalizeObjective = (objective: DesignObjective): DesignObjective => {
  const total = objectiveTotal(objective)
  if (!(total > 0)) return EVEN
  return {
    food: objective.food / total,
    energy: objective.energy / total,
    water: objective.water / total,
    simplicity: objective.simplicity / total,
  }
}

export const presetMatching = (objective: DesignObjective): ObjectivePresetId | null =>
  OBJECTIVE_PRESETS.find((preset) =>
    OBJECTIVE_KEYS.every((key) => Math.abs(preset.weights[key] - objective[key]) < 1e-6),
  )?.id ?? null

/**
 * One weight moved and the other three left where they were. Each dial says how much that one thing
 * matters on its own. Re-spreading the four so they always summed to 1 would let a gardener who
 * pushed "using less water" to the top watch "electricity from the panels" fall to nothing.
 * `answersOf` normalizes the four when the search reads them, and the readouts show those shares
 */
export const withObjectiveWeight = (
  objective: DesignObjective,
  key: ObjectiveKey,
  value: number,
): DesignObjective => ({ ...objective, [key]: Math.min(1, Math.max(0, value)) })

export const DEFAULT_WIZARD_ANSWERS: WizardAnswers = {
  objective: BALANCED,
  ambition: 'mixed-vegetables',
  exposure: 'open',
  mounting: 'any',
  maxHeightM: null,
  irrigationAvailable: true,
  experience: 'novice',
  maxBeds: null,
}

/**
 * Which answers the layout search actually reads, and therefore which ones make a finished search
 * stale when they move.
 *
 * `experience` is the whole point of stating this. It appears nowhere in `src/recommend`: it picks
 * whether figures are shown beside the plain sentences, and nothing else. Dropping a finished
 * search because somebody asked to see the numbers would throw away five annual bakes and put "Show
 * me some layouts" back on a screen that was already showing the answers, which is the opposite of
 * what the control promises: something to try.
 *
 * Stated as the fields that DO invalidate, so a new answer added
 * to `WizardAnswers` has to be classified on purpose. Getting that wrong the safe way costs a
 * re-run. Getting it wrong the other way shows figures computed for answers nobody gave
 */
export const SEARCH_ANSWER_FIELDS: readonly (keyof WizardAnswers)[] = [
  'objective',
  'ambition',
  'exposure',
  'mounting',
  'maxHeightM',
  'irrigationAvailable',
  'maxBeds',
]

export const staleSearchAfter = (patch: Partial<OnboardingAnswers>): boolean =>
  Object.keys(patch).some(
    (field) => field === 'location' || SEARCH_ANSWER_FIELDS.includes(field as keyof WizardAnswers),
  )

/** The size the search was asked to lay out, when there's no plot yet to read it off */
const DEFAULT_PLOT_WIDTH_M = meters(8)
const DEFAULT_PLOT_DEPTH_M = meters(6)

/**
 * How big the space is, read off the plot boundary's extent. A hand-drawn boundary that is not a
 * rectangle is measured by its bounding box, which is what the search lays candidates out in.
 * `PlotSizeSection` says so beside the fields
 */
export const plotSizeOf = (
  plot: GardenPlot | null,
): { readonly widthM: Meters; readonly depthM: Meters } => {
  if (plot === null) return { widthM: DEFAULT_PLOT_WIDTH_M, depthM: DEFAULT_PLOT_DEPTH_M }
  const extent = extentOf([plot.boundary.exterior])
  return {
    widthM: meters(extent.maxXM - extent.minXM),
    depthM: meters(extent.maxYM - extent.minYM),
  }
}

/** The engine's full answer set: the questions, the place, and the plot's own size */
export const answersOf = (
  answers: WizardAnswers,
  location: LatLon,
  locationLabel: string,
  plot: GardenPlot | null,
): OnboardingAnswers => {
  const size = plotSizeOf(plot)
  return {
    ...answers,
    plotWidthM: size.widthM,
    plotDepthM: size.depthM,
    objective: normalizeObjective(answers.objective),
    // a drawn house answers what is already around the space, so the search reads that over
    // the three-answer share the moment one stands (Decision Record 26)
    exposure: exposureInForce(plot?.obstructions ?? [], answers.exposure),
    location,
    locationLabel,
  }
}

/**
 * What the grower said about watering, on every bed the wizard writes. It gates the
 * water-limited pathway in the recommender, so answering "no" and being handed drip beds
 * would have the ranking score crops against water nobody can give them
 */
export const irrigationFor = (answers: WizardAnswers): Irrigation => ({
  method: answers.irrigationAvailable ? 'drip' : 'none',
  available: answers.irrigationAvailable,
  appliedMmPerYear: millimetersPerYear(answers.irrigationAvailable ? 180 : 0),
})

/**
 * Simplicity is a preference for fewer things to look after, so it's what caps how many
 * crops a bed is allowed to carry
 */
export const cropsPerBedFor = (objective: DesignObjective): number =>
  Math.max(
    1,
    Math.round(DEFAULT_MAX_CROPS_PER_BED * (1 - normalizeObjective(objective).simplicity)),
  )

/**
 * The plot the answers describe, keeping the identity of whatever plot is already open.
 * A layout placed against a baked light field is used when there's one. Without it the
 * beds are evenly spread, which is all geometry alone can justify.
 *
 * The boundary is rebuilt as a rectangle of the current plot's extent at the origin, because
 * `design.ts` places every candidate in an origin-centered frame: an off-center or hand-drawn
 * boundary is replaced by the rectangle the search actually laid out in.
 *
 * `soil` is the place's own reading, from `soilForSite`, so a layout placed after the lookup
 * carries it onto every bed the same way a drawn bed or a press of "Add bed" does. Before it,
 * every placed bed read the assumed loam until somebody edited it by hand
 */
export const plotFromAnswers = (
  answers: WizardAnswers,
  current: GardenPlot | null,
  layout: BedLayout | null = null,
  soil: SoilProfile = DEFAULT_SOIL,
): GardenPlot => {
  const base = current ?? makePlot()
  const size = plotSizeOf(current)
  const widthM = Math.max(1, size.widthM)
  const depthM = Math.max(1, size.depthM)
  const irrigation = irrigationFor(answers)
  const placed: readonly Bed[] =
    layout === null
      ? evenFootprints(widthM, depthM, answers.maxBeds ?? undefined).map((footprint, index) =>
          makeBed(index + 1, { footprint, irrigation, soil }),
        )
      : layout.beds.map((bed, index) =>
          makeBed(index + 1, { footprint: bed.footprint, label: bed.label, irrigation, soil }),
        )
  return {
    ...base,
    boundary: polygonOf(rectangleRing(vec2(0, 0), widthM, depthM)),
    beds: placed,
  }
}

/** The candidate's geometry and tracker on the array already in the plot, or on a new one */
/**
 * The plot a scenario would write, built once and used by BOTH the preview and the apply.
 *
 * A preview that is drawn by a second implementation is a preview that can lie about what the
 * button does, and this one is shown next to the button. `applyDesign` puts the result on the
 * store. The wizard hands the same object to the scene without committing it, so what a grower
 * sees under the cursor is the garden they get, down to the bed positions
 */
export const plotForScenario = (
  answers: WizardAnswers,
  current: GardenPlot | null,
  scenario: DesignScenario,
  soil: SoilProfile = DEFAULT_SOIL,
): GardenPlot => {
  const layout = scenario.layout
  const base = plotFromAnswers(answers, current, layout.beds.length === 0 ? null : layout, soil)
  return scenario.candidate.archetype === 'no-array-control'
    ? { ...base, arrays: [] }
    : {
        ...base,
        arrays: [withDerived(arrayFromCandidate(scenario.candidate, base.arrays[0] ?? null))],
      }
}

/* ------------------------------- reading an option ------------------------------- */

/**
 * The three answers whose consequence can be computed before they're chosen. Each is a field
 * of `WizardAnswers`, separate from a step, because the practical step asks two questions and only
 * one of them changes anything the search would build.
 *
 * `exposure` is deliberately not here. It's the one answer about what is ALREADY around the
 * space, and nothing here holds a house, a fence or a tree. All a figure could say is the
 * design's response, a panel footprint scaled by `EXPOSURE_SHADE_SCALE`, which reads as "saying
 * you are overshadowed shrinks the panels" with the shade that caused it out of the picture
 */
export type OptionField = 'objective' | 'ambition' | 'mounting'

/** One answer option, named the way its radio names it */
export interface OptionChoice {
  readonly field: OptionField
  readonly value: string
}

const AMBITIONS: readonly GrowingAmbition[] = [
  'leafy-and-herbs',
  'mixed-vegetables',
  'fruiting-and-berries',
]

const MOUNTINGS: readonly MountingPreference[] = [
  'any',
  'overhead-canopy',
  'ground-rows',
  'vertical-bifacial',
]

/**
 * The answers as they WOULD be if this option were chosen. Everything downstream, the candidate
 * geometry and the bed placement both, is then the same function of the same answers that
 * choosing the option and pressing Next would run, so a figure printed under an option can't
 * drift away from what choosing it does. An option this doesn't recognize leaves the answers
 * alone
 */
export const answersWithOption = (answers: WizardAnswers, choice: OptionChoice): WizardAnswers => {
  if (choice.field === 'objective') {
    const preset = OBJECTIVE_PRESETS.find((entry) => entry.id === choice.value)
    return preset === undefined ? answers : { ...answers, objective: preset.weights }
  }
  if (choice.field === 'ambition') {
    const ambition = AMBITIONS.find((entry) => entry === choice.value)
    return ambition === undefined ? answers : { ...answers, ambition }
  }
  const mounting = MOUNTINGS.find((entry) => entry === choice.value)
  return mounting === undefined ? answers : { ...answers, mounting }
}

const ARCHETYPE_BY_PRESET: Readonly<Record<ObjectivePresetId, CandidateArchetype>> = {
  'mostly-food': 'food-first',
  balanced: 'balanced',
  'mostly-electricity': 'energy-first',
}

/**
 * Which candidate an objective leans toward.
 *
 * The objective is a weight vector the ranking reads, and it reaches no candidate's geometry at
 * all: what it decides is which of the three tilted archetypes comes back marked. So a figure
 * under a choice reads the archetype the choice LEANS TOWARD, one for one with the three
 * presets, and it's only a lean: the ranking runs against a baked year of this
 * location's weather and can still hand back a different one
 */
export const archetypeLeaning = (objective: DesignObjective): CandidateArchetype => {
  const preset = presetMatching(objective)
  return preset === null ? 'balanced' : ARCHETYPE_BY_PRESET[preset]
}

export const arrayFromCandidate = (
  candidate: ArrayCandidate,
  existing: PvArray | null,
): PvArray => {
  const patch = {
    label: candidate.label,
    geometry: candidate.geometry,
    tracker: candidate.tracker,
  }
  return existing === null ? makeArray(1, patch) : { ...existing, ...patch }
}
