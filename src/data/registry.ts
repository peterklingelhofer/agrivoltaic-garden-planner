/**
 * The registry side of the citation ledger: what Crossref and DataCite say about a work, read into
 * the fields `docs/CITATIONS.csl.json` carries, and the rules for setting the two side by side.
 *
 * An entry marked `crossref-verified` or `datacite-verified` was read against a registry once, by
 * hand. `scripts/check-sources.mjs` asks again every week and keeps the answers in
 * `docs/CITATIONS.registry.json`, and `citation-registry.test.ts` holds the ledger to that file
 * with no network. Everything here is a pure function over parsed JSON and imports nothing, so the
 * script, the tests and a browser can all load it
 */

/**
 * One work as a registry or the ledger describes it, cut down to the fields the two share.
 *
 * `authors` holds family names in the order given. A registry names an organization with a single
 * `name`, which stands in for the family name here. The ledger spells an organization as a
 * `literal` name, which has no family name to compare and is left out.
 *
 * `page` is whatever the source wrote. Crossref gives a range, DataCite gives a first page, and
 * `ledgerFields` keeps the first page of the ledger's range.
 *
 * `years` lists every year the source offers, ascending and without repeats, and `year` is the
 * first of them. Crossref dates one article three ways (issued, printed, online) and a ledger
 * entry may carry any of the three, so the snapshot keeps all of them. The list is empty when
 * the source gives no year, as Crossref does for some book chapters. On the ledger side `years`
 * only restates `year`
 */
export interface RegistryRecord {
  readonly title: string
  readonly year: number | null
  readonly years: readonly number[]
  readonly containerTitle: string | null
  readonly volume: string | null
  readonly issue: string | null
  readonly page: string | null
  readonly authors: readonly string[]
}

/**
 * Where the ledger and a registry say the same thing, by the rules on `agreement`. The issue
 * number has no entry: both records carry it and `driftBetween` watches it, and `agreement`
 * leaves it uncompared
 */
export interface Agreement {
  readonly title: boolean
  readonly year: boolean
  readonly containerTitle: boolean
  readonly volume: boolean
  readonly page: boolean
  readonly authors: boolean
}

/** The registry that answered for a DOI */
export type RegistryName = 'crossref' | 'datacite'

/** What one DOI lookup found, beside the ledger entry as it stood at the time */
export interface DoiCheck {
  readonly doi: string
  /** The registry that held the DOI, or null when neither returned a record */
  readonly registry: RegistryName | null
  /** The status of the last request made, or null when it never got an answer */
  readonly status: number | null
  readonly record: RegistryRecord | null
  /** The ledger's fields when the check ran, which the unit test holds the ledger to */
  readonly ledger: RegistryRecord
  /** Null when there is no record to compare */
  readonly agrees: Agreement | null
  /** An ISO 8601 timestamp */
  readonly checked: string
}

/** What one fetch of a URL found. The body is hashed and not kept */
export interface UrlCheck {
  readonly url: string
  /** Null when the request never got an answer */
  readonly status: number | null
  /** Where the request ended up after redirects */
  readonly finalUrl: string | null
  /** The SHA-256 of the body bytes of a 200 answer, in hex, and null for any other outcome */
  readonly bodySha256: string | null
  /** An ISO 8601 timestamp */
  readonly checked: string
}

/** The whole of `docs/CITATIONS.registry.json`, with both maps keyed by citekey */
export interface RegistrySnapshot {
  readonly format: 1
  /** When the last run that wrote the file started, and null while the file is empty */
  readonly checked: string | null
  readonly dois: Readonly<Record<string, DoiCheck>>
  readonly urls: Readonly<Record<string, UrlCheck>>
}

/** The parts of a CSL-JSON ledger entry that `ledgerFields` reads */
export interface LedgerEntry {
  readonly title: string
  readonly author?: readonly {
    readonly family?: string
    readonly given?: string
    readonly literal?: string
  }[]
  readonly issued?: { readonly 'date-parts': readonly (readonly number[])[] }
  readonly 'container-title'?: string
  readonly volume?: string
  readonly issue?: string
  readonly page?: string
}

interface CrossrefDate {
  readonly 'date-parts'?: readonly (readonly (number | null)[])[]
}

/** The parts of a Crossref `works/<doi>` response's `message` that `recordFromCrossref` reads */
export interface CrossrefMessage {
  readonly title?: readonly string[]
  readonly author?: readonly { readonly family?: string; readonly name?: string }[]
  readonly issued?: CrossrefDate
  readonly 'published-print'?: CrossrefDate
  readonly 'published-online'?: CrossrefDate
  readonly 'container-title'?: readonly string[]
  readonly volume?: string
  readonly issue?: string
  readonly page?: string
}

