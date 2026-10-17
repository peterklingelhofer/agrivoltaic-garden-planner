import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import {
  BASELINE_FORMAT,
  BASELINE_METRICS,
  type BaselineCounts,
  type BaselineEntry,
  type BaselineFile,
  baselineCounts,
  overBaseline,
} from './citation-baseline'
import {
  type QuoteReceipt,
  RECEIPTS_FORMAT,
  type ReceiptsFile,
  quoteKey,
  quotePreview,
} from './verbatim'

/**
 * The ledger, its receipts and the baseline read as text and parsed here, with no import, so `tsc`
 * never has to walk three large JSON files to type-check this suite
 */
const read = (name: string): unknown =>
  JSON.parse(readFileSync(`${import.meta.dir}/../../docs/${name}`, 'utf8'))

const FIRST = 'the first quoted words'
const SECOND = 'the second quoted words'

const NO_RECEIPTS: ReceiptsFile = { format: RECEIPTS_FORMAT, receipts: {} }

const receiptFor = (text: string): QuoteReceipt => ({
  quote: quoteKey(text),
  preview: quotePreview(text),
  found: {
    kind: 'pdf',
    bytes: 1024,
    textSha256: 'f'.repeat(64),
    via: 'a-direct',
    date: '2000-01-01',
  },
})

const receiptsOf = (receipts: Record<string, readonly QuoteReceipt[]>): ReceiptsFile => ({
  format: RECEIPTS_FORMAT,
  receipts,
})

/** An entry whose claims quote each of the given texts, one claim apiece */
const entryOf = (
  id: string,
  quotes: readonly string[],
  verification = 'url-verified',
): BaselineEntry => ({
  id,
  custom: {
    verification,
    backsClaims: quotes.map((quote) => `a claim, verbatim: '${quote}'`),
  },
})

/** An entry whose quotes sit in the quotes field, one claim apiece, each with its locator */
const movedEntryOf = (
  id: string,
  quotes: readonly { readonly text: string; readonly locator: string }[],
): BaselineEntry => ({
  id,
  custom: {
    verification: 'url-verified',
    backsClaims: quotes.map(() => "a claim in the ledger's own words"),
    quotes: quotes.map((quote, claim) => ({ ...quote, claim })),
  },
})

const counts = (ledger: readonly BaselineEntry[], receipts = NO_RECEIPTS): BaselineCounts =>
  baselineCounts(ledger, receipts)

