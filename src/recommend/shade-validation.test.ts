import { describe, expect, it } from 'bun:test'
import TABLE from '../../docs/laub-2022-table-s2.json'
import {
  cropById,
  laubCurve,
  LAUB_ANOVA,
  LAUB_B2_PER_PERCENT_RSR,
  LAUB_RSR_LEVELS_PERCENT,
  loadCropCatalog,
} from '../data/crops'
import type { Crop } from '../types/crop'
import type { CropId } from '../types/ids'
import type { Fraction } from '../types/units'
import { laubCentralRelativeYield, laubRelativeYield } from './yield'

/**
 * Checks this app's shade-to-yield response against published field trials, crop by crop.
 *
 * `src/recommend/yield.ts` has no external oracle of its own: its only test before this file
 * (`yield.test.ts`) checks that the code agrees with itself. This file drives the same functions
 * `season.ts` calls in production (`laubCurve`, `laubCentralRelativeYield`, `laubRelativeYield`)
 * at the shade level a real trial ran at, for the real crop the trial grew, and compares. Where
 * the app agrees with a trial, the assertion says so with both numbers close together. Where it
 * can't, per Decision Record 6 (the shade-benefit pathway) and Decision Record 14 (a season's
 * realized yield), the test pins the known gap rather than failing red with no explanation: the
 * point is a documented expectation a reader can see the reason for, not a passing assertion that
 * hides a disagreement or a red build that explains nothing
 *
 * Every number below was checked against the cited primary source. Two trials
 * couldn't be reduced to a single verified shade level or yield ratio and are named in
 * `docs/VALIDATION.md` instead of encoded here: Marrou et al. 2013b's cucumber result (juvenile
 * growth rate, with no final yield ratio) and Amaducci et al. 2018's rainfed corn gain (real and
 * qualitative, but the paper reports "higher and more stable," with no number this file can pin)
 */

const need = (catalog: readonly Crop[], id: string): Crop => {
  const crop = cropById(catalog, id as CropId)
  if (crop === undefined) throw new Error(`missing fixture crop ${id}`)
  return crop
}

const catalogPromise = loadCropCatalog()

const RSR_DOMAIN: readonly Fraction[] = LAUB_RSR_LEVELS_PERCENT.map(
  (percent) => (percent / 100) as Fraction,
)

/**
 * A thousandth of b2, which is two hundred times the error the recovery actually carries
 * (4.8e-10 against a coefficient of 7.3e-5) and a hundredth of the perturbation the test has to
 * catch, so it fails on a typo and passes on the rounding in the published table
 */
const TOLERANCE = 1e-3

/**
 * Both numbers are fractions of full yield (1 = 100%). The tolerance is stated in percentage points
 */
const closeToPercent = (
  actual: number,
  expectedPercent: number,
  toleranceP: number,
  message: string,
): void => {
  const actualPercent = actual * 100
  expect(actualPercent, message).toBeGreaterThanOrEqual(expectedPercent - toleranceP)
  expect(actualPercent, message).toBeLessThanOrEqual(expectedPercent + toleranceP)
}

