import type { Crop } from '../types/crop'
import type { Planting } from '../types/garden'

/**
 * Where a planting is in its own season.
 *
 * This lives in `src/state`, separate from `src/scene`, because two surfaces read it and they are
 * only allowed to meet here: the scene scales a canopy by it, and the bed panel uses it to say in
 * writing that a bed with plants in it is bare today. One function, so the picture and the prose
 * can never disagree about whether something is in the ground.
 */

const DAYS_PER_YEAR = 365
const wrapDays = (days: number): number => ((days % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR

/** A transplant is already a plant; the scrubber should not start it from nothing */
export const SEEDLING_SCALE = 0.14
/** A perennial out of season is dormant, not absent. Its frame is still standing in January */
export const DORMANT_SCALE = 0.45

/**
 * The planting's size as a share of its mature size, on the day the scrubber is on.
 *
 * The window is the planting's own `sowDay`, `harvestStartDay` and `harvestEndDay`, so the scene
 * changes across the year from the same three numbers the calendar and the agenda are built from.
 * Growth runs on a smoothstep, because that is the shape a growth curve has:
 * slow to establish, fast through development, levelling off at harvest.
 *
 * An annual outside its window returns zero and is not drawn at all. That is the honest reading:
 * in February the bed is bare. A perennial never returns zero, because its crown is still there
 */
export const seasonalScale = (
  planting: Planting,
  crop: Crop | undefined,
  dayOfYear: number,
): number => {
  const perennial = crop?.lifeCycle === 'perennial' || crop?.lifeCycle === 'woody-perennial'
  const span = Math.max(1, wrapDays(planting.harvestEndDay - planting.sowDay))
  const since = wrapDays(dayOfYear - planting.sowDay)
  if (since > span) return perennial ? DORMANT_SCALE : 0
  const toHarvest = Math.max(1, wrapDays(planting.harvestStartDay - planting.sowDay))
  const progress = Math.min(1, since / toHarvest)
  const grown = SEEDLING_SCALE + (1 - SEEDLING_SCALE) * progress * progress * (3 - 2 * progress)
  return perennial ? Math.max(DORMANT_SCALE, grown) : grown
}

/**
 * The plantings a bed is carrying that today's date draws nothing for. Empty when the bed is
 * empty, so "nothing planted" and "planted but out of season" stay two different states
 */
export const outOfSeason = (
  plantings: readonly Planting[],
  cropOf: (planting: Planting) => Crop | undefined,
  dayOfYear: number,
): readonly Planting[] =>
  plantings.filter((planting) => seasonalScale(planting, cropOf(planting), dayOfYear) <= 0)
