import { CITATION_IDS, type CitationId } from '../types/citation-ids.generated'
import {
  PEER_REVIEWED_TYPES,
  RESOLVER_VERIFIED,
  type CitationRecord,
  type CitationType,
  type CitationVerification,
} from '../types/evidence'

interface CslName {
  readonly family?: string
  readonly given?: string
  readonly literal?: string
}

interface CslEntry {
  readonly id: string
  readonly type: string
  readonly title: string
  readonly author?: readonly CslName[]
  readonly 'container-title'?: string
  readonly issued?: { readonly 'date-parts': readonly (readonly number[])[] }
  readonly DOI?: string
  readonly URL?: string
  readonly custom: {
    readonly group: string
    readonly verification: string
    readonly accessLevel: string
    readonly evidenceTier: string | null
    readonly backsClaims?: readonly string[]
    readonly caveat?: string
  }
}

const VALID_IDS = new Set<string>(CITATION_IDS)

const displayName = (name: CslName): string =>
  name.literal ?? [name.family, name.given].filter(Boolean).join(', ')

const project = (entry: CslEntry): CitationRecord => {
  const type = entry.type as CitationType
  const verification = entry.custom.verification as CitationVerification
  return {
    id: entry.id as CitationId,
    type,
    title: entry.title,
    authors: (entry.author ?? []).map(displayName),
    year: entry.issued?.['date-parts'][0]?.[0] ?? null,
    containerTitle: entry['container-title'] ?? null,
    doi: entry.DOI ?? null,
    url: entry.URL ?? null,
    group: entry.custom.group as CitationRecord['group'],
    verification,
    accessLevel: entry.custom.accessLevel as CitationRecord['accessLevel'],
    evidenceTier: entry.custom.evidenceTier as CitationRecord['evidenceTier'],
    backsClaims: entry.custom.backsClaims ?? [],
    caveat: entry.custom.caveat ?? null,
    peerReviewed: PEER_REVIEWED_TYPES.includes(type) && RESOLVER_VERIFIED.includes(verification),
  }
}

let registry: ReadonlyMap<CitationId, CitationRecord> | null = null
let inFlight: Promise<ReadonlyMap<CitationId, CitationRecord>> | null = null

/**
 * `docs/CITATIONS.csl.json` is the single source of truth for every
 * bibliographic field. Nothing else in the tree may hold author, title, year,
 * DOI or URL text: modules reference works by `CitationId` only
 */
export const loadCitations = async (): Promise<ReadonlyMap<CitationId, CitationRecord>> => {
  if (registry !== null) return registry
  inFlight ??= import('../../docs/CITATIONS.csl.json').then((module) => {
    const entries = module.default as unknown as readonly CslEntry[]
    const unknown = entries.filter((entry) => !VALID_IDS.has(entry.id)).map((entry) => entry.id)
    if (unknown.length > 0) {
      throw new Error(
        `citekeys absent from the generated union, run bun run generate: ${unknown.join(', ')}`,
      )
    }
    registry = new Map(entries.map((entry) => [entry.id as CitationId, project(entry)]))
    return registry
  })
  return inFlight
}

export const citationsFor = (
  registryMap: ReadonlyMap<CitationId, CitationRecord>,
  ids: readonly CitationId[],
): readonly CitationRecord[] =>
  ids.map((id) => {
    const record = registryMap.get(id)
    if (record === undefined) throw new Error(`unknown citekey: ${id}`)
    return record
  })

export const formatCitation = (record: CitationRecord): string => {
  const lead = record.authors[0] ?? record.title
  const year = record.year === null ? 'n.d.' : String(record.year)
  return `${lead}${record.authors.length > 1 ? ' et al.' : ''} ${year}`
}

/** The longest an inline marker may be before it stops being a marker and becomes a sentence */
const MARKER_CHARS = 30

/**
 * The same work, short enough to run inside a sentence.
 *
 * `formatCitation` prints "Faiman, David 2008" and, for the many works here with no author at all,
 * the entire title: "225 CMR 28.00: Solar Massachusetts Renewable Target (SMART) Program 2025".
 * That's right in a reference list and wrong beside a clause, and the agent puts these beside
 * clauses. With six model stages citing two or three works each, full labels turn a provenance
 * block into a wall of names.
 *
 * Nothing is lost by it. The full label stays on the control's accessible name and the whole
 * record stays in Sources, which is where the marker takes you. This is the surname-and-year
 * convention every citation style uses for the same reason: in the body of a sentence, a work
 * only needs to be identifiable
 */
export const citationMarker = (record: CitationRecord): string => {
  const year = record.year === null ? 'n.d.' : String(record.year)
  const author = record.authors[0]
  if (author !== undefined) {
    // "Faiman, David" -> "Faiman". The corpus stores family first, so the comma is the boundary
    const family = author.split(',')[0] ?? author
    return `${family}${record.authors.length > 1 ? ' et al.' : ''} ${year}`
  }
  /*
    No author, so the title has to identify it. A colon is where a regulation puts its number:
    "225 CMR 28.00: Solar Massachusetts..." and "DIN SPEC 91434:2021-05 Agri-Photovoltaik..."
    both name themselves before it. Failing that, whole words up to the limit
  */
  const head = record.title.split(':')[0] ?? record.title
  if (head.length <= MARKER_CHARS) return `${head} ${year}`
  const words = head.slice(0, MARKER_CHARS).split(' ')
  return `${words.length > 1 ? words.slice(0, -1).join(' ') : words.join(' ')}... ${year}`
}
