import { growingWindowFor } from '../../data/crops'
import { clamp, MONTH_LENGTH_DAYS, monthsInWindow } from '../../data/util'
import { shadeBenefitStatusOf } from '../../data/water'
import type { Crop } from '../../types/crop'
import type { BedLight, SeasonLight } from '../../types/light'
import type { LimitingFactor } from '../../types/recommend'
import type { Site } from '../../types/site'
import type { Fraction, MolPerM2Day, MonthIndex } from '../../types/units'

export interface LightGateOutcome {
  readonly passed: boolean
  readonly light: SeasonLight
  readonly fit: Fraction
  readonly shadeBenefitBonus: Fraction
  readonly limiting: LimitingFactor | null
}

/** Heat days at or above this count make panel shade a meaningful mitigation */
export const HEAT_DAY_BONUS_THRESHOLD = 30

export const HEAT_DAY_BONUS_SATURATION = 90

export const MAX_SHADE_BENEFIT_BONUS = 0.15

const monthValue = (values: readonly number[], month: number): number => values[month - 1] ?? 0

/**
 * Season light for one crop in one bed, evaluated against the crop's own
 * growing window rather than the annual mean. Cumulative RSR is the
 * day-weighted photon deficit across that window, which is the quantity the
 * Laub curves are defined on
 */
export const seasonLightFor = (crop: Crop, light: BedLight, site: Site): SeasonLight => {
  const window = growingWindowFor(crop, site.location.latitudeDeg)
  const months = monthsInWindow(window.startMonth, window.endMonth)
  const ceiling = crop.light.dliMaxBeforeDisorderMolM2Day?.value ?? null

  let weightedDli = 0
  let underArrayMol = 0
  let openSkyMol = 0
  let days = 0
  let minMonthly = Number.POSITIVE_INFINITY
  let maxMonthly = Number.NEGATIVE_INFINITY
  let daysAboveCeiling = 0

  for (const month of months) {
    const monthDays = MONTH_LENGTH_DAYS[month - 1] ?? 30
    const mean = monthValue(light.monthlyMeanDliMolM2Day, month)
    const open = monthValue(light.monthlyOpenSkyDliMolM2Day, month)
    const floor = monthValue(light.monthlyMinDliMolM2Day, month)
    weightedDli += mean * monthDays
    underArrayMol += mean * monthDays
    openSkyMol += open * monthDays
    days += monthDays
    minMonthly = Math.min(minMonthly, floor)
    maxMonthly = Math.max(maxMonthly, mean)
    if (ceiling !== null && mean > ceiling) daysAboveCeiling += monthDays
  }

  return {
    bedId: light.bedId,
    window,
    meanDliMolM2Day: (days === 0 ? 0 : weightedDli / days) as MolPerM2Day,
    minMonthlyDliMolM2Day: (Number.isFinite(minMonthly) ? minMonthly : 0) as MolPerM2Day,
    maxMonthlyDliMolM2Day: (Number.isFinite(maxMonthly) ? maxMonthly : 0) as MolPerM2Day,
    cumulativeRsr: clamp(openSkyMol <= 0 ? 0 : 1 - underArrayMol / openSkyMol, 0, 1) as Fraction,
    daysAboveDisorderCeiling: daysAboveCeiling,
  }
}

export const dliFit = (
  seasonLight: SeasonLight,
  minMolM2Day: number,
  targetMolM2Day: number,
  disorderCeilingMolM2Day: number | null,
): Fraction => {
  const mean = seasonLight.meanDliMolM2Day
  if (mean <= minMolM2Day) return 0 as Fraction
  const span = targetMolM2Day - minMolM2Day
  const rising = span <= 0 ? 1 : clamp((mean - minMolM2Day) / span, 0, 1)
  if (disorderCeilingMolM2Day === null || mean <= disorderCeilingMolM2Day) {
    return rising as Fraction
  }
  const overshoot = (mean - disorderCeilingMolM2Day) / Math.max(disorderCeilingMolM2Day, 1)
  return clamp(rising * (1 - Math.min(overshoot, 0.5)), 0, 1) as Fraction
}

export const rsrWithinDesignCeiling = (seasonLight: SeasonLight, maxDesignRsr: Fraction): boolean =>
  seasonLight.cumulativeRsr <= maxDesignRsr