describe('the Laub et al. 2022 anchor data, read against the primary paper', () => {
  // laub2022-shade-meta, Agronomy for Sustainable Development 42:51, doi 10.1007/s13593-022-00783-7.
  // Read directly from the open-access PDF. The
  // paper states its own headline numbers in Results section 3.2, rounded to the nearest percent.
  // laub.generated.ts claims these are verbatim Table S2 transcriptions, and this block checks
  // seven of the nine crop groups' 40% RSR figures against the paper's own prose. Two groups
  // (c3-cereals, tubers-root-crops) aren't spelled out as prose sentences in the main text, only
  // in Table S2 itself, which lives in a separate supplementary .docx,
  // so they're left to the existing derivation rather than claimed as freshly verified here
  const FORTY_RSR_PERCENT: Fraction = 0.4 as Fraction

  it.each([
    // group, predicted %, ciLow %, ciHigh %, the paper's own sentence
    [
      'corn-c4',
      45,
      37,
      56,
      'the crop type with the strongest and disproportionately largest yield loss in response to RSR, the estimated yield at 40% RSR is 45% (95% CI 37 to 56)',
    ],
    [
      'grain-legumes',
      50,
      41,
      61,
      'grain legumes also show disproportionately large losses of grain yield in response to RSR. Estimated yields at 40% RSR are 50% (95% CI 41 to 61)',
    ],
    [
      'berries',
      114,
      84,
      154,
      'berries, fruits and fruity vegetables benefit... at 40% RSR (114, 113 and 102%... CI at 40% RSR: 84 to 154%',
    ],
    [
      'fruits',
      113,
      84,
      152,
      'at 40% RSR (114, 113 and 102%... CI at 40% RSR: 84 to 154%, 84 to 152%',
    ],
    [
      'fruity-vegetables',
      102,
      67,
      156,
      'at 40% RSR (114, 113 and 102%... CI at 40% RSR: 84 to 154%, 84 to 152% and 67 to 156%',
    ],
    [
      'forages',
      93,
      75,
      117,
      'forages are also estimated to have little susceptibility to RSR with an estimated yield of 103% at 20% RSR and 93% at 40% RSR (CI at 40% RSR: 75 to 117%)',
    ],
    [
      'leafy-vegetables',
      86,
      61,
      120,
      'for leafy vegetables the estimate for 40% RSR is 86% (CI 61 to 120)',
    ],
  ] as const)(
    "matches the paper's own prose for %s at 40%% RSR",
    (group, predictedP, ciLowP, ciHighP, quote) => {
      const curve = laubCurve(group)
      const central = laubCentralRelativeYield(curve, FORTY_RSR_PERCENT, true)
      const band = laubRelativeYield(curve, FORTY_RSR_PERCENT, true)
      closeToPercent(
        central,
        predictedP,
        1,
        `Laub et al. 2022 p.6: "${quote}"; app predicts ${(central * 100).toFixed(1)}%`,
      )
      closeToPercent(
        band.interval.lower,
        ciLowP,
        1,
        `Laub et al. 2022 CI low ${ciLowP}%; app ${(band.interval.lower * 100).toFixed(1)}%`,
      )
      closeToPercent(
        band.interval.upper,
        ciHighP,
        1,
        `Laub et al. 2022 CI high ${ciHighP}%; app ${(band.interval.upper * 100).toFixed(1)}%`,
      )
    },
  )

  it("reads the peak of each curve off the published table, where the paper's prose disagrees with it", () => {
    // The paper's prose, section 3.1: "berries, fruits and fruity vegetables may experience
    // increases in harvestable yield until about 30, 25 and 20% RSR, respectively", and section
    // 4.1: "forages are shade benefiting until 25% RSR, and shade tolerant at higher RSR".
    //
    // Two different quantities. The first is a peak and the second is a phase boundary, and for
    // fruits the peak the prose names (25%) isn't the one Table S2 tabulates: the table's
    // highest prediction for fruits is 115.5 at 30% RSR against 115.2 at 25%. `peakRsr` is the
    // argmax of the published predictions, generated from the table, so the table wins and the
    // phase boundaries live in `benefitPhaseEndRsrPercent` beside it
    expect(laubCurve('berries').peakRsr).toBeCloseTo(0.3, 6)
    expect(laubCurve('fruits').peakRsr).toBeCloseTo(0.3, 6)
    expect(laubCurve('fruity-vegetables').peakRsr).toBeCloseTo(0.2, 6)
    expect(laubCurve('forages').peakRsr).toBeCloseTo(0.15, 6)
    // leafy vegetables rises above 100% too, at 101.0, 101.3 and 100.6 for RSR 5, 10 and 15
    expect(laubCurve('leafy-vegetables').peakRsr).toBeCloseTo(0.1, 6)
  })

  it('recovers the shared quadratic coefficient from the published predictions', () => {
    // `LAUB_B2_PER_PERCENT_RSR` is the one coefficient this app asserts a value for, and Laub
    // publishes none: it was recovered algebraically, and this test is what tells a correct
    // recovery from a typo. This refits it from `docs/laub-2022-table-s2.json` by least squares,
    // one b1 per group and one shared b2, both forced through the origin, which is the model the
    // paper states. The check is relative, and the last line is the point of it: a perturbation of
    // one percent has to fail
    const levels = TABLE.rsrLevels
    const sxx = levels.reduce((total, x) => total + x * x, 0)
    const sx3 = levels.reduce((total, x) => total + x ** 3, 0)
    const sx4 = levels.reduce((total, x) => total + x ** 4, 0)
    let numerator = 0
    let denominator = 0
    for (const group of Object.values(TABLE.groups)) {
      const y = group.predicted.map((percent) => Math.log10(percent / 100))
      const sxy = levels.reduce((total, x, index) => total + x * (y[index] ?? 0), 0)
      const sx2y = levels.reduce((total, x, index) => total + x * x * (y[index] ?? 0), 0)
      numerator += sx2y - (sx3 / sxx) * sxy
      denominator += sx4 - (sx3 * sx3) / sxx
    }
    const recovered = numerator / denominator
    const error = Math.abs(recovered - LAUB_B2_PER_PERCENT_RSR) / Math.abs(LAUB_B2_PER_PERCENT_RSR)
    expect(
      error,
      `least squares on the 162 published predictions gives ${recovered.toExponential(6)} against the shipped ${LAUB_B2_PER_PERCENT_RSR.toExponential(6)}`,
    ).toBeLessThan(TOLERANCE)
    const perturbed = LAUB_B2_PER_PERCENT_RSR * 1.01
    expect(
      Math.abs(recovered - perturbed) / Math.abs(perturbed),
      'a one percent perturbation of b2 must fail this check',
    ).toBeGreaterThan(TOLERANCE)
  })

  it('reproduces the ANOVA table (Table 1, final reduced model) to the decimal the paper prints', () => {
    // Read directly off the printed table: RSR num/den DF 1/33.18, F 0, p 0.9713. RSR-squared
    // 1/31.09, F 12.05, p 0.0015. RSR x crop type 8/55.22, F 7.16, p<.0001. This is the statistic
    // behind the agrivoltaics document's claim that a linear "% shade = % yield loss" model is empirically wrong and
    // that crop group has to be a first-class input, so it's worth pinning exactly rather than
    // trusting the transcription
    expect(LAUB_ANOVA.RSR).toEqual({ numDF: 1, denDF: 33.18, F: 0, p: 0.9713 })
    expect(LAUB_ANOVA.RSR2).toEqual({ numDF: 1, denDF: 31.09, F: 12.05, p: 0.0015 })
    expect(LAUB_ANOVA.RSRxCropType).toEqual({
      numDF: 8,
      denDF: 55.22,
      F: 7.16,
      p: 0.0001,
      pIsUpperBound: true,
    })
  })
})

