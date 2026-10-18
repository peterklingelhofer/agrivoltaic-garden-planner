import type { LaubCropGroup } from '../types/crop'
import type { PinnedNumber } from '../types/pinned'

/**
 * The figures the crop catalog and the shade ceilings take from a source, each pinned to the
 * sentence that prints it. A pin names the ledger entry, the place in the source and the words of
 * one of that entry's quotes, and `pinned-figures.test.ts` holds all three against
 * `docs/CITATIONS.csl.json`, so a figure edited here or a quote edited there fails a test
 *
 * A leaf module with type imports only, for the reason `catalog/provenance.ts` is one: `rows.ts`
 * reads these values at runtime and `scripts/generate-catalog.mjs` loads `rows.ts` in plain Node
 * through type stripping, which can't resolve an extensionless runtime import. `rows.ts` and
 * `schema.ts` import this file with its `.ts` extension
 */

/**
 * The minimum daily light integral for vine crops, mol/m2/d. Runkle 2011 gives it for the group in
 * a sentence that names no crop, and the tomato, pepper and cucumber rows read it
 */
export const VINE_CROP_DLI_FLOOR: PinnedNumber = {
  value: 15,
  citation: 'runkle2011-vegetable-dli',
  locator: 'p. 42',
  quote:
    'A recommended minimum DLI for lettuce production is 12 to 14 mol/m2/d, whereas at least 15 (and preferably more than 20) mol/m2/d is suggested for vine crops',
}

const WIDMER_REGRESSION_QUOTE =
  'Based on the point where the standardized regression line crosses zero, the minimal DLI recommendation for maintaining average yield was 15 mol m-2 d-1 for raspberry and 25 mol m-2 d-1 for strawberries.'

/**
 * Widmer et al. 2026's strawberry minimum, mol/m2/d: where the standardized yield regression line
 * crosses zero, so the level that keeps the trial-average yield
 */
export const STRAWBERRY_DLI_FLOOR: PinnedNumber = {
  value: 25,
  citation: 'widmer-strawberry-dli',
  locator: 'p. 4',
  quote: WIDMER_REGRESSION_QUOTE,
}

/** The raspberry minimum from the same sentence, on the same convention */
export const RASPBERRY_DLI_FLOOR: PinnedNumber = {
  value: 15,
  citation: 'widmer-strawberry-dli',
  locator: 'p. 4',
  quote: WIDMER_REGRESSION_QUOTE,
}

/**
 * The strawberry shade ceiling, as a fraction of the light. Widmer et al. 2026 put their
 * 25 mol/m2/d at an estimated total shading of 10-30% depending on the cover, and the ceiling
 * takes the low end of that range
 */
export const STRAWBERRY_SHADE_CEILING: PinnedNumber = {
  value: 0.1,
  spelled: '10',
  citation: 'widmer-strawberry-dli',
  locator: 'p. 7',
  quote:
    'Based on our findings, we recommend a minimum DLI of 25 mol m-2 d-1 [...] corresponded to an estimated total shading of 10-30%, depending on the type of cover',
}

/**
 * The shade ceiling of the Solanaceae and cucurbit classes, as a fraction of the light. Zhang et
 * al. 2025 give it as a design figure across crops, with no tomato result behind it
 */
export const PV_SHADE_CEILING: PinnedNumber = {
  value: 0.2,
  spelled: '20%',
  citation: 'zhang2025-tipping-points',
  locator: 'p. 11',
  quote:
    'To reduce the impact on the growth of crops, the shading caused by PV systems should preferably not exceed 20%, but such a strategy might sacrifice energy generation per unit of land',
}

/**
 * The potato row's own shade ceiling, as a fraction of the light: the level at which Laub et al.
 * 2022 say all crops show susceptibility, the last of the three phases (benefit, tolerance,
 * susceptibility) they sort shade responses into. Weselek et al. 2021 grew potato under an array
 * at about 30 percent shade and print no threshold, so the sentence that prints the 50 is Laub's
 */
export const POTATO_SHADE_CEILING: PinnedNumber = {
  value: 0.5,
  spelled: '50%',
  citation: 'laub2022-shade-meta',
  locator: 'p. 7',
  quote: 'At around 50% of shading, all crops show susceptibility.',
}

/**
 * The basil minimum, mol/m2/d: the level Dou et al. 2018 suggest for commercial production, the
 * lowest of their five at which yield and quality were both high
 */
export const BASIL_DLI_FLOOR: PinnedNumber = {
  value: 12.9,
  citation: 'dou2018-basil-dli',
  locator: 'the abstract',
  quote:
    'we suggest a DLI of 12.9 mol/m2/d for sweet basil commercial production in indoor vertical farming to minimize the energy cost while maintaining a high yield and nutritional quality',
}

/**
 * The top of the lettuce target band, mol/m2/d: the Cornell CEA handbook's 17, the light integral
 * that worked best for the boston bibb cultivar it grew
 */
export const LETTUCE_DLI_TARGET_HIGH: PinnedNumber = {
  value: 17,
  citation: 'brechner2013-cornell-lettuce-handbook',
  locator: 'p. 13',
  quote:
    'A supplemental light intensity within the range of 100-200 umol/m2/s (for a total of 17 mol/m2/d of both natural and supplemental lighting) at the plant level is recommended. It should be noted that 17 mol/m2/d is the light integral that worked best for the particular cultivar of boston bibb lettuce that we used',
}

const VCE_SPINACH_QUOTE =
  'Table 3. Suggested average daily light integral (DLI; mol/m2/d) for example crops. [...] Spinach 14-20'