/** The parts of a DataCite `dois/<doi>` response's `data.attributes` that `recordFromDatacite` reads */
export interface DataciteAttributes {
  readonly titles?: readonly { readonly title?: string }[]
  readonly creators?: readonly { readonly familyName?: string; readonly name?: string }[]
  readonly publicationYear?: number | string | null
  readonly container?: {
    readonly title?: string
    readonly volume?: string
    readonly issue?: string
    readonly firstPage?: string
  }
}

const foldTitle = (text: string, between: string): string =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, between)
    .trim()

/**
 * A title with everything that varies between sources taken out: compatibility forms (the "fi"
 * ligature, "CO₂" against "CO2"), case, punctuation and runs of spaces. Two spellings of one title
 * come out alike, and a mistyped word does not. The words stay apart, which is what a journal
 * name or a surname needs
 */
export const normalizeTitle = (text: string): string => foldTitle(text, ' ')

/**
 * `normalizeTitle` with the spaces gone as well, so that only lowercase letters and digits
 * remain. Crossref damages titles in ways that move spaces or add a character: a line break
 * inside a word ("L a xyuubm" for "Laxyuubm"), spaces lost around italics
 * ("byFaidherbia albida(Del.)"), a footnote digit glued on ("Peach Trees1"). With no spaces left
 * to disagree about, the first two compare equal, and `agreement` takes the digit by testing
 * containment
 */
export const squeezeTitle = (text: string): string => foldTitle(text, '')

const MARKUP = /<[^>]*>/g
const ENTITY = /&(?:#(\d+)|#x([\da-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

const decodeEntity = (entity: string, decimal?: string, hex?: string, named?: string): string => {
  if (named !== undefined) return NAMED_ENTITIES[named.toLowerCase()] ?? entity
  const code = decimal === undefined ? Number.parseInt(hex ?? '', 16) : Number(decimal)
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : entity
}

/** A non-blank string trimmed, a finite number as its digits, and null for anything else */
const trimmed = (value: unknown): string | null => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? String(value) : value
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  return text === '' ? null : text
}

/**
 * `trimmed` for a string from a registry, with the markup and character references removed.
 * Crossref returns italic tags inside a title and a character reference for the ampersand in a
 * journal name, and either one would otherwise read as a difference from the ledger's plain text
 */
const registryText = (value: unknown): string | null => {
  const text = trimmed(value)
  return text === null ? null : trimmed(text.replace(MARKUP, '').replace(ENTITY, decodeEntity))
}

const yearOf = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  const digits = trimmed(value)
  return digits !== null && /^\d{4}$/.test(digits) ? Number(digits) : null
}

const present = <T>(items: readonly (T | null)[]): T[] =>
  items.filter((item): item is T => item !== null)

const distinctAscending = (years: readonly number[]): number[] =>
  [...new Set(years)].sort((a, b) => a - b)

/** The part of a page range before its first hyphen or dash */
const firstPage = (page: string): string =>
  (page.split(/[-\u2010-\u2015\u2212]/, 1)[0] ?? page).trim()

const dateYear = (date: CrossrefDate | undefined): number | null =>
  yearOf(date?.['date-parts']?.[0]?.[0])

/**
 * A Crossref `message` read into a record. `years` holds the year of each of `issued`,
 * `published-print` and `published-online` that has one, and `year` is the earliest. A ledger
 * entry may carry the year a paper appeared online or the year of the issue it landed in, and
 * `agreement` accepts either
 */
export const recordFromCrossref = (message: CrossrefMessage): RegistryRecord => {
  const years = distinctAscending(
    present(
      [message.issued, message['published-print'], message['published-online']].map(dateYear),
    ),
  )
  return {
    title: registryText(message.title?.[0]) ?? '',
    year: years[0] ?? null,
    years,
    containerTitle: registryText(message['container-title']?.[0]),
    volume: registryText(message.volume),
    issue: registryText(message.issue),
    page: registryText(message.page),
    authors: present(
      (message.author ?? []).map(
        (author) => registryText(author.family) ?? registryText(author.name),
      ),
    ),
  }
}

/**
 * DataCite's `data.attributes` read into a record. Most of what DataCite holds is a dataset or a
 * report, so the container fields are usually empty. A creator without a `familyName` is an
 * organization, and its `name` stands in
 */
