import { describe, expect, it } from 'bun:test'
import type { CitationId } from './citation-ids.generated'
import { citedInferred, citedVerbatim, isUnsourced, unsourcedClaim } from './cited'
import type { Cited, SourcedCited, UnsourcedCited } from './cited'

const scientificValue = (cited: SourcedCited<number>): number => cited.value

declare const anyCited: Cited<number>
declare const unsourced: UnsourcedCited<number>

const compileTimeInvariants = (): void => {
  // @ts-expect-error a bare value is not a cited value: uncited data is unrepresentable
  const bare: Cited<number> = 12
  void bare

  // @ts-expect-error a hand-rolled object cannot forge the sealed Cited brand
  const forged: Cited<number> = { provenance: 'verbatim', value: 12, tier: 'A', citations: ['x'] }
  void forged

  // @ts-expect-error a citekey absent from docs/CITATIONS.csl.json is not a CitationId
  citedVerbatim(12, 'A', ['laub-2022'])

  // @ts-expect-error a cited value must name at least one work
  citedVerbatim(12, 'A', [])

  // @ts-expect-error an inference is pinned to tier C and cannot claim tier A
  const wrongTier: 'A' = citedInferred(12, ['fao-ecocrop'], 'class-level').tier
  void wrongTier

  // @ts-expect-error an unsourced value can never satisfy a sourced position
  scientificValue(unsourced)

  // @ts-expect-error an unpartitioned Cited is not assignable to a sourced position
  scientificValue(anyCited)

  scientificValue(citedVerbatim(12, 'A', ['laub2022-shade-meta']))
}

describe('Cited provenance', () => {
  // never called: the value exists so tsc keeps the @ts-expect-error assertions above live
  it('holds the compile-time provenance invariants', () => {
    expect(compileTimeInvariants).toBeInstanceOf(Function)
  })

  it('requires an explicit justification to express an unsourced claim', () => {
    const claim = unsourcedClaim(17, 'no work in the corpus establishes a DLI disorder threshold')
    expect(isUnsourced(claim)).toBe(true)
    expect(claim.tier).toBeNull()
    expect(claim.citations).toEqual([])
    expect(claim.justification.length).toBeGreaterThan(0)
  })

  it('keeps derived values distinguishable from quoted ones', () => {
    const quoted = citedVerbatim(1, 'A', ['laub2022-shade-meta' as CitationId])
    const inferred = citedInferred(1, ['fao-ecocrop' as CitationId], 'class-level inference')
    expect(quoted.provenance).toBe('verbatim')
    expect(inferred.provenance).toBe('inferred')
    expect(inferred.tier).toBe('C')
  })
})