describe('Marrou et al. 2013 (lettuce, Montpellier FR, irrigated, not water-limited)', () => {
  // marrou2013-lettuce-rue, Eur J Agron 44:54-66. Two panel densities transmitting 50% and 70% of
  // incoming radiation (RSR 50% and 30%). Water and nitrogen were held non-limiting by design
  // (marrou2013-microclimate states this explicitly), so this is the one trial in this file that
  // exercises the gate's OFF position: waterLimited is false. The paper's own headline finding,
  // corroborated by two independent secondary sources in addition to this
  // project's own the agrivoltaics document extraction: "the relative lettuce yield at harvest was equal or higher
  // than the available relative radiation, in all cases." That's a falsifiable inequality with no
  // single number in it, and it's what this block checks
  it.each([
    [0.5 as Fraction, 50],
    [0.3 as Fraction, 70],
  ] as const)(
    "at %s RSR, predicted yield doesn't fall below the %s%% of light actually available",
    async (rsr, availableLightPercent) => {
      const catalog = await catalogPromise
      const lettuce = need(catalog, 'lettuce-head')
      const curve = laubCurve(lettuce.laubGroup)
      const central = laubCentralRelativeYield(curve, rsr, false)
      expect(
        central * 100,
        `Marrou et al. 2013a: relative yield >= relative available radiation (${availableLightPercent}%); app predicts ${(central * 100).toFixed(1)}%`,
      ).toBeGreaterThanOrEqual(availableLightPercent)
    },
  )

  it('is comfortably inside the trial finding rather than sitting right at the edge of it', async () => {
    // The inequality above passes with room to spare: the leafy-vegetables curve predicts a
    // markedly SMALLER loss than the paper's own floor at both tested shade levels, which is a
    // real point of agreement worth stating rather than leaving as a bare pass. Both are
    // shade-tolerant results in the sense Laub's own three-way classification uses
    const catalog = await catalogPromise
    const lettuce = need(catalog, 'lettuce-head')
    const curve = laubCurve(lettuce.laubGroup)
    expect(laubCentralRelativeYield(curve, 0.5 as Fraction, false) * 100).toBeGreaterThan(70)
    expect(laubCentralRelativeYield(curve, 0.3 as Fraction, false) * 100).toBeGreaterThan(85)
  })

  it.each([
    // RSR, year, measured yield as a percent of the unshaded control
    [0.5 as Fraction, 2010, 58],
    [0.5 as Fraction, 2011, 79],
    [0.3 as Fraction, 2010, 81],
    [0.3 as Fraction, 2011, 99],
  ] as const)(
    'at %s RSR the %s crop measured %s%% of the control, which the published band covers',
    async (rsr, year, measuredPercent) => {
      // The paper's own per-year figures, section 3.2 p. 60: "In 2010, yield was reduced
      // significantly to 58% of control (all varieties together), when plants were submitted to
      // heavy shading (FD). In HD, yields were at 81% of the control yield for the same year. In
      // 2011, yield reductions were lower: they equaled 79% of full sun in FD and 99% in HD."
      // FD transmitted 50% of incoming radiation and HD 70%, so FD is RSR 50% and HD RSR 30%.
      //
      // IN-SAMPLE, and the comparison is worth less for it: Laub's Table S1 lists this trial
      // (as "Marrou et al., 2013b", with this paper's DOI) inside the leafy-vegetables group,
      // one of its four studies. The app is being checked against a curve this trial helped fit,
      // so agreement here shows consistency, and independent validation comes from the
      // out-of-sample checks in this file: Weselek, Barron-Gafford and Amaducci
      const catalog = await catalogPromise
      const lettuce = need(catalog, 'lettuce-head')
      const curve = laubCurve(lettuce.laubGroup)
      const central = laubCentralRelativeYield(curve, rsr, false)
      const band = laubRelativeYield(curve, rsr, false)
      const message = `Marrou et al. 2013a measured ${String(measuredPercent)}% of control in ${String(year)} at ${String(rsr * 100)}% RSR; app central ${(central * 100).toFixed(1)}%, band ${(band.interval.lower * 100).toFixed(1)} to ${(band.interval.upper * 100).toFixed(1)}%`
      expect(band.interval.lower * 100, message).toBeLessThanOrEqual(measuredPercent)
      expect(band.interval.upper * 100, message).toBeGreaterThanOrEqual(measuredPercent)
    },
  )
})

