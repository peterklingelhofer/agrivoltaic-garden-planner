import type { OnboardingStep } from '../state/slices'
import type { Understanding } from './understand'

/**
 * How a held-out set is scored, in one place, because there are three of them and the thing being
 * counted changed.
 *
 * A single number for whether the router picked the right intent is not the whole truth for a
 * router that can decline to pick. A reading it will not act on and offers three candidates for is
 * not a hit and it is emphatically not the same failure as confidently doing the wrong thing, and a
 * single percentage cannot tell those apart.
 *
 * So three numbers. **Precision** is what it got right of what it actually DID, and it is the one
 * that matters most, because a wrong action is the failure a grower has to notice and undo.
 * **Offered** is how often, when it asked instead, the right answer was among the chips. **Solved**
 * adds the two: everything that ended right, or ended one tap from right.
 *
 * Imported only by the held-out tests. It lives here alone, so that all three
 * count the same thing, and nowhere in the application imports it
 */

export interface HeldOutLine {
  readonly said: string
  readonly step: OnboardingStep | null
  readonly want: string
}

export interface Verdict {
  readonly total: number
  /** Sentences it acted on, and how many of those were right */
  readonly acted: number
  readonly right: number
  /** Sentences it declined to act on, and how many carried the right answer in the offer */
  readonly asked: number
  readonly offered: number
  readonly misses: readonly string[]
}

export const scoreHeldOut = async (
  lines: readonly HeldOutLine[],
  route: (said: string, step: OnboardingStep | null) => Promise<Understanding | null>,
): Promise<Verdict> => {
  const misses: string[] = []
  let acted = 0
  let right = 0
  let asked = 0
  let offered = 0
  for (const line of lines) {
    const got = await route(line.said, line.step)
    if (got !== null && got.alternatives.length > 0) {
      asked += 1
      if (got.alternatives.some((id) => id === line.want)) offered += 1
      else {
        misses.push(`  ASKED "${line.said}" -> ${got.alternatives.join(', ')}, wanted ${line.want}`)
      }
      continue
    }
    acted += 1
    if (got?.intent === line.want) right += 1
    else misses.push(`  DID   "${line.said}" -> ${got?.intent ?? 'NOTHING'}, wanted ${line.want}`)
  }
  return { total: lines.length, acted, right, asked, offered, misses }
}

const percent = (part: number, whole: number): string =>
  whole === 0 ? '--' : `${((part / whole) * 100).toFixed(0)}%`

/** What it got right of what it actually did, which is the number a wrong action shows up in */
export const precisionOf = (verdict: Verdict): number =>
  verdict.acted === 0 ? 1 : verdict.right / verdict.acted

/** Everything that ended right, or one tap from right */
export const solvedOf = (verdict: Verdict): number =>
  verdict.total === 0 ? 1 : (verdict.right + verdict.offered) / verdict.total

/**
 * A breakage alarm, deliberately not a quality bar.
 *
 * `holdout.test.ts` argues against gating these scores at all, on the grounds that a floor
 * creates the same pressure to tune against it that spent the three sets in the first place.
 * That argument is right about a floor set near the measured value, and it is why this one is
 * nowhere near: the sets currently score 86% and 100% precision, and nothing sane gets within
 * twenty points of 60% without something being broken.
 *
 * What it catches is a collapse. A refactor that guts the vocabulary, a model that loaded as null,
 * a context change that routes everything to one intent. Those take the number to the floor and
 * below, and without this floor they would take it there in silence, because the scores are
 * otherwise printed to a log and asserted nowhere.
 *
 * If a real change ever puts a genuine score near 60%, the answer is to look at the change and
 * not to move this
 */
export const COLLAPSE_FLOOR = 0.6

export const reportHeldOut = (name: string, verdict: Verdict): string =>
  [
    `${name}: acted on ${String(verdict.acted)}/${String(verdict.total)} and was right ${percent(verdict.right, verdict.acted)}`,
    `asked about ${String(verdict.asked)} and offered the answer in ${String(verdict.offered)}`,
    `solved ${percent(verdict.right + verdict.offered, verdict.total)}`,
    `\n${verdict.misses.join('\n')}`,
  ].join(', ')
