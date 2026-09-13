import { monthsInWindow } from '../sim/aggregate'
import { relativeShadeRatio } from '../sim/units'
import type { BedLight, GrowingWindow } from '../types/light'
import type { BedLightSummary } from '../types/onboarding'
import type { Fraction, MolPerM2Day } from '../types/units'

const mean = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * A bed's light over the growing season, read off the light the editor holds now.
 *
 * This reads `BedLight`, which every bake and every guided apply rewrites, over the months the
 * editor treats as the growing season, so the three figures follow every bake. A snapshot from the
 * layout search would never move. The darkest spot is the darkest cell each month averaged over the
 * season, which is that cell's season mean where one cell stays darkest all season
 */
export const bedLightSummary = (light: BedLight, window: GrowingWindow): BedLightSummary => {
  const months = monthsInWindow(window)
  const under = mean(months.map((month) => light.monthlyMeanDliMolM2Day[month] ?? 0))
  const open = mean(months.map((month) => light.monthlyOpenSkyDliMolM2Day[month] ?? 0))
  const worst = mean(months.map((month) => light.monthlyMinDliMolM2Day[month] ?? 0))
  return {
    meanGrowingSeasonDli: under as MolPerM2Day,
    worstCellGrowingSeasonDli: worst as MolPerM2Day,
    shadeRatio: relativeShadeRatio(under as MolPerM2Day, open as MolPerM2Day) as Fraction,
  }
}