describe('baselineCounts', () => {
  it('names every count the baseline file holds', () => {
    expect(Object.keys(counts([])).sort()).toEqual([...BASELINE_METRICS].sort())
    expect(counts([])).toEqual({
      unverifiedEntries: 0,
      quotesWithoutReceipt: 0,
      quotesWithBareEllipsis: 0,
      quotesWithoutLocator: 0,
      claimsStillQuoting: 0,
    })
  })

  describe('unverifiedEntries', () => {
    it('counts the entries marked unverified', () => {
      const ledger = [
        entryOf('a2020-one', [], 'unverified'),
        entryOf('b2021-two', [], 'crossref-verified'),
        entryOf('c2022-three', [], 'unverified'),
        entryOf('d2023-four', [], 'datacite-verified'),
      ]
      expect(counts(ledger).unverifiedEntries).toBe(2)
    })

    it('does not count an entry with no verification field', () => {
      expect(counts([{ id: 'a2020-one' }, { id: 'b2021-two', custom: {} }]).unverifiedEntries).toBe(
        0,
      )
    })
  })

  describe('quotesWithoutReceipt', () => {
    it('counts every quote when there are no receipts', () => {
      const ledger = [entryOf('a2020-one', [FIRST, SECOND]), entryOf('b2021-two', [FIRST])]
      expect(counts(ledger).quotesWithoutReceipt).toBe(3)
    })

    it('leaves out a quote that has a receipt on its entry', () => {
      const ledger = [entryOf('a2020-one', [FIRST, SECOND])]
      const receipts = receiptsOf({ 'a2020-one': [receiptFor(FIRST)] })
      expect(counts(ledger, receipts).quotesWithoutReceipt).toBe(1)
    })

    it('does not let a receipt on another entry cover the quote', () => {
      const ledger = [entryOf('a2020-one', [FIRST]), entryOf('b2021-two', [FIRST])]
      const receipts = receiptsOf({ 'a2020-one': [receiptFor(FIRST)] })
      expect(counts(ledger, receipts).quotesWithoutReceipt).toBe(1)
    })

    it('counts a quote written twice in one entry once', () => {
      const ledger = [entryOf('a2020-one', [FIRST, FIRST, 'The  FIRST quoted words'])]
      expect(counts(ledger).quotesWithoutReceipt).toBe(1)
      const receipts = receiptsOf({ 'a2020-one': [receiptFor(FIRST)] })
      expect(counts(ledger, receipts).quotesWithoutReceipt).toBe(0)
    })

    it('does not count a label that only names a place in the source', () => {
      const ledger: readonly BaselineEntry[] = [
        {
          id: 'a2020-one',
          custom: {
            backsClaims: ["a claim, verbatim: '(no quote: see the figure)' (n/a)"],
          },
        },
      ]
      expect(counts(ledger).quotesWithoutReceipt).toBe(0)
    })

    it('ignores a receipt on an entry the ledger does not have', () => {
      const receipts = receiptsOf({ 'nobody2000-none': [receiptFor(FIRST)] })
      expect(counts([entryOf('a2020-one', [FIRST])], receipts).quotesWithoutReceipt).toBe(1)
    })

    it('reads the quotes field, where a receipt covers a quote that moved there', () => {
      const ledger = [
        movedEntryOf('a2020-one', [
          { text: FIRST, locator: 'p. 7' },
          { text: SECOND, locator: '' },
        ]),
      ]
      const receipts = receiptsOf({ 'a2020-one': [receiptFor(FIRST)] })
      expect(counts(ledger, receipts).quotesWithoutReceipt).toBe(1)
    })
  })

  describe('quotesWithBareEllipsis', () => {
    it('counts a quote with three periods', () => {
      const ledger = [entryOf('a2020-one', ['the first words ... the last words'])]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(1)
    })

    it('counts a quote with the ellipsis character', () => {
      const ledger = [entryOf('a2020-one', ['the first words\u2026the last words'])]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(1)
    })

    it('does not count an ellipsis written in square brackets', () => {
      const ledger = [
        entryOf('a2020-one', ['the first words [...] the last words']),
        entryOf('b2021-two', ['the first words [\u2026] the last words']),
        entryOf('c2022-three', ['the first words [ ... ] the last words']),
      ]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(0)
    })

    it('counts a quote that has both forms once', () => {
      const ledger = [entryOf('a2020-one', ['the first [...] the middle ... the last'])]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(1)
    })

    it('counts a quote written twice in one entry once', () => {
      const ledger = [entryOf('a2020-one', ['the first ... the last', 'the first ... the last'])]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(1)
    })

    it('counts the same quote on two entries twice', () => {
      const ledger = [
        entryOf('a2020-one', ['the first ... the last']),
        entryOf('b2021-two', ['the first ... the last']),
      ]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(2)
    })

    it('does not count an ellipsis in a label', () => {
      const ledger: readonly BaselineEntry[] = [
        {
          id: 'a2020-one',
          custom: { backsClaims: ["a claim, verbatim: '(no quote: see the figure ...)' (n/a)"] },
        },
      ]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(0)
    })

    it('reads the quotes field', () => {
      const ledger = [
        movedEntryOf('a2020-one', [
          { text: 'the first words ... the last words', locator: 'p. 7' },
          { text: 'the first words [...] the last words', locator: 'p. 7' },
        ]),
      ]
      expect(counts(ledger).quotesWithBareEllipsis).toBe(1)
    })
  })

  describe('quotesWithoutLocator', () => {
    it('counts a quote in the quotes field whose locator is empty', () => {
      const ledger = [
        movedEntryOf('a2020-one', [
          { text: FIRST, locator: '' },
          { text: SECOND, locator: 'p. 7' },
        ]),
      ]
      expect(counts(ledger).quotesWithoutLocator).toBe(1)
    })

    it('counts a quote read from prose, which names no locator', () => {
      expect(counts([entryOf('a2020-one', [FIRST, SECOND])]).quotesWithoutLocator).toBe(2)
    })

    it('counts a quote written twice once, and not at all when a copy has a locator', () => {
      const bare = movedEntryOf('a2020-one', [
        { text: FIRST, locator: '' },
        { text: 'The  FIRST quoted words', locator: '' },
      ])
      expect(counts([bare]).quotesWithoutLocator).toBe(1)
      const placed = movedEntryOf('a2020-one', [
        { text: FIRST, locator: '' },
        { text: FIRST, locator: 'p. 7' },
      ])
      expect(counts([placed]).quotesWithoutLocator).toBe(0)
    })

    it('counts the same quote on two entries twice', () => {
      const ledger = [
        movedEntryOf('a2020-one', [{ text: FIRST, locator: '' }]),
        movedEntryOf('b2021-two', [{ text: FIRST, locator: '' }]),
      ]
      expect(counts(ledger).quotesWithoutLocator).toBe(2)
    })
  })

  describe('claimsStillQuoting', () => {
    it('counts the entries with a claim that says verbatim', () => {
      const ledger = [
        entryOf('a2020-one', [FIRST]),
        movedEntryOf('b2021-two', [{ text: SECOND, locator: 'p. 7' }]),
        entryOf('c2022-three', []),
      ]
      expect(counts(ledger).claimsStillQuoting).toBe(1)
    })

    it('counts an entry once however many of its claims say it', () => {
      expect(counts([entryOf('a2020-one', [FIRST, SECOND])]).claimsStillQuoting).toBe(1)
    })
  })

  it('reads the five counts together', () => {
    const ledger = [
      entryOf('a2020-one', [FIRST, 'the first ... the last'], 'unverified'),
      entryOf('b2021-two', [SECOND, 'the first [...] the last']),
    ]
    const receipts = receiptsOf({ 'b2021-two': [receiptFor(SECOND)] })
    expect(counts(ledger, receipts)).toEqual({
      unverifiedEntries: 1,
      quotesWithoutReceipt: 3,
      quotesWithBareEllipsis: 1,
      quotesWithoutLocator: 4,
      claimsStillQuoting: 2,
    })
  })
})

