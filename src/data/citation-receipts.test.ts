import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import {
  type LedgerEntryLike,
  RECEIPTS_FORMAT,
  type ReceiptsFile,
  ledgerQuoteKeys,
  staleReceipts,
} from './verbatim'

/**
 * The ledger and its receipts read as text and parsed here, with no import, so `tsc` never has to
 * walk two large JSON files to type-check this suite
 */
const read = (name: string): unknown =>
  JSON.parse(readFileSync(`${import.meta.dir}/../../docs/${name}`, 'utf8'))

const LEDGER = read('CITATIONS.csl.json') as readonly LedgerEntryLike[]
const RECEIPTS = read('CITATIONS.receipts.json') as ReceiptsFile

/** Fewer than this many receipted quotes means the file was emptied or the script read the wrong ledger */
const MIN_RECEIPTED_QUOTES = 500

/**
 * A receipt is the proof that a verbatim quote was found in its source's own text, which can't be
 * committed. It names the quote by a hash of its folded words, so editing a quote after it was
 * checked leaves the receipt pointing at words the ledger no longer has. This test needs no
 * network and no cache. The script that issues receipts needs the cache, a local folder of fetched
 * sources, so it runs on one machine, and this is what carries its verdict to CI
 */
describe('citation receipts', () => {
  it('uses the layout this code reads', () => {
    expect(RECEIPTS.format).toBe(RECEIPTS_FORMAT)
  })

  it('holds no receipt for a quote the ledger has edited, removed or never had', () => {
    const stale = staleReceipts(LEDGER, RECEIPTS)
    if (stale.length === 0) return
    throw new Error(
      [
        `${String(stale.length)} receipts no longer match the ledger:`,
        ...stale.map(({ citekey, preview, reason }) => `  ${citekey}: "${preview}" (${reason})`),
        'the cache is a local folder of fetched sources that is never committed, so only a machine that has it can re-verify',
        're-verify with: bun scripts/check-quotes.mjs --write-receipts',
      ].join('\n'),
    )
  })

  it(`covers at least ${String(MIN_RECEIPTED_QUOTES)} of the ledger's quotes`, () => {
    let receipted = 0
    for (const [citekey, keys] of ledgerQuoteKeys(LEDGER)) {
      const have = new Set((RECEIPTS.receipts[citekey] ?? []).map((receipt) => receipt.quote))
      for (const key of keys) if (have.has(key)) receipted += 1
    }
    expect(receipted).toBeGreaterThanOrEqual(MIN_RECEIPTED_QUOTES)
  })
})