describe('Barron-Gafford et al. 2019 (chiltepin, jalapeno, cherry tomato, Biosphere 2 AZ, water-limited)', () => {
  // barron-gafford2019-arizona, Nat Sustain 2:848-855. Read from the DOE-hosted accepted
  // manuscript (osti.gov/servlets/purl/1567040). All three crops are Capsicum or
  // Solanum fruiting Solanaceae, this app's 'fruity-vegetables' Laub group. The array is a fixed
  // 3.3 m minimum height, 32 degree tilt structure over an irrigated Sonoran Desert plot (daily or
  // every-two-day irrigation): unambiguously the water-limited side of Decision Record 6's gate.
  //
  // The paper reports, with P<0.01 for chiltepin and tomato and no significant difference for
  // jalapeno (Fig. 3C): chiltepin fruit production 3x control, cherry tomato 2x control, jalapeno
  // "nearly equal" fruit production with 65% less transpirational water loss. It doesn't state a
  // numeric ground-level PAR reduction or RSR anywhere in the text. Figure 2A shows midday PAR
  // roughly halved under the array on a graph, with no stated percentage, so no single RSR can be
  // quoted from this trial. The check below therefore sweeps every RSR this app's own table defines
  // (5% to 90%) and asks what the most favorable prediction anywhere on that whole domain is
  it('agrees with the trial on direction: a water-limited fruiting Solanaceae planting can predict a yield above the unshaded control', async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    const curve = laubCurve(tomato.laubGroup)
    const maxCentral = Math.max(
      ...RSR_DOMAIN.map((rsr) => laubCentralRelativeYield(curve, rsr, true)),
    )
    expect(
      maxCentral,
      'water-limited gate open: the fruity-vegetables curve should predict a benefit at its own optimum RSR, matching the direction (not the size) of all three Barron-Gafford crops',
    ).toBeGreaterThan(1)
  })

  it("disagrees with the trial on magnitude: the app can't reach a 2x or 3x yield at any shade level, water-limited or not", async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    const curve = laubCurve(tomato.laubGroup)
    const maxCentral = Math.max(
      ...RSR_DOMAIN.map((rsr) => laubCentralRelativeYield(curve, rsr, true)),
    )
    const maxUpperBand = Math.max(
      ...RSR_DOMAIN.map((rsr) => laubRelativeYield(curve, rsr, true).interval.upper),
    )
    const gapMessage = `Barron-Gafford et al. 2019 measured chiltepin at 3x control and cherry tomato at 2x control (both P<0.01). This app's fruity-vegetables curve tops out at ${(maxCentral * 100).toFixed(1)}% central and ${(maxUpperBand * 100).toFixed(1)}% at the top of its own 95% band, across every RSR the app defines. The gap is real: Laub's meta-analysis pools mostly non-desert sites and can't see the magnitude of relief a semi-arid, irrigated, high-VPD site gets from shade, which is exactly the caveat the agrivoltaics document section 2.2 already carries for this trial`
    expect(maxCentral, gapMessage).toBeLessThan(2)
    expect(maxUpperBand, gapMessage).toBeLessThan(2)
  })

  it('shows the gate mechanism concretely: capped without water limitation, uncapped with it, and short of the trial either way', async () => {
    const catalog = await catalogPromise
    const tomato = need(catalog, 'tomato')
    const curve = laubCurve(tomato.laubGroup)
    const peakRsr = (curve.peakRsr ?? (0.2 as Fraction)) as Fraction
    const withoutGate = laubCentralRelativeYield(curve, peakRsr, false)
    const withGate = laubCentralRelativeYield(curve, peakRsr, true)
    // a temperate, non-water-limited garden sees no modeled shade bonus at all: the raw curve is
    // clipped at 100% exactly, which is the wrong direction relative to what a water-limited AV
    // site like Barron-Gafford's actually measured
    expect(withoutGate).toBeCloseTo(1, 6)
    // a water-limited garden sees the raw Laub prediction through uncapped: the right direction,
    // a fraction of the measured size
    expect(withGate).toBeGreaterThan(withoutGate)
    expect(withGate).toBeLessThan(1.2)
  })
})

