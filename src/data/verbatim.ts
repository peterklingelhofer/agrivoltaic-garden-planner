import { createHash } from 'node:crypto'

/**
 * The verbatim quotes in the citation ledger, and the receipts that show each one was found in
 * its source.
 *
 * A `backsClaims` string in `docs/CITATIONS.csl.json` can carry a quote from its source: the word
 * verbatim, then the source's own words in single or double quotation marks.
 * `scripts/check-quotes.mjs` looks every quote up in the text of its source, which it reads from a
 * cache: a local folder of fetched sources that is never committed, since most of them are
 * copyrighted. A quote the script finds gets a receipt in `docs/CITATIONS.receipts.json`, which
 * `bun scripts/check-quotes.mjs --write-receipts` writes: the quote's key and a description of the
 * text it was found in. `staleReceipts` holds the receipts against the ledger with no network and
 * no cache, so the words of a quote can't change after it was checked without CI failing until the
 * script finds the new wording.
 *
 * This module is the one definition of which quotes an entry carries, of how a page becomes the
 * text a quote is looked up in and of when two texts count as the same. The script and the tests
 * both import it, so a change to a rule reaches both
 */

/** The layout version of `docs/CITATIONS.receipts.json` */
export const RECEIPTS_FORMAT = 1

/** How many characters of a quote a receipt keeps, enough to find the quote in the ledger */
const PREVIEW_CHARACTERS = 60

/** The kind of document a quote was found in, or `txt` when only extracted text is cached */
export type ReceiptKind = 'pdf' | 'html' | 'xml' | 'txt'

/** Where and when a quote was found */
export interface ReceiptFound {
  /** The cached document the text stands for: a PDF, an XML or HTML page, or a bare text file */
  readonly kind: ReceiptKind
  /** The size of that document in bytes */
  readonly bytes: number
  /** The SHA-256 of the whole text after `foldForMatch`, so a different text is a new receipt */
  readonly textSha256: string
  /** The fetch step that produced the document, or `manual` when someone put it there */
  readonly via: string
  /** The day the quote was found in this text, as YYYY-MM-DD */
  readonly date: string
}

/** The proof that one quote of one ledger entry was found in its source */
export interface QuoteReceipt {
  /** The quote's `quoteKey` */
  readonly quote: string
  /** The first characters of the quote, for a person looking for it in the ledger */
  readonly preview: string
  readonly found: ReceiptFound
}

/** `docs/CITATIONS.receipts.json`: the receipts of each ledger entry, by citekey */
export interface ReceiptsFile {
  readonly format: typeof RECEIPTS_FORMAT
  readonly receipts: Readonly<Record<string, readonly QuoteReceipt[]>>
}

/** The part of a ledger entry that holds quotes */
export interface ClaimedEntry {
  readonly custom?: { readonly backsClaims?: readonly string[] }
}

/** A CSL-JSON ledger entry as far as this module reads it */
export interface LedgerEntryLike extends ClaimedEntry {
  readonly id: string
}

/** A quoted span found after the word verbatim */
export interface ClaimQuote {
  readonly text: string
  /** True when the span names a place in the source and doesn't quote it */
  readonly label: boolean
}

/** Why a receipt no longer stands for the ledger */
export type StaleReason = 'unknown-citekey' | 'quote-not-in-ledger' | 'duplicate'

export interface StaleReceipt {
  readonly citekey: string
  readonly preview: string
  readonly reason: StaleReason
}

/**
 * Whitespace, curly quotes, dashes and soft hyphens evened out, so a quote from the ledger can be
 * matched against text pulled from a PDF. A hyphen at the end of a line goes after a letter (word
 * wrap) and stays after anything else, as in the range 26-30
 */
export const normalizeForMatch = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201a\u2032]/g, "'") // curly single quotes and the prime
    .replace(/[\u201c\u201d\u201e\u2033]/g, '"') // curly double quotes and the double prime
    .replace(/[\u2013\u2014\u2212]/g, '-') // en dash, em dash and minus sign
    .replace(/\u00ad\s*\n\s*/g, '') // soft hyphen at a line break
    .replace(/(?<=\p{L})-\s*\n\s*/gu, '') // hard hyphen after a letter at a line break (word wrap)
    .replace(/-\s*\n\s*/g, '-') // any other hyphen at a line break stays, as in the range 26-30
    .replace(/\u00ad/g, '') // any remaining soft hyphen
    .replace(/\s+/g, ' ')
    .trim()

// the light units in the spellings sources use: mol·m-2·d-1, mol m-2 d-1, mol/m2/d, mol.m-2.d-1
// and so on. The separator may be a middle dot (U+00B7), bullet operator (U+2219), dot operator
// (U+22C5), period or slash, the 2 may lose its minus, d may be day, and s covers photon flux
const LIGHT_UNIT =
  /mol\s*[\u00b7\u2219\u22c5./]?\s*m\s*-?2\s*[\u00b7\u2219\u22c5./]?\s*(day|d|s)(?:\s*-\s*1|1)?(?![a-z0-9])/g

