import type { CitationId } from './citation-ids.generated'

export type DataTier = 'A' | 'B' | 'C'

export type EvidenceGrade = ScorableGrade | ExperimentalGrade | FolkloreGrade
export type ScorableGrade = 'A' | 'B'
export type ExperimentalGrade = 'C'
export type FolkloreGrade = 'D' | 'E'

export type CitationVerification =
  | 'crossref-verified'
  | 'datacite-verified'
  | 'url-verified'
  | 'unverified'

export type CitationAccessLevel = 'open-access' | 'paywalled' | 'public-domain'

export type CitationGroup =
  | 'agrivoltaics'
  | 'climate'
  | 'horticulture'
  | 'software'
  | 'solar'
  | 'standards'
  | 'tek'

export type CitationType =
  | 'article'
  | 'article-journal'
  | 'book'
  | 'chapter'
  | 'dataset'
  | 'legislation'
  | 'paper-conference'
  | 'regulation'
  | 'report'
  | 'software'
  | 'standard'
  | 'webpage'

/** Projection of one `docs/CITATIONS.csl.json` entry, authored there and nowhere in TS */
export interface CitationRecord {
  readonly id: CitationId
  readonly type: CitationType
  readonly title: string
  readonly authors: readonly string[]
  readonly year: number | null
  readonly containerTitle: string | null
  readonly doi: string | null
  readonly url: string | null
  readonly group: CitationGroup
  readonly verification: CitationVerification
  readonly accessLevel: CitationAccessLevel
  readonly evidenceTier: DataTier | null
  readonly backsClaims: readonly string[]
  readonly caveat: string | null
  /** Journal, conference or book literature carrying a resolver-verified identifier */
  readonly peerReviewed: boolean
}

export interface Licensed {
  readonly sourceId: string
  readonly license: string
  readonly attribution: string
  readonly viralLicense: boolean
}

export const PEER_REVIEWED_TYPES: readonly CitationType[] = [
  'article-journal',
  'paper-conference',
  'chapter',
  'book',
]

export const RESOLVER_VERIFIED: readonly CitationVerification[] = [
  'crossref-verified',
  'datacite-verified',
]

export const SCORABLE_GRADES: readonly ScorableGrade[] = ['A', 'B']

export const isScorableGrade = (grade: EvidenceGrade): grade is ScorableGrade =>
  grade === 'A' || grade === 'B'
