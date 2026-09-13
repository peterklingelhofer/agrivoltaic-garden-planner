import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import cslEntries from '../../docs/CITATIONS.csl.json'
import { PV_CHAIN_PROVENANCE } from '../sim/pv/provenance'
import { citationsFor as calendarCitationsFor } from '../recommend/calendar'
import { CITATION_IDS } from '../types/citation-ids.generated'
import type { CitationId } from '../types/citation-ids.generated'
import type { CalendarBasis } from '../types/calendar'
import type { Crop } from '../types/crop'
import { loadCropCatalog } from './crops'
import { loadTekRules } from './tek'

const CORPUS = new Set((cslEntries as readonly { readonly id: string }[]).map((entry) => entry.id))

// reads the sources off disk because the runner is bun
const MODULES: Record<string, string> = {}
for (const path of new Glob('src/**/*.{ts,tsx}').scanSync('.')) {
  MODULES[`/${path}`] = readFileSync(path, 'utf8')
}

const ALL: readonly (readonly [string, string])[] = Object.entries(MODULES)
  .map(([path, text]) => [path.replace(/^\/src\//, ''), text] as const)
  // a test file may name a deliberately absent key to prove the type rejects it, and the generated
  // file is where the union is defined, so its keys cite nothing
  .filter(([file]) => !/\.test\.tsx?$/.test(file) && file !== 'types/citation-ids.generated.ts')

/**
 * Fields whose contents are citekeys. `docs/CITATIONS.csl.json` is the single source of
 * truth and `CitationId` is generated from it, so the compiler already rejects a typo,
 * but only where the value is typed: a cast, a `never`, a JSON import or a string built
 * at runtime slips past. This reads the literals back out of the tree and checks them
 * against the corpus itself, which is the thing the compiler can't be asked about
 */
const CITEKEY_FIELDS = /\b(citations|contradictedBy|dliCitations|backsClaims)\s*:\s*\[([^\]]*)\]/g
const CITEKEY_ARRAYS = /(?:NonEmpty<CitationId>|CitationId\[\])\s*=\s*\[([^\]]*)\]/g
const LITERAL = /'([^']+)'/g

interface Reference {
  readonly id: string
  readonly file: string
}

const referencedInSource = (): readonly Reference[] => {
  const out: Reference[] = []
  for (const [file, text] of ALL) {
    for (const pattern of [CITEKEY_FIELDS, CITEKEY_ARRAYS]) {
      pattern.lastIndex = 0
      for (const match of text.matchAll(pattern)) {
        const body = match[2] ?? match[1] ?? ''
        for (const literal of body.matchAll(LITERAL)) {
          const id = literal[1] ?? ''
          if (id.length > 0) out.push({ id, file })
        }
      }
    }
  }
  return out
}

describe('every citekey the code names exists in the corpus', () => {
  it('scans a meaningful share of the tree', () => {
    const found = referencedInSource()
    expect(found.length).toBeGreaterThan(60)
    expect(new Set(found.map((reference) => reference.file)).size).toBeGreaterThanOrEqual(4)
  })

  it('leaves no dangling citekey literal anywhere in src', () => {
    const dangling = referencedInSource().filter((reference) => !CORPUS.has(reference.id))
    expect(dangling).toEqual([])
  })

  it('keeps the generated union and the corpus the same set', () => {
    expect([...CITATION_IDS].sort()).toEqual([...CORPUS].sort())
  })
})

describe('every citekey the runtime hands to a renderer resolves', () => {
  const resolve = (ids: readonly CitationId[], where: string): void => {
    expect(ids.length, `${where} cites nothing`).toBeGreaterThan(0)
    for (const id of ids) expect(CORPUS.has(id), `${where} cites ${id}`).toBe(true)
  }

  it('covers the modules that hold citekeys in code rather than in loadable data', () => {
    // the compliance regime table and the frost citation list are module-private, so
    // they're only reachable through the scan. This proves the scan saw those files
    const files = new Set(referencedInSource().map((reference) => reference.file))
    for (const file of ['sim/compliance.ts', 'recommend/calendar.ts', 'data/companions.ts']) {
      expect(files, file).toContain(file)
    }
  })

  // provenance.ts and tek.ts pass their keys positionally, where no field name can be
  // matched, so those two are reached at runtime instead
  it('resolves the PV chain provenance', () => {
    expect(PV_CHAIN_PROVENANCE.length).toBeGreaterThan(0)
    for (const cited of PV_CHAIN_PROVENANCE) resolve(cited.citations, cited.value)
  })

  it('resolves every TEK attribution', async () => {
    const rules = await loadTekRules()
    expect(rules.length).toBeGreaterThan(0)
    for (const rule of rules) resolve(rule.attribution.citations, rule.key)
  })

  it('resolves every calendar basis a crop can be dated by', async () => {
    const catalog = await loadCropCatalog()
    const crop = catalog[0] as Crop
    const bases: readonly CalendarBasis[] = [
      {
        kind: 'frost-offset',
        anchor: 'last-spring-freeze',
        offsetDays: 0 as never,
        percentile: 50,
      },
      { kind: 'soil-temperature', minSoilTempC: 5 as never },
      { kind: 'days-to-maturity', backedOffDays: 10 as never },
      { kind: 'light-window', firstAdequateMonth: 4 },
      { kind: 'catalog-window' },
    ]
    for (const basis of bases) {
      for (const id of calendarCitationsFor(basis, crop)) {
        expect(CORPUS.has(id), `${basis.kind} cites ${id}`).toBe(true)
      }
    }
  })
})
