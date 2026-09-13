import type { Sealed } from './brand'
import type { CitationId } from './citation-ids.generated'
import type { DataTier } from './evidence'

export type NonEmpty<T> = readonly [T, ...T[]]

export type Provenance = 'verbatim' | 'derived' | 'inferred' | 'computed' | 'unsourced'

interface CitedCore<T> extends Sealed<'Cited'> {
  readonly value: T
  readonly caveat: string | null
}

export interface VerbatimCited<T> extends CitedCore<T> {
  readonly provenance: 'verbatim'
  readonly tier: DataTier
  readonly citations: NonEmpty<CitationId>
}

export interface DerivedCited<T> extends CitedCore<T> {
  readonly provenance: 'derived'
  readonly tier: DataTier
  readonly citations: NonEmpty<CitationId>
  readonly derivation: string
}

export interface InferredCited<T> extends CitedCore<T> {
  readonly provenance: 'inferred'
  readonly tier: 'C'
  readonly citations: NonEmpty<CitationId>
  readonly basis: string
}

export interface ComputedCited<T> extends CitedCore<T> {
  readonly provenance: 'computed'
  readonly tier: DataTier
  readonly citations: NonEmpty<CitationId>
  readonly model: string
}

export interface UnsourcedCited<T> extends CitedCore<T> {
  readonly provenance: 'unsourced'
  readonly tier: null
  readonly citations: readonly []
  readonly justification: string
}

export type Cited<T> =
  | VerbatimCited<T>
  | DerivedCited<T>
  | InferredCited<T>
  | ComputedCited<T>
  | UnsourcedCited<T>

export type SourcedCited<T> = Exclude<Cited<T>, UnsourcedCited<T>>

export type MaybeCited<T> = Cited<T> | null

const seal = <T>(record: object): T => record as T

export const citedVerbatim = <T>(
  value: T,
  tier: DataTier,
  citations: NonEmpty<CitationId>,
  caveat: string | null = null,
): VerbatimCited<T> => seal({ provenance: 'verbatim', value, tier, citations, caveat })

export const citedDerived = <T>(
  value: T,
  tier: DataTier,
  citations: NonEmpty<CitationId>,
  derivation: string,
  caveat: string | null = null,
): DerivedCited<T> => seal({ provenance: 'derived', value, tier, citations, derivation, caveat })

export const citedInferred = <T>(
  value: T,
  citations: NonEmpty<CitationId>,
  basis: string,
  caveat: string | null = null,
): InferredCited<T> => seal({ provenance: 'inferred', value, tier: 'C', citations, basis, caveat })

export const citedComputed = <T>(
  value: T,
  tier: DataTier,
  citations: NonEmpty<CitationId>,
  model: string,
  caveat: string | null = null,
): ComputedCited<T> => seal({ provenance: 'computed', value, tier, citations, model, caveat })

/**
 * The only way to express a value with no peer-reviewed backing. Every call is a deliberate,
 * greppable admission that renders as an explicit gap in the UI. The sources step's provenance
 * ledger (`provenanceLedger` in `src/data/gaps.ts`) lists all of them but the three water claims
 * in `src/data/water.ts`, which the water panel shows beside their own figures
 */
export const unsourcedClaim = <T>(
  value: T,
  justification: string,
  caveat: string | null = null,
): UnsourcedCited<T> =>
  seal({ provenance: 'unsourced', value, tier: null, citations: [], justification, caveat })

export const isUnsourced = <T>(cited: Cited<T>): cited is UnsourcedCited<T> =>
  cited.provenance === 'unsourced'

export const isSourced = <T>(cited: Cited<T>): cited is SourcedCited<T> =>
  cited.provenance !== 'unsourced'

export const citedValue = <T>(cited: Cited<T>): T => cited.value

export const mapCited = <T, U>(cited: Cited<T>, project: (value: T) => U): Cited<U> =>
  seal({ ...cited, value: project(cited.value) })