describe('Weselek et al. 2021 (potato and wheat, Heggelbach DE, ~30% RSR, drought vs normal year)', () => {
  // weselek2021-potato, Agron Sustain Dev 41:59. PAR reduced ~30% on average under the array (doc
  // 02 section 2.2), two growing seasons: 2017 (normal rainfall) and 2018 (hot and dry). This app
  // has no per-site, per-year water-limitation index for Heggelbach in either year (that needs the
  // site's real monthly rainfall and reference ET, which this test doesn't have and won't
  // invent), so the correspondence below is an interpretive one stated plainly rather than a
  // computed one: 2018 is read here as the water-limited season and 2017 as the not-water-limited
  // one, which is the paper's own framing of why the two years disagree in sign.
  //
  // The catalog carries spring wheat and no winter wheat. Laub's c3-cereals group and this app's
  // model don't distinguish the two, so wheat-spring stands in, with that substitution named here
  const RSR: Fraction = 0.3 as Fraction

  it("potato, 2018 (drought, water-limited): the gate can't reach the measured +11%, because the tuber curve never predicts a gain", async () => {
    const catalog = await catalogPromise
    const potato = need(catalog, 'potato')
    const curve = laubCurve(potato.laubGroup)
    const central = laubCentralRelativeYield(curve, RSR, true)
    const band = laubRelativeYield(curve, RSR, true)
    const message = `Weselek et al. 2021 measured potato yield at 111% of the reference in the 2018 drought year at ~30% RSR. The tubers-root-crops curve (n=2 studies, the thinnest evidence base of the nine groups) is a monotonic decline that never predicts above 100% at any RSR, so the water-limitation gate can't lift it: central stays ${(central * 100).toFixed(1)}% whether or not the site is read as water-limited, and even the top of its own 95% band only reaches ${(band.interval.upper * 100).toFixed(1)}%`
    // the central estimate is unmoved by the gate for this crop group: this is the structural
    // finding, and rounding plays no part in it
    expect(central, message).toBeCloseTo(laubCentralRelativeYield(curve, RSR, false), 6)
    expect(band.interval.upper, message).toBeLessThan(1.11)
    expect(band.interval.upper, message).toBeGreaterThan(1)
  })

  it('potato, 2017 (normal year, not water-limited): the app predicts a bigger loss than the field trial measured', async () => {
    const catalog = await catalogPromise
    const potato = need(catalog, 'potato')
    const curve = laubCurve(potato.laubGroup)
    const central = laubCentralRelativeYield(curve, RSR, false)
    // The paper's own 2017 figure, p. 12: fresh-matter tuber yield 23.6 t/ha under the array
    // against 28.8 t/ha on the reference, -18.2%, p = 0.005. So the trial measured 81.8% of the
    // reference in the ordinary year, and the app is 9 points more pessimistic. The two-year
    // average of -7% isn't the normal year's figure, and the tolerance below is tight enough to
    // fail on it
    closeToPercent(
      central,
      81.8,
      10,
      `Weselek et al. 2021, 2017 (normal year): potato at 81.8% of reference at ~30% RSR (-18.2%, p = 0.005); app predicts ${(central * 100).toFixed(1)}%`,
    )
    expect(central * 100).toBeLessThan(85)
  })

  it("wheat, 2018 (drought, water-limited): the gate can't reach the measured +2.7%, for the same structural reason", async () => {
    const catalog = await catalogPromise
    const wheat = need(catalog, 'wheat-spring')
    const curve = laubCurve(wheat.laubGroup)
    const central = laubCentralRelativeYield(curve, RSR, true)
    const band = laubRelativeYield(curve, RSR, true)
    // "In 2018, it was 4.7 t ha-1 under AV compared to 4.6 t ha-1 in REF (+2.7%; not significant;
    // p = 0.78)". This is the one year-crop cell in the pair that is not significant, so what
    // this block pins is weaker than the potato case: the app predicts a loss where the trial
    // found no difference it could establish, which is a gap against a null
    const message = `Weselek et al. 2021 measured winter wheat yield at 102.7% of the reference in the 2018 drought year at ~30% RSR, a difference they report as not significant (p = 0.78). This app's catalog carries spring wheat as the c3-cereals stand-in. The c3-cereals curve never predicts above 100% at this RSR either, so central stays ${(central * 100).toFixed(1)}% regardless of the gate and the top of its own band reaches only ${(band.interval.upper * 100).toFixed(1)}%`
    expect(central, message).toBeCloseTo(laubCentralRelativeYield(curve, RSR, false), 6)
    expect(band.interval.upper, message).toBeLessThan(1.027)
  })

  it('wheat, 2017 (normal year, not water-limited): the app again predicts a bigger loss than the field trial measured', async () => {
    const catalog = await catalogPromise
    const wheat = need(catalog, 'wheat-spring')
    const curve = laubCurve(wheat.laubGroup)
    const central = laubCentralRelativeYield(curve, RSR, false)
    // p. 11: "In 2017, grain yield of winter wheat was 4.6 t ha-1 under AV compared to 5.7 t ha-1
    // on the REF site (-18.7%; p = 0.03)", so 81.3% of the reference. The measured value is inside
    // Laub's c3-cereals confidence interval at this RSR (61.5 to 87.6), so the app and the trial
    // agree in the ordinary year, and the app's central estimate is 8 points lower. Averaged over
    // both years, the trial comes to -8%
    closeToPercent(
      central,
      81.3,
      10,
      `Weselek et al. 2021, 2017 (normal year): wheat at 81.3% of reference at ~30% RSR (-18.7%, p = 0.03); app predicts ${(central * 100).toFixed(1)}%`,
    )
    expect(central * 100).toBeLessThan(85)
  })
})

