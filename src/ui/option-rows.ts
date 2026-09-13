import { candidatesFor } from '../recommend/design'
import {
  answersOf,
  answersWithOption,
  archetypeLeaning,
  type OptionChoice,
  type WizardAnswers,
} from '../state/onboarding'
import { attempt } from '../state/safe'
import type { GardenPlot } from '../types/garden'
import type { LatLon } from '../types/geo'
import type { Site } from '../types/site'
import { plural } from './format'

/**
 * What an answer option would do to the panels, said in a figure under the option.
 *
 * The wants step used to draw a translucent array in the scene as the pointer crossed the
 * cards. What it was doing there was never obvious to anyone watching it
 * ("you don't know why it's doing it"), it stayed on screen on the panels step for an answer
 * already given, and its shade was unmeasured by design. One sentence does the same job: this
 * choice leaves room for this many rows. It reads the same `candidatesFor` the search starts
 * from, which is arithmetic over the answers, so it costs nothing to compute for every option
 * when a step renders, and it never simulates anything
 */

export interface OptionRowInputs {
  readonly answers: WizardAnswers
  readonly plot: GardenPlot | null
  readonly site: Site | null
  readonly location: LatLon
  readonly locationLabel: string
}

/**
 * Latitude is the only thing `candidatesFor` reads off the site: the tilt rule, the
 * equator-facing azimuth and the tracking cut-off are all functions of it, and no part of a
 * candidate's geometry touches the soil, the normals or the water balance. So a figure does not
 * have to wait on a site lookup, and hands over to the resolved site the moment there is one.
 * The stand-in is only ever passed to `candidatesFor`, and `attempt` drops the figure rather
 * than printing one built on a hole should that ever grow a second reading off the site
 */
const siteFor = (site: Site | null, location: LatLon): Site =>
  site ?? ({ location } as unknown as Site)

/** How many rows of panels choosing this option would lead the search to, or null if unknown */
export const panelRowsFor = (choice: OptionChoice, inputs: OptionRowInputs): number | null => {
  const answers = answersWithOption(inputs.answers, choice)
  const built = attempt(() =>
    candidatesFor(
      answersOf(answers, inputs.location, inputs.locationLabel, inputs.plot),
      siteFor(inputs.site, inputs.location),
    ),
  )
  if (!built.ok) return null
  const offered = built.value.filter((entry) => entry.archetype !== 'no-array-control')
  const wanted = archetypeLeaning(answers.objective)
  const chosen = offered.find((entry) => entry.archetype === wanted) ?? offered[0]
  return chosen === undefined ? null : chosen.geometry.rowCount
}

/** "Room for 3 rows of panels", after the option's own help line */
export const rowsSentence = (rows: number | null): string | null =>
  rows === null
    ? null
    : rows === 0
      ? 'Leaves no room for panels'
      : `Room for ${plural(rows, 'row', 'rows')} of panels`
