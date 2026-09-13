import type { TekDesignRule } from '../types/tek'

/**
 * How a traditional design rule is named to a grower, in one place because it's said in two.
 *
 * `TekCreditsPanel` lists every rule the app holds, and `PolyculturePanel` credits the ones a
 * particular suggestion actually applied. The second of those is the one that matters most: a rule
 * taken from a named people is being applied to somebody's garden, so the people are named on the
 * suggestion that applies it.
 *
 * A plain module rather than exports beside the panel, because a file that exports both
 * components and helpers breaks the fast-refresh boundary, and because this is vocabulary rather
 * than rendering
 */

/**
 * The one line here that is a caveat rather than a credit: it records that nobody asked the
 * people whose practice this is whether they wanted it in a piece of software. Said once so that
 * rewording one copy can never quietly soften the other
 */
export const TEK_ENDORSEMENT = "Community endorsement wasn't sought"

export const peoplesOf = (rule: TekDesignRule): string =>
  rule.attribution.peoples.join(', ') || 'not stated in the source'

/** Living or historical, and whether the only record of it is a researcher writing it down */
export const practiceOf = (rule: TekDesignRule): string =>
  `${rule.attribution.practiceStatus}${rule.attribution.researcherAccountOnly ? ', researcher account only' : ''}`