describe('overBaseline', () => {
  const BASELINE: BaselineCounts = {
    unverifiedEntries: 16,
    quotesWithoutReceipt: 103,
    quotesWithBareEllipsis: 29,
    quotesWithoutLocator: 101,
    claimsStillQuoting: 0,
  }

  it('finds nothing when every count is at its baseline', () => {
    expect(overBaseline(BASELINE, BASELINE)).toEqual([])
  })

  it('finds nothing when a count came down', () => {
    expect(overBaseline({ ...BASELINE, quotesWithoutReceipt: 90 }, BASELINE)).toEqual([])
  })

  it('names a count that went up with both figures', () => {
    expect(overBaseline({ ...BASELINE, quotesWithoutReceipt: 104 }, BASELINE)).toEqual([
      { metric: 'quotesWithoutReceipt', current: 104, baseline: 103 },
    ])
  })

  it('names every count that went up, in the order the counts are reported', () => {
    const current = {
      unverifiedEntries: 17,
      quotesWithoutReceipt: 90,
      quotesWithBareEllipsis: 30,
      quotesWithoutLocator: 101,
      claimsStillQuoting: 1,
    }
    expect(overBaseline(current, BASELINE).map((over) => over.metric)).toEqual([
      'unverifiedEntries',
      'quotesWithBareEllipsis',
      'claimsStillQuoting',
    ])
  })

  it('reports a count whose baseline is missing', () => {
    const missing = { ...BASELINE, quotesWithBareEllipsis: undefined } as unknown as BaselineCounts
    expect(overBaseline(BASELINE, missing).map((over) => over.metric)).toEqual([
      'quotesWithBareEllipsis',
    ])
  })
})

/**
 * The real ledger held to the committed baseline. A count that went up fails here, offline, and
 * a count that came down passes and can be locked in with `bun run citations:baseline --write`
 */
describe('citation baseline', () => {
  const LEDGER = read('CITATIONS.csl.json') as readonly BaselineEntry[]
  const RECEIPTS = read('CITATIONS.receipts.json') as ReceiptsFile
  const BASELINE = read('CITATIONS.baseline.json') as BaselineFile

  it('uses the layout this code reads', () => {
    expect(BASELINE.format).toBe(BASELINE_FORMAT)
  })

  it('holds a whole number for each count and nothing else', () => {
    expect(Object.keys(BASELINE.counts).sort()).toEqual([...BASELINE_METRICS].sort())
    for (const metric of BASELINE_METRICS) {
      const figure = BASELINE.counts[metric]
      expect([metric, Number.isInteger(figure) && figure >= 0]).toEqual([metric, true])
    }
  })

  it('holds no count above its baseline', () => {
    const over = overBaseline(baselineCounts(LEDGER, RECEIPTS), BASELINE.counts)
    if (over.length === 0) return
    throw new Error(
      [
        `${String(over.length)} counts are over their baseline:`,
        ...over.map(
          ({ metric, current, baseline }) =>
            `  ${metric}: ${String(current)} now, ${String(baseline)} in the baseline`,
        ),
        'a count only goes down, so undo what raised it',
        'lower a baseline with: bun run citations:baseline --write',
      ].join('\n'),
    )
  })
})
