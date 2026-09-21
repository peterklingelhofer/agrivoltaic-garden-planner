import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import { gapsByArea, provenanceLedger } from './gaps'

const ROOT = join(import.meta.dir, '..')
const sources: Record<string, string> = {}
for (const path of new Glob('**/*.ts').scanSync(ROOT)) {
  const absolute = join(ROOT, path)
  const key = relative(import.meta.dir, absolute)
  sources[key.startsWith('.') ? key : `./${key}`] = readFileSync(absolute, 'utf8')
}

/**
 * Every admission of a missing source is a single greppable call. The allowlist
 * is the whole gaps register: adding an uncited claim anywhere fails here until
 * it's declared, which is what stops gaps accumulating silently
 */
// water.ts declares three: FAO-56 Table 19 texture ranges transcribed without verifying the
// primary document, growth-stage lengths split on a generic four-stage shape, and drip-line runoff
// capture fractions that no source quantifies
// simulation/pests.ts declares one: the share of a harvest lost at full pest pressure, which
// no source in the corpus converts from the pest densities the companion rules measure
// recommend/stages/rank.ts declares one: the ranking weights, a design choice no study calibrates
// recommend/stages/space.ts declares one: the most crowding may cost a crop, which no source
// measures for a garden bed
// recommend/surroundings.ts declares one: the share of the sky's light the things already
// around a space take, per answer to the surroundings question
// recommend/stages/light-gate.ts declares one: the three numbers the shade-benefit bonus is
// built from, which no study calibrates against a heat-day count
// recommend/yield.ts declares one: the plus or minus 10 percent seasonal PAR allowance
const ALLOWED_UNSOURCED_SITES: readonly string[] = [
  './catalog/schema.ts',
  './water.ts',
  '../recommend/stages/light-gate.ts',
  '../recommend/stages/rank.ts',
  '../recommend/stages/space.ts',
  '../recommend/surroundings.ts',
  '../recommend/yield.ts',
  '../simulation/pests.ts',
]

describe('unsourced claims are loud', () => {
  it('scans the whole src tree', () => {
    const paths = Object.keys(sources)
    expect(paths).toContain('../ui/format.ts')
    expect(paths).toContain('../sim/compliance.ts')
    expect(paths.length).toBeGreaterThan(60)
  })

  it('only appear where the gaps register declares them', () => {
    const callers = Object.entries(sources)
      .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('/types/cited.ts'))
      .filter(([, source]) => /\bunsourcedClaim\(/.test(source))
      .map(([path]) => path)
      .sort()
    expect(callers).toEqual([...ALLOWED_UNSOURCED_SITES].sort())
  })
})

describe('provenance ledger', () => {
  it('is derived from the shipped data and names every gap', async () => {
    const gaps = await provenanceLedger()
    expect(gaps.length).toBeGreaterThan(0)
    for (const gap of gaps) {
      expect(gap.subject.length).toBeGreaterThan(0)
      expect(gap.field.length).toBeGreaterThan(0)
      expect(gap.reason.length).toBeGreaterThan(0)
    }
  })

  it('records the DLI disorder ceiling as the outstanding crop-light gap', async () => {
    const gaps = await provenanceLedger()
    const ceiling = gaps.filter((gap) => gap.field === 'dliMaxBeforeDisorderMolM2Day')
    expect(ceiling.length).toBeGreaterThan(0)
    expect(ceiling[0]?.reason).toMatch(/tipburn/i)
  })

  it('records the companion rules that lost their scoring path', async () => {
    const gaps = await provenanceLedger()
    const rules = gaps.filter((gap) => gap.area === 'companion-rule').map((gap) => gap.subject)
    expect(rules).toContain('marigold-cover-nematode')
    expect(rules).toContain('biofumigation-macerated')
    expect(rules).toContain('sorghum-residue-weed-suppression')
  })

  it('names the crops whose ECOCROP envelope no work in the corpus tabulates', async () => {
    const gaps = await provenanceLedger()
    const subjects = gaps.filter((gap) => gap.area === 'crop-envelope').map((gap) => gap.subject)
    expect(subjects).toEqual(['cranberry', 'sweetfern'])
  })

  it('summarizes by area', async () => {
    const counts = gapsByArea(await provenanceLedger())
    expect((counts.get('crop-light') ?? 0) > 0).toBe(true)
  })

  /** The two season and yield constants declared unsourced reach the same ledger the UI lists */
  it('lists the crowding penalty and the pest loss with the other model constants', async () => {
    const gaps = await provenanceLedger()
    const fields = gaps.filter((gap) => gap.area === 'model-constant').map((gap) => gap.field)
    expect(fields).toContain('maxCrowdingYieldPenalty')
    expect(fields).toContain('pestYieldLossAtFullPressure')
  })
})