/**
 * `normalizeForMatch` plus the variation a ledger quote and a PDF or page extraction tend to
 * disagree on: case, the degree sign, the unit spellings, the multiplication sign, the micro sign,
 * the spacing around % = < > and the less-or-equal and greater-or-equal signs and before closing
 * punctuation, a space inside an ordinal like 3 rd, and a hyphen between letters. For lenient
 * lookups, never for display
 */
export const foldForMatch = (text: string): string =>
  normalizeForMatch(text)
    .toLowerCase()
    .replace(/\u00b0/g, '') // degree sign
    .replace(LIGHT_UNIT, (_, unit: string) => `mol/m2/${unit.charAt(0)}`)
    .replace(/\u00d7/g, 'x') // multiplication sign
    .replace(/[\u00b5\u03bc]/g, 'u') // micro sign and Greek mu to u, as ledger quotes write umol
    .replace(/\s+([%.,;:!?)\]])/g, '$1')
    .replace(/(\d)\s+(st|nd|rd|th)\b/g, '$1$2')
    .replace(/\s*([=<>\u2264\u2265])\s*/g, '$1')
    .replace(/(?<=\p{L})\s*-\s*(?=\p{L})/gu, '')
    .replace(/\s+/g, ' ')
    .trim()

// the named character references the cached pages use, as code points (a numeric reference needs
// no table)
const ENTITIES: ReadonlyMap<string, number> = new Map([
  ['amp', 0x26],
  ['lt', 0x3c],
  ['gt', 0x3e],
  ['quot', 0x22],
  ['apos', 0x27],
  ['nbsp', 0xa0],
  ['shy', 0xad],
  ['emsp', 0x2003],
  ['thinsp', 0x2009],
  ['deg', 0xb0],
  ['plusmn', 0xb1],
  ['sup2', 0xb2],
  ['sup3', 0xb3],
  ['micro', 0xb5],
  ['middot', 0xb7],
  ['times', 0xd7],
  ['plus', 0x2b],
  ['minus', 0x2212],
  ['frac14', 0xbc],
  ['frac12', 0xbd],
  ['frac34', 0xbe],
  ['copy', 0xa9],
  ['reg', 0xae],
  ['trade', 0x2122],
  ['bull', 0x2022],
  ['infin', 0x221e],
  ['ndash', 0x2013],
  ['mdash', 0x2014],
  ['lsquo', 0x2018],
  ['rsquo', 0x2019],
  ['ldquo', 0x201c],
  ['rdquo', 0x201d],
  ['hellip', 0x2026],
  ['raquo', 0xbb],
  ['rarr', 0x2192],
  ['ntilde', 0xf1],
  ['oacute', 0xf3],
  ['eacute', 0xe9],
  ['ouml', 0xf6],
  ['uuml', 0xfc],
  ['ccedil', 0xe7],
  ['aacute', 0xe1],
  ['agrave', 0xe0],
  ['acirc', 0xe2],
  ['egrave', 0xe8],
  ['uacute', 0xfa],
  ['ucirc', 0xfb],
])

const WINDOWS_1252 = new TextDecoder('windows-1252')

// decodes one character reference and leaves the ones it doesn't know as they were. A numeric
// reference from 128 to 159 is a windows-1252 character, the way browsers read it (150 is an en
// dash)
const decodeEntity = (
  match: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string => {
  const codePoint = decimal
    ? Number(decimal)
    : hex
      ? Number.parseInt(hex, 16)
      : ENTITIES.get(name ?? '')
  if (codePoint === undefined || !(codePoint > 0 && codePoint <= 0x10ffff)) return match
  return codePoint >= 0x80 && codePoint <= 0x9f
    ? WINDOWS_1252.decode(Uint8Array.of(codePoint))
    : String.fromCodePoint(codePoint)
}

/**
 * HTML or XML reduced to text that can be searched: scripts, styles and comments dropped, every
 * other tag replaced by a space, character references decoded and whitespace collapsed. The
 * references are decoded in one pass, so a decoded ampersand never starts another reference and
 * `&amp;deg;` comes out as `&deg;`. A reference it doesn't know stays as written.
 * `scripts/check-quotes.mjs` reads every cached page and XML file through this, so the text a
 * receipt stands on is the text this function returns, folded by `foldForMatch`
 */
export const stripTags = (markup: string): string =>
  markup
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]*));/gi, decodeEntity)
    .replace(/\s+/g, ' ')
    .trim()

const countOf = (text: string, character: string): number => text.split(character).length - 1

