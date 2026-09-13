import { describe, expect, it } from 'bun:test'
import { bedId } from '../types/ids'
import type { BedLight, RasterQuality } from '../types/light'
import type { ByMonth, Fraction, MolPerM2Day } from '../types/units'
import { bedLightSummary } from './bed-light'
import { SIM_GROWING_WINDOW } from './defaults'

const twelve = (values: readonly number[]): ByMonth<MolPerM2Day> =>
  values.map((value) => value as MolPerM2Day) as unknown as ByMonth<MolPerM2Day>

const quality: RasterQuality = {
  subdivision: 'tregenza-mf1' as never,
  sunDirectionCount: 145,
  substepsPerHour: 1,
  parFraction: 0.45 as Fraction,
  photonConversionUmolPerJ: 4.57,
  interreflectionApplied: false,
  seasonalParHalfWidthFraction: 0 as Fraction,
}

/** Open sky 30 all year; under the panels 15 from April to September and 30 outside it */
const shaded: BedLight = {
  bedId: bedId('bed-1'),
  cellCount: 40,
  monthlyMeanDliMolM2Day: twelve([30, 30, 30, 15, 15, 15, 15, 15, 15, 30, 30, 30]),
  monthlyMinDliMolM2Day: twelve([30, 30, 30, 9, 9, 9, 9, 9, 9, 30, 30, 30]),
  monthlyOpenSkyDliMolM2Day: twelve([30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]),
  monthlyRsr: twelve([
    0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0, 0, 0,
  ]) as unknown as ByMonth<Fraction>,
  annualMeanDliMolM2Day: 22.5 as MolPerM2Day,
  skyViewFactor: 0.6 as Fraction,
  homogeneity: { coefficientOfVariation: 0.2 as Fraction, minOverMean: 0.6 as Fraction },
  quality,
}

describe('a bed summarised over the growing season, off the light the editor holds', () => {
  it('reads the months of the growing season and nothing outside them', () => {
    const summary = bedLightSummary(shaded, SIM_GROWING_WINDOW)
    expect(summary.meanGrowingSeasonDli).toBe(15)
    expect(summary.worstCellGrowingSeasonDli).toBe(9)
    expect(summary.shadeRatio).toBeCloseTo(0.5, 6)
  })

  it('reads a bed under open sky as losing nothing', () => {
    const open: BedLight = {
      ...shaded,
      monthlyMeanDliMolM2Day: shaded.monthlyOpenSkyDliMolM2Day,
      monthlyMinDliMolM2Day: shaded.monthlyOpenSkyDliMolM2Day,
    }
    const summary = bedLightSummary(open, SIM_GROWING_WINDOW)
    expect(summary.meanGrowingSeasonDli).toBe(30)
    expect(summary.shadeRatio).toBe(0)
  })
})