/**
 * The bottom of the spinach target band, mol/m2/d. Virginia Cooperative Extension's Table 3 prints
 * 14 to 20 mol/m2/d for spinach, a greenhouse figure the table cites no spinach study for. Both
 * ends of the row's target band come from that one table row
 */
export const SPINACH_DLI_TARGET_LOW: PinnedNumber = {
  value: 14,
  citation: 'stallknecht2025-vce-dli',
  locator: 'Table 3, p. 3',
  quote: VCE_SPINACH_QUOTE,
}

/**
 * The top of the spinach target band, mol/m2/d. It comes from the same Table 3 row as the bottom,
 * so the two pins share one quote
 */
export const SPINACH_DLI_TARGET_HIGH: PinnedNumber = {
  value: 20,
  citation: 'stallknecht2025-vce-dli',
  locator: 'Table 3, p. 3',
  quote: VCE_SPINACH_QUOTE,
}

/**
 * The growing-season light of the clearcut where Nelson et al. 2007 measured wild ginger survival
 * at about 30% of the forest's, mol/m2/d. The paper compared those two light levels and no more
 */
export const WILD_GINGER_SURVIVAL_CEILING: PinnedNumber = {
  value: 36.4,
  citation: 'nelson2007-late-seral-herbs',
  locator: 'p. 2882',
  quote:
    'Photosynthetic photon flux density (PPFD) over the growing season averaged 36.4 mol·m-2·d-1 in the harvest area, but only 8.6 mol·m-2·d-1 in the forest',
}

/**
 * The groups whose 40% figure Laub et al. 2022's results text states, the other two being in
 * Table S2 alone
 */
type LaubProseGroup = Exclude<LaubCropGroup, 'c3-cereals' | 'tubers-root-crops'>

const LAUB_FRUIT_QUOTE =
  'In contrast to these crops, berries, fruits and fruity vegetables benefit at 20% of RSR (114, 114 and 108%, respectively) as well as at 40% RSR (114, 113 and 102% estimated yield, for berries, fruits and fruity vegetables, respectively; CI at 40% RSR: 84 to 154%, 84 to 152% and 67 to 156%, respectively).'

/**
 * The yield at 40% relative shade ratio (RSR), in percent of the unshaded control, that Laub et
 * al. 2022's results text states for the seven groups it names. Table S2 holds the same estimates
 * to a decimal, and the test holds each figure to its Table S2 value within half a point
 */
export const LAUB_YIELD_AT_40_PERCENT: Readonly<Record<LaubProseGroup, PinnedNumber>> = {
  berries: {
    value: 114,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote: LAUB_FRUIT_QUOTE,
  },
  fruits: {
    value: 113,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote: LAUB_FRUIT_QUOTE,
  },
  'fruity-vegetables': {
    value: 102,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote: LAUB_FRUIT_QUOTE,
  },
  forages: {
    value: 93,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote:
      'Forages are also estimated to have little susceptibility to RSR with an estimated yield of 103% at 20% RSR and 93% at 40% RSR (CI at 40% RSR: 75 to 117%).',
  },
  'leafy-vegetables': {
    value: 86,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote: 'For leafy vegetables the estimate for 40% RSR is 86% (CI 61 to 120%).',
  },
  'grain-legumes': {
    value: 50,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote: 'Estimated yields at 40% RSR are 50% (CI 41 to 61%).',
  },
  'corn-c4': {
    value: 45,
    citation: 'laub2022-shade-meta',
    locator: 'p. 6',
    quote:
      'For maize, the crop type with the strongest and disproportionately largest yield loss in response to RSR, the estimated yield at 40% RSR is 45% (95% CI 37 to 56%).',
  },
}

/**
 * The crop rows that read a pin, and for which column: a row's minimum, either end of its target
 * band, or its own shade ceiling. `rows.ts` takes each value from here, and
 * `pinned-figures.test.ts` holds each row's tuple and its expanded record to it
 */
export const PINNED_ROWS: Readonly<
  Record<
    string,
    {
      dliMin?: PinnedNumber
      dliTargetLow?: PinnedNumber
      dliTargetHigh?: PinnedNumber
      maxRsr?: PinnedNumber
    }
  >
> = {
  tomato: { dliMin: VINE_CROP_DLI_FLOOR },
  'pepper-sweet': { dliMin: VINE_CROP_DLI_FLOOR },
  'pepper-hot': { dliMin: VINE_CROP_DLI_FLOOR },
  cucumber: { dliMin: VINE_CROP_DLI_FLOOR },
  strawberry: { dliMin: STRAWBERRY_DLI_FLOOR },
  raspberry: { dliMin: RASPBERRY_DLI_FLOOR },
  basil: { dliMin: BASIL_DLI_FLOOR },
  'lettuce-leaf': { dliTargetHigh: LETTUCE_DLI_TARGET_HIGH },
  'lettuce-head': { dliTargetHigh: LETTUCE_DLI_TARGET_HIGH },
  spinach: { dliTargetLow: SPINACH_DLI_TARGET_LOW, dliTargetHigh: SPINACH_DLI_TARGET_HIGH },
  potato: { maxRsr: POTATO_SHADE_CEILING },
}

/**
 * How many rows that cite a source for their light figures carry no pin. No such row goes
 * unpinned today, and the count stays so a newly cited row either gets a pin or is counted here on
 * purpose. The test refuses a rise above it
 */
export const UNPINNED_CITED_ROWS = 0
