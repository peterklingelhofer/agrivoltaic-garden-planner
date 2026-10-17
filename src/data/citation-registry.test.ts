import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { driftBetween, ledgerFields, type LedgerEntry, type RegistrySnapshot } from './registry'

interface Entry extends LedgerEntry {
  readonly id: string
  readonly DOI?: string
  readonly URL?: string
}

/**
 * Both files are read as text and parsed here, with no import, so `tsc` never has to walk a
 * 700 KB JSON file to type-check this suite
 */
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(`${import.meta.dir}/../../docs/${file}`, 'utf8')) as T

const LEDGER = read<readonly Entry[]>('CITATIONS.csl.json')
const BY_ID = new Map(LEDGER.map((entry) => [entry.id, entry]))
const SNAPSHOT = read<RegistrySnapshot>('CITATIONS.registry.json')

const RERUN = 're-run: bun run sources:check --write'

/**
 * The weekly job (`scripts/check-sources.mjs`) writes what Crossref and DataCite said about every
 * DOI in the ledger, beside the ledger's own fields at that moment. This holds the ledger to that
 * file with no network: an edit to a title, year, container, volume, issue, page or first author
 * fails here until the job has looked at the edited entry again. Each test collects every
 * offender before it asserts, so one failure names them all
 */
describe('the ledger against the last registry check', () => {
  it('reads a version 1 snapshot', () => {
    expect(SNAPSHOT.format).toBe(1)
  })

  it('checks only entries the ledger still has, under the DOI it still has', () => {
    const stale = Object.entries(SNAPSHOT.dois)
      .filter(([citekey, check]) => BY_ID.get(citekey)?.DOI !== check.doi)
      .map(([citekey]) => citekey)
    expect(
      stale,
      `registry checks whose entry is gone or has another DOI now: ${stale.join(', ')}, ${RERUN}`,
    ).toEqual([])
  })

  it('finds every checked entry unchanged in title, year, container, volume, issue, page and authors', () => {
    const changed = Object.entries(SNAPSHOT.dois).flatMap(([citekey, check]) => {
      const entry = BY_ID.get(citekey)
      const fields = entry === undefined ? [] : driftBetween(ledgerFields(entry), check.ledger)
      return fields.length === 0 ? [] : [`${citekey} (${fields.join(', ')})`]
    })
    expect(
      changed,
      `ledger entries changed since their registry check: ${changed.join(', ')}, ${RERUN}`,
    ).toEqual([])
  })

  it('checks each URL the ledger still lists', () => {
    const stale = Object.entries(SNAPSHOT.urls)
      .filter(([citekey, check]) => BY_ID.get(citekey)?.URL !== check.url)
      .map(([citekey]) => citekey)
    expect(
      stale,
      `URL checks whose entry is gone or has another URL now: ${stale.join(', ')}, ${RERUN}`,
    ).toEqual([])
  })

  it('sees a one-letter title typo on a real entry', () => {
    const entry = LEDGER.find((candidate) => candidate.DOI !== undefined)
    expect(entry).toBeDefined()
    if (entry === undefined) return
    const atCheck = ledgerFields(entry)
    expect(driftBetween(ledgerFields(entry), atCheck)).toEqual([])
    expect(driftBetween(ledgerFields({ ...entry, title: `${entry.title}x` }), atCheck)).toEqual([
      'title',
    ])
  })
})