export const recordFromDatacite = (attributes: DataciteAttributes): RegistryRecord => {
  const year = yearOf(attributes.publicationYear)
  return {
    title: registryText(attributes.titles?.[0]?.title) ?? '',
    year,
    years: year === null ? [] : [year],
    containerTitle: registryText(attributes.container?.title),
    volume: registryText(attributes.container?.volume),
    issue: registryText(attributes.container?.issue),
    page: registryText(attributes.container?.firstPage),
    authors: present(
      (attributes.creators ?? []).map(
        (creator) => registryText(creator.familyName) ?? registryText(creator.name),
      ),
    ),
  }
}

/**
 * A ledger entry read into the shape of a registry record. The year is `issued['date-parts'][0][0]`
 * and the page is the first page of the range as written, so "165-174" and "e88695" become "165"
 * and "e88695". Authors with a `literal` name and no `family` are left out
 */
export const ledgerFields = (entry: LedgerEntry): RegistryRecord => {
  const page = trimmed(entry.page)
  const year = yearOf(entry.issued?.['date-parts']?.[0]?.[0])
  return {
    title: entry.title.trim(),
    year,
    years: year === null ? [] : [year],
    containerTitle: trimmed(entry['container-title']),
    volume: trimmed(entry.volume),
    issue: trimmed(entry.issue),
    page: page === null ? null : firstPage(page),
    authors: present((entry.author ?? []).map((name) => trimmed(name.family))),
  }
}

/** True when the shorter of two normalized strings sits inside the longer on word boundaries */
const overlap = (a: string, b: string): boolean =>
  a !== '' && b !== '' && (` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `))

/** True when the shorter of two squeezed strings sits anywhere inside the longer */
const squeezedOverlap = (a: string, b: string): boolean =>
  a !== '' && b !== '' && (a.includes(b) || b.includes(a))

/**
 * Whether the ledger's record agrees with a registry's, field by field.
 *
 * - `title` agrees when one squeezed title (`squeezeTitle`) contains the other. That absorbs a
 *   subtitle that only one side has and the damage Crossref does to a title: letters split by
 *   a line break, spaces lost around italics, a footnote digit glued to the end. A title that
 *   stops short of the other, mid-word or not, agrees for the same reason. A different word, or
 *   a clause that one side lacks in the middle, still disagrees. A blank title never agrees
 * - `year` agrees when the registry offers no year at all, since an absent date is nothing to
 *   disagree with. Otherwise it agrees when the ledger's year is one of the registry's `years`,
 *   since a ledger often carries the volume year of an article that appeared online earlier,
 *   and a ledger with no year disagrees
 * - `containerTitle` agrees when the ledger has none, or when the normalized titles contain one
 *   another on word boundaries
 * - `volume` and `page` agree when the ledger has none, or when the trimmed strings are equal. A
 *   page compares only the part before a hyphen or dash, so a range and a first page can agree
 * - `authors` agrees when the ledger has none, or only `literal` names (which `ledgerFields`
 *   leaves out), or its first family name is among the registry's family names. Names compare
 *   under `normalizeTitle`, which absorbs case and an apostrophe's shape
 */
export const agreement = (ledger: RegistryRecord, registry: RegistryRecord): Agreement => {
  const lead = ledger.authors[0]
  return {
    title: squeezedOverlap(squeezeTitle(ledger.title), squeezeTitle(registry.title)),
    year:
      registry.years.length === 0 || (ledger.year !== null && registry.years.includes(ledger.year)),
    containerTitle:
      ledger.containerTitle === null ||
      (registry.containerTitle !== null &&
        overlap(normalizeTitle(ledger.containerTitle), normalizeTitle(registry.containerTitle))),
    volume: ledger.volume === null || ledger.volume.trim() === registry.volume?.trim(),
    page:
      ledger.page === null ||
      (registry.page !== null && firstPage(ledger.page) === firstPage(registry.page)),
    authors:
      lead === undefined ||
      registry.authors.some((family) => normalizeTitle(family) === normalizeTitle(lead)),
  }
}

const SCALAR_FIELDS = ['title', 'year', 'containerTitle', 'volume', 'issue', 'page'] as const

/**
 * The fields that differ between the ledger now and the ledger as the last registry check saw
 * it, in the order the record declares them. An empty list means the entry has not moved since
 * a registry last confirmed it. `years` is left out: on the ledger side it only restates `year`,
 * and listing both would report one edit twice
 */
export const driftBetween = (
  current: RegistryRecord,
  atCheck: RegistryRecord,
): readonly (keyof RegistryRecord)[] => {
  const drifted: (keyof RegistryRecord)[] = SCALAR_FIELDS.filter(
    (field) => current[field] !== atCheck[field],
  )
  const sameAuthors =
    current.authors.length === atCheck.authors.length &&
    current.authors.every((family, index) => family === atCheck.authors[index])
  if (!sameAuthors) drifted.push('authors')
  return drifted
}