/**
 * The shade-benefit bonus scales with the graded water-limitation index, with heat days, AND
 * with the shade the bed actually has. The mechanism is reduced heat and evaporative stress, so
 * it stays at zero on a cool humid site and reaches its maximum only where rainfall covers none
 * of season demand (Decision Record 6).
 *
 * The bonus is a claim that SHADE helps this crop here, so a bed with no shade in it has nothing to
 * award: paying it on site heat and water alone would hand the full bonus to every shade-tolerant
 * crop in open sun. Measured at Phoenix on a bed reading 42 mol/m2/d with a cumulative RSR of 0.02,
 * that put **ramps**, an eastern North American woodland ephemeral, above okra, cowpea and sorghum,
 * which beat it on climate fit 0.840 to 0.700 and lost anyway on a 0.114 bonus they could not
 * receive.
 *
 * Scaling by `cumulativeRsr` is the same quantity the Laub curves are defined on and the same
 * one `maxDesignRsr` is written in, so the bonus now grows with the shade exactly as the yield
 * response it stands for does
 */
export const shadeBenefitBonus = (crop: Crop, site: Site, seasonLight: SeasonLight): Fraction => {
  if (!crop.light.shadeBenefitingWhenWaterLimited) return 0 as Fraction
  const water = shadeBenefitStatusOf(site.waterLimitation)
  if (!water.active) return 0 as Fraction
  if (site.heatDaysAbove30C < HEAT_DAY_BONUS_THRESHOLD) return 0 as Fraction
  const span = HEAT_DAY_BONUS_SATURATION - HEAT_DAY_BONUS_THRESHOLD
  const heat = clamp((site.heatDaysAbove30C - HEAT_DAY_BONUS_THRESHOLD) / span, 0, 1)
  const shade = clamp(seasonLight.cumulativeRsr, 0, 1)
  return (heat * water.scale * shade * MAX_SHADE_BENEFIT_BONUS) as Fraction
}

const asMonth = (month: number): MonthIndex => month as MonthIndex

export const lightGate = (crop: Crop, light: BedLight, site: Site): LightGateOutcome => {
  const seasonLight = seasonLightFor(crop, light, site)
  const minimum = crop.light.dliMinMolM2Day.value
  const target = crop.light.dliTargetMolM2Day.value
  const ceiling = crop.light.dliMaxBeforeDisorderMolM2Day?.value ?? null
  const fit = dliFit(seasonLight, minimum, target, ceiling)
  const bonus = shadeBenefitBonus(crop, site, seasonLight)
  const months = monthsInWindow(seasonLight.window.startMonth, seasonLight.window.endMonth)

  for (const month of months) {
    if (monthValue(light.monthlyMeanDliMolM2Day, month) < minimum) {
      return {
        passed: false,
        light: seasonLight,
        fit,
        shadeBenefitBonus: bonus,
        limiting: {
          stage: 'light-gate',
          cause: { kind: 'dli-minimum', month: asMonth(month) },
          membership: clamp(
            monthValue(light.monthlyMeanDliMolM2Day, month) / Math.max(minimum, 1),
            0,
            1,
          ) as Fraction,
          explanation: `Only ${monthValue(light.monthlyMeanDliMolM2Day, month).toFixed(1)} mol/m²/d reaches this bed in month ${String(month)}, and this crop needs at least ${minimum.toFixed(1)}`,
        },
      }
    }
  }

  if (!rsrWithinDesignCeiling(seasonLight, crop.light.maxDesignRsr.value)) {
    return {
      passed: false,
      light: seasonLight,
      fit,
      shadeBenefitBonus: bonus,
      limiting: {
        stage: 'light-gate',
        cause: { kind: 'max-design-rsr' },
        membership: clamp(
          crop.light.maxDesignRsr.value / Math.max(seasonLight.cumulativeRsr, 0.001),
          0,
          1,
        ) as Fraction,
        explanation: `Season-cumulative shade here is ${(seasonLight.cumulativeRsr * 100).toFixed(0)} percent, above the ${(crop.light.maxDesignRsr.value * 100).toFixed(0)} percent design ceiling for this crop class`,
      },
    }
  }

  if (ceiling !== null && seasonLight.daysAboveDisorderCeiling > crop.light.disorderSustainedDays) {
    const offender = months.find(
      (month) => monthValue(light.monthlyMeanDliMolM2Day, month) > ceiling,
    )
    return {
      passed: true,
      light: seasonLight,
      fit,
      shadeBenefitBonus: bonus,
      limiting: {
        stage: 'light-gate',
        cause: { kind: 'dli-disorder-ceiling', month: asMonth(offender ?? months[0] ?? 1) },
        membership: fit,
        explanation: `Light stays above ${ceiling.toFixed(0)} mol/m²/d for ${String(seasonLight.daysAboveDisorderCeiling)} days, long enough to risk a physiological disorder such as tipburn`,
      },
    }
  }

  return { passed: true, light: seasonLight, fit, shadeBenefitBonus: bonus, limiting: null }
}