// a quoted span that points at a place in the source or draws a table without quoting text: a
// (no quote: ...) note, a [Table N:] marker, a table row (|), a breadcrumb (a > b), or in
// parentheses a section or heading name, or any span of three words or fewer with no digit
const isLabel = (text: string, before: string, after: string, inParens: boolean): boolean => {
  const short = text.split(/\s+/).length <= 3 && !/\d/.test(text)
  return (
    /^\(?\s*no quote\b/i.test(text) ||
    /\(\s*no quote\b[^)]*$/i.test(before) ||
    /\[\s*table\b[^\]]*:\s*\]/i.test(text) ||
    text.includes('|') ||
    /\p{L}\s>\s\p{L}/u.test(text) ||
    (inParens && (short || /^\s*(?:sections?|headings?)\b/i.test(after)))
  )
}

// a quoted span in single or double quotes. A single-quoted span may hold an apostrophe that a
// letter follows, as in crop's. It doesn't open after a letter or digit and it ends at a quote
// that no letter or digit follows
const QUOTED_SPAN = /(?<![\p{L}\p{N}])'((?:[^']|'(?=\p{L}))*)'(?![\p{L}\p{N}])|"([^"]*)"/gu

/**
 * Every quoted span that follows the word verbatim in one `backsClaims` string, in order. A claim
 * without that word has none. A span that names a place in the source is marked as a label, and a
 * label is not a quote
 */
export const quotesInClaim = (claim: string): readonly ClaimQuote[] => {
  const verbatimAt = claim.toLowerCase().indexOf('verbatim')
  if (verbatimAt === -1) return []
  const rest = claim.slice(verbatimAt)
  const quotes: ClaimQuote[] = []
  let depth = 0
  let from = 0
  for (const match of rest.matchAll(QUOTED_SPAN)) {
    const outside = rest.slice(from, match.index)
    depth += countOf(outside, '(') - countOf(outside, ')')
    from = match.index + match[0].length
    const text = (match[1] ?? match[2] ?? '').trim()
    if (text === '') continue
    const label = isLabel(text, rest.slice(0, match.index), rest.slice(from), depth > 0)
    quotes.push({ text, label })
  }
  return quotes
}

/** The quotes an entry carries, in order, with the labels left out */
export const verbatimQuotesOf = (entry: ClaimedEntry): readonly string[] =>
  (entry.custom?.backsClaims ?? []).flatMap((claim) =>
    quotesInClaim(claim)
      .filter((quote) => !quote.label)
      .map((quote) => quote.text),
  )

/**
 * A quote cut at its ellipses (three periods or the one character, bracketed or not), with the
 * empty pieces an ellipsis at either end leaves dropped. Each piece is looked up on its own, so
 * the words an author left out don't have to match
 */
export const splitSegments = (quote: string): readonly string[] =>
  quote.split(/\s*\[?(?:\.\.\.|\u2026)\]?\s*/).filter((segment) => segment.trim() !== '')

/**
 * The identity of a quote: the SHA-256 of its folded text as 64 lowercase hex digits. Case,
 * spacing and unit spellings fold away, so a receipt survives a retyped unit and stops matching
 * when a word changes
 */
export const quoteKey = (text: string): string =>
  createHash('sha256').update(foldForMatch(text)).digest('hex')

/** The first characters of a quote, for the receipt's `preview` */
export const quotePreview = (text: string): string =>
  Array.from(text).slice(0, PREVIEW_CHARACTERS).join('')

/**
 * The quote keys each ledger entry carries now, by citekey. An entry with no quotes maps to an
 * empty set, so a receipt on it reads as a quote that changed and not as an unknown entry
 */
export const ledgerQuoteKeys = (
  ledger: readonly LedgerEntryLike[],
): ReadonlyMap<string, ReadonlySet<string>> =>
  new Map(
    ledger.map((entry): [string, ReadonlySet<string>] => [
      entry.id,
      new Set(verbatimQuotesOf(entry).map(quoteKey)),
    ]),
  )

/**
 * The receipts the ledger no longer backs, one per receipt, in file order. A receipt is
 * `unknown-citekey` when no entry has its citekey, `quote-not-in-ledger` when its entry carries
 * no quote with its key (the quote was edited or removed after it was checked) and `duplicate`
 * when an earlier receipt on the same entry has the same key. An empty result means every receipt
 * still stands for a quote the ledger carries. It says nothing about a quote that has no receipt
 */
export const staleReceipts = (
  ledger: readonly LedgerEntryLike[],
  receipts: ReceiptsFile,
): readonly StaleReceipt[] => {
  const keys = ledgerQuoteKeys(ledger)
  const stale: StaleReceipt[] = []
  for (const [citekey, list] of Object.entries(receipts.receipts)) {
    const current = keys.get(citekey)
    const seen = new Set<string>()
    for (const receipt of list) {
      const reason: StaleReason | null =
        current === undefined
          ? 'unknown-citekey'
          : !current.has(receipt.quote)
            ? 'quote-not-in-ledger'
            : seen.has(receipt.quote)
              ? 'duplicate'
              : null
      seen.add(receipt.quote)
      if (reason !== null) stale.push({ citekey, preview: receipt.preview, reason })
    }
  }
  return stale
}
