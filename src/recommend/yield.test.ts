import { describe, expect, it } from 'bun:test'
import { laubCurve } from '../data/crops'
import { bedId, cropId } from '../types/ids'
import type { Fraction } from '../types/units'
import { estimateYield, WEAK_EVIDENCE_STUDY_COUNT } from './yield'

const estimateAt = (rsr: number, crowdingPenalty: number, waterLimited = false) =>
  estimateYield(
    cropId('test-crop'),
    bedId('test-bed'),
    laubCurve('leafy-vegetables'),
    rsr as Fraction,
    crowdingPenalty as Fraction,
    waterLimited,
    [],
  ).relativeYield

/**
 * Every term is listed with its own share, and the dominant one is the one that moves the band
 * most. Laub et al. 2022's curve holds no spacing term, so a crowded planting's loss shows up as
 * the crowding term
 */
describe('the yield band names its terms', () => {
  it('lists crowding as its own term with the share it takes', () => {
    const band = estimateAt(0.01, 0.37)
    const crowding = band.contributions.find((term) => term.source === 'crowding')
    expect(crowding?.halfWidthFraction).toBeCloseTo(0.37, 6)
    expect(band.contributions.map((term) => term.source)).toEqual([
      'crop-response',
      'seasonal-par',
      'crowding',
    ])
    expect(band.dominantSource).toBe('crowding')
  })

  it('reads at or near full yield at 1% shade with no crowding, capped at 100%', () => {
    const band = estimateAt(0.01, 0)
    expect(band.interval.upper).toBe(1)
    expect(band.interval.lower).toBeGreaterThan(0.85)
    // the published interval is a hair wide there, so the PAR allowance is what moves the band
    expect(band.dominantSource).toBe('seasonal-par')
    expect(band.contributions.find((term) => term.source === 'crowding')?.halfWidthFraction).toBe(0)
  })

  it('attributes deep shade to the published curve, whose interval is widest there', () => {
    const band = estimateAt(0.4, 0)
    expect(band.dominantSource).toBe('crop-response')
    expect(band.confidence).toBe(0.95)
    expect(band.intervalKind).toBe('confidence')
  })

  it('withholds the gain only where the site is not water-limited', () => {
    expect(estimateAt(0.01, 0, true).interval.upper).toBeGreaterThan(1)
    expect(estimateAt(0.01, 0, false).interval.upper).toBe(1)
  })
})

describe('estimateYield caveat codes', () => {
  it('never collides the Laub-evidence caveat with the DLI-tier caveat it is merged with', () => {
    // 'fruity-vegetables' is a real weak-evidence group (3 studies, below the threshold), so this
    // exercises the actual merge path rather than a synthetic curve
    const curve = laubCurve('fruity-vegetables')
    expect(curve.studyCount).toBeLessThanOrEqual(WEAK_EVIDENCE_STUDY_COUNT)

    // mirrors exactly what pipeline.ts passes in when the crop's own DLI tier is C, so this
    // reproduces the two-emitter collision the regression guards against
    const estimate = estimateYield(
      cropId('test-crop'),
      bedId('test-bed'),
      curve,
      0.4 as Fraction,
      0 as Fraction,
      false,
      [
        {
          code: 'tier-c-inference',
          message:
            'The DLI threshold for this crop is inferred from its sun-hour class. Trust the ranking order, and treat the number itself as provisional',
        },
      ],
    )

    const codes = estimate.caveats.map((caveat) => caveat.code)
    expect(new Set(codes).size).toBe(codes.length)

    const messages = estimate.caveats.map((caveat) => caveat.message)
    expect(new Set(messages).size).toBe(messages.length)

    expect(codes).toContain('tier-c-inference')
    expect(codes).toContain('weak-evidence-base')
  })
})
