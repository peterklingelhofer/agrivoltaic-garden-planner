import type { ClimateNormals } from '../types/weather'

/**
 * How much of the ground is under snow, and what that does to its albedo.
 *
 * It draws the winter ground, and the PV chain reads it as well, so it is more than **a rendering
 * inference**, for the reason below.
 *
 * The PV chain held the ground at one albedo for all 8,760 hours. At a site with real winters
 * that is wrong in a direction and by an amount that matters: snow is the brightest surface a
 * garden ever has, the rear side of a bifacial module sees the ground and almost nothing else,
 * and treating a snowfield as grass understates the modelled year by around three percent at
 * Amherst. That snow is seasonal and dominates monthly ground reflectivity where it falls is the
 * established result Thevenard and Haddad set out for building simulation, and it is why a single
 * annual figure was the wrong shape for this term.
 *
 * So the choice was between two models of the same snow: the one the renderer already had, or a
 * second one for the simulation. A second one would have let the picture and the number disagree
 * about whether there is snow on the ground, which is the disagreement this codebase keeps
 * refusing to allow. This is that one model, moved to the layer both halves can reach.
 *
 * What it is NOT, and this has not changed: a snow model. It reads monthly normals, so it knows
 * nothing about a particular winter, about melt and refreeze, about drifting, or about snow
 * lying on the modules rather than under them. It is a smooth seasonal weighting between two
 * surfaces the site plausibly has. The loss stack's own `snow` component, which is about covered
 * MODULES rather than covered ground, is a separate term and is still zero
 */

const DAYS_PER_YEAR = 365

const wrapDays = (days: number): number => ((days % DAYS_PER_YEAR) + DAYS_PER_YEAR) % DAYS_PER_YEAR

/**
 * Below `SNOW_FULL_C` as a monthly mean the ground is covered, above `SNOW_NONE_C` it is bare, and
 * between the two it is partly covered
 */
const SNOW_FULL_C = -3
const SNOW_NONE_C = 2

/**
 * A month too dry to hold a cover, in monthly precipitation. Continental interiors run cold and
 * dry, and putting deep snow on ground that gets 8 mm in January would be a prettier lie
 */
const SNOW_DRY_MM = 12
const SNOW_WET_MM = 35

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** Linear between two monthly normals, so the year crosses a season rather than a step */
const monthlyAt = (monthly: readonly number[], dayOfYear: number): number => {
  if (monthly.length !== 12) return Number.NaN
  const position = (wrapDays(dayOfYear - 1) / DAYS_PER_YEAR) * 12 - 0.5
  const low = Math.floor(position)
  const fraction = position - low
  const at = (index: number): number => monthly[((index % 12) + 12) % 12] as number
  return at(low) * (1 - fraction) + at(low + 1) * fraction
}

/**
 * How covered the ground is on this day, from the site's own monthly normals.
 *
 * Temperature sets whether a cover survives and precipitation sets whether there is one to
 * survive, because those are the two questions a monthly normal can actually answer. A month at
 * -3 C or below reads fully covered where it is also wet enough; +2 C and above reads bare, which
 * is above freezing because a monthly MEAN of zero still has thaw in it.
 *
 * It returns 0 for a site with no normals rather than guessing, so a garden with no resolved site
 * gets summer ground and its unmodified cover albedo rather than an invented snowfield
 */
export const groundSnowCover = (
  monthlyMeanTempC: readonly number[],
  monthlyPrecipMm: readonly number[],
  dayOfYear: number,
): number => {
  const temperature = monthlyAt(monthlyMeanTempC, dayOfYear)
  const precipitation = monthlyAt(monthlyPrecipMm, dayOfYear)
  if (!Number.isFinite(temperature) || !Number.isFinite(precipitation)) return 0
  const cold = clamp01((SNOW_NONE_C - temperature) / (SNOW_NONE_C - SNOW_FULL_C))
  const wet = clamp01((precipitation - SNOW_DRY_MM) / (SNOW_WET_MM - SNOW_DRY_MM))
  return cold * wet
}

const MILLIS_PER_DAY = 86_400_000

const dayOfYearUtc = (millis: number): number => {
  const start = Date.UTC(new Date(millis).getUTCFullYear(), 0, 1)
  return Math.floor((millis - start) / MILLIS_PER_DAY) + 1
}

/**
 * One snow fraction per hour of the year, on the timestamps the weather itself carries.
 *
 * Per hour rather than per day because the chain reads it per hour and a branch that recomputed
 * it inside the loop would be doing 8,760 date constructions to answer 365 questions
 */
export const snowCoverSeries = (normals: ClimateNormals, utcMillis: Float64Array): Float32Array => {
  const cover = new Float32Array(utcMillis.length)
  const byDay = new Map<number, number>()
  for (let i = 0; i < utcMillis.length; i += 1) {
    const day = dayOfYearUtc(utcMillis[i] as number)
    const cached = byDay.get(day)
    if (cached !== undefined) {
      cover[i] = cached
      continue
    }
    const value = groundSnowCover(normals.monthlyMeanTempC, normals.monthlyPrecipMm, day)
    byDay.set(day, value)
    cover[i] = value
  }
  return cover
}
