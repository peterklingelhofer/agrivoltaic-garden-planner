import { type LedgerEntryLike, type ReceiptsFile, quoteKey, verbatimQuotesOf } from './verbatim'

/**
 * Three counts in the citation ledger that can only go down.
 *
 * A ratchet lets a measure improve and refuses to let it slip back. `baselineCounts` reads the
 * three counts off the ledger and its receipts, `docs/CITATIONS.baseline.json` holds the figure
 * each one may not exceed, and `citation-baseline.test.ts` fails CI when one is higher, with no
 * network and no cached sources. When a count comes down, `bun run citations:baseline --write`
 * lowers the baseline to match in the same commit, so the gain can't be given back later. Raising
 * a baseline is a choice that needs its reason in the commit message
 *
 * The counts are the entries still marked `unverified`, the verbatim quotes that have no receipt,
 * and the quotes that elide words with a bare ellipsis where `[...]` is the written form
 */

/** The layout version of `docs/CITATIONS.baseline.json` */
export const BASELINE_FORMAT = 1

export interface BaselineCounts {
  /** Ledger entries whose `custom.verification` is `unverified` */
  readonly unverifiedEntries: number
  /** Distinct quotes, counted per entry by `quoteKey`, that have no receipt on that entry */
  readonly quotesWithoutReceipt: number
  /** Distinct quotes with `...` or the ellipsis character outside square brackets */
  readonly quotesWithBareEllipsis: number
}

/** `docs/CITATIONS.baseline.json`: the figure each count may not exceed */
export interface BaselineFile {
  readonly format: typeof BASELINE_FORMAT
  readonly counts: BaselineCounts
}

/** A ledger entry as far as the counts read it: its quotes and how its record was verified */
export interface BaselineEntry extends LedgerEntryLike {
  readonly custom?: {
    readonly backsClaims?: readonly string[]
    readonly verification?: string
  }
}

/** A count that is higher than its baseline */
export interface OverBaseline {
  readonly metric: keyof BaselineCounts
  readonly current: number
  readonly baseline: number
}

/** The counts in the order they are reported and written */
export const BASELINE_METRICS: readonly (keyof BaselineCounts)[] = [
  'unverifiedEntries',
  'quotesWithoutReceipt',
  'quotesWithBareEllipsis',
]

// the square-bracketed runs of a quote, where an elision is written as [...]
const BRACKETED = /\[[^\]]*\]/g

// a quote that elides with three periods or the one character, outside any square brackets
const hasBareEllipsis = (quote: string): boolean =>
  /\.\.\.|\u2026/.test(quote.replace(BRACKETED, ''))

/**
 * The three counts for a ledger and its receipts. A quote that an entry carries twice is one
 * quote, and a receipt on another entry doesn't cover it. A span that only names a place in the
 * source is a label, which counts toward neither quote count
 */
export const baselineCounts = (
  ledger: readonly BaselineEntry[],
  receipts: ReceiptsFile,
): BaselineCounts => {
  let unverifiedEntries = 0
  let quotesWithoutReceipt = 0
  let quotesWithBareEllipsis = 0
  for (const entry of ledger) {
    if (entry.custom?.verification === 'unverified') unverifiedEntries += 1
    const receipted = new Set((receipts.receipts[entry.id] ?? []).map((receipt) => receipt.quote))
    const seen = new Set<string>()
    for (const quote of verbatimQuotesOf(entry)) {
      const key = quoteKey(quote)
      if (seen.has(key)) continue
      seen.add(key)
      if (!receipted.has(key)) quotesWithoutReceipt += 1
      if (hasBareEllipsis(quote)) quotesWithBareEllipsis += 1
    }
  }
  return { unverifiedEntries, quotesWithoutReceipt, quotesWithBareEllipsis }
}

/**
 * The counts that are higher than their baseline, in the order of `BASELINE_METRICS`. An empty
 * result means no count went up. A count below its baseline isn't over, the baseline is only
 * higher than it needs to be. A baseline that is missing or isn't a number can't be met, so that
 * count is reported too
 */
export const overBaseline = (
  current: BaselineCounts,
  baseline: BaselineCounts,
): readonly OverBaseline[] =>
  BASELINE_METRICS.filter((metric) => !(current[metric] <= baseline[metric])).map((metric) => ({
    metric,
    current: current[metric],
    baseline: baseline[metric],
  }))