describe('the water-limitation gate is structurally inert for corn and grain legumes', () => {
  // Decision Record 6 cites Amaducci et al. 2018 (amaducci2018-corn): rainfed corn yield was
  // "higher and more stable" under shade in the drought-stressed simulations, in apparent tension
  // with Laub ranking corn the single most shade-susceptible crop group. The decision record reads
  // that tension as the reason the shade-benefit pathway is gated on water limitation at all.
  // Amaducci's paper gives no single number this file can pin (it reports the qualitative
  // direction, with no yield ratio), so this block checks a narrower, fully computable claim:
  // does the gate, as implemented, have ANY power to move corn or grain-legume predictions
  // toward that finding? `laubRelativeYield` only raises the ceiling a water-limited site is
  // allowed to predict above. corn-c4 and grain-legumes are the two Laub groups whose
  // predicted mean AND 95% upper bound never rise above 100% at any tabulated
  // RSR, so there's no ceiling for the gate to lift. Water-limited and not water-limited must
  // therefore produce the identical band at every RSR for these two groups, which is a real and
  // checkable limit on what Decision Record 6's gate can do: it can't make this app agree with
  // Amaducci's corn finding at any shade level, because the curve it is lifting the ceiling on
  // never approaches that ceiling in the first place
  it.each(['corn-c4', 'grain-legumes'] as const)(
    '%s: water-limited and not water-limited predict the same band at every RSR',
    (group) => {
      const curve = laubCurve(group)
      for (const rsr of RSR_DOMAIN) {
        const withoutGate = laubRelativeYield(curve, rsr, false)
        const withGate = laubRelativeYield(curve, rsr, true)
        expect(
          withGate.interval.upper,
          `${group} at ${String(rsr * 100)}% RSR: gate open ${(withGate.interval.upper * 100).toFixed(2)}%, gate closed ${(withoutGate.interval.upper * 100).toFixed(2)}%; these should be identical because the raw curve never exceeds 100% for this group`,
        ).toBe(withoutGate.interval.upper)
        expect(withGate.interval.lower).toBe(withoutGate.interval.lower)
      }
    },
  )

  it("confirms the premise: neither group's predicted mean or upper 95% bound ever exceeds 100%, at any RSR this app defines", () => {
    for (const group of ['corn-c4', 'grain-legumes'] as const) {
      const curve = laubCurve(group)
      for (const rsr of RSR_DOMAIN) {
        const band = laubRelativeYield(curve, rsr, true)
        expect(
          band.interval.upper,
          `${group} at ${String(rsr * 100)}% RSR should stay at or below 100% even with the gate open`,
        ).toBeLessThanOrEqual(1)
      }
    }
  })
})
