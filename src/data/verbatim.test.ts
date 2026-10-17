import { describe, expect, it } from 'bun:test'
import {
  type LedgerEntryLike,
  type QuoteReceipt,
  RECEIPTS_FORMAT,
  type ReceiptsFile,
  foldForMatch,
  ledgerQuoteKeys,
  normalizeForMatch,
  quoteKey,
  quotePreview,
  quotesInClaim,
  splitSegments,
  staleReceipts,
  stripTags,
  verbatimQuotesOf,
} from './verbatim'

// the daily light unit as sources and ledger quotes spell it: typeset with middle dots and
// superscripts (mol·m⁻²·d⁻¹), with bullet or dot operators, and in the plain forms a PDF
// extraction or a hand-typed quote leaves
const LIGHT_UNIT_SPELLINGS: readonly string[] = [
  'mol\u00b7m\u207b\u00b2\u00b7d\u207b\u00b9',
  'mol\u2219m-2\u2219d-1',
  'mol\u22c5m-2\u22c5d-1',
  'mol m-2 d-1',
  'mol m-2 day-1',
  'mol/m\u00b2/d',
  'mol/m2/d',
  'mol.m-2.d-1',
]

describe('normalizeForMatch', () => {
  it('evens out curly quotes and dashes', () => {
    expect(normalizeForMatch('the \u2018crop\u2019s\u2019 yield')).toBe("the 'crop's' yield")
    expect(normalizeForMatch('\u201cyield\u201d')).toBe('"yield"')
    expect(normalizeForMatch('up \u2013 down \u2014 and \u2212 5')).toBe('up - down - and - 5')
  })

  it('collapses whitespace and trims the ends', () => {
    expect(normalizeForMatch('  a \n\t b  ')).toBe('a b')
  })

  it('joins a word wrapped after a hyphen that follows a letter', () => {
    expect(normalizeForMatch('photo-\n  synthesis')).toBe('photosynthesis')
  })

  it('keeps the hyphen when a digit comes before it at a line end', () => {
    expect(normalizeForMatch('the range 26-\n30 days')).toBe('the range 26-30 days')
  })

  it('joins a word wrapped after a soft hyphen and drops one inside a word', () => {
    expect(normalizeForMatch('photo\u00ad\nsynthesis')).toBe('photosynthesis')
    expect(normalizeForMatch('photo\u00adsynthesis')).toBe('photosynthesis')
  })
})

describe('foldForMatch', () => {
  it('folds every spelling of the daily light unit to one', () => {
    for (const spelling of LIGHT_UNIT_SPELLINGS) {
      expect([spelling, foldForMatch(`a DLI of 12 ${spelling} or more`)]).toEqual([
        spelling,
        'a dli of 12 mol/m2/d or more',
      ])
    }
  })

  it('folds the photon flux unit and the micro sign', () => {
    expect(foldForMatch('200 \u00b5mol m\u22122 s\u22121')).toBe('200 umol/m2/s')
    expect(foldForMatch('200 \u03bcmol/m2/s')).toBe('200 umol/m2/s')
  })

  it('ignores case', () => {
    expect(foldForMatch('Shade CLOTH')).toBe('shade cloth')
  })

  it('drops the degree sign', () => {
    expect(foldForMatch('below 30\u00b0C')).toBe('below 30c')
    expect(foldForMatch('below 30\u00b0C')).toBe(foldForMatch('below 30C'))
  })

  it('closes the space inside an ordinal', () => {
    expect(foldForMatch('the 3 rd leaf')).toBe('the 3rd leaf')
    expect(foldForMatch('the 3 rd leaf')).toBe(foldForMatch('the 3rd leaf'))
  })

  it('drops a hyphen between letters and keeps one next to a digit', () => {
    expect(foldForMatch('mid-June')).toBe(foldForMatch('midJune'))
    expect(foldForMatch('26-30 days, CO-9')).toBe('26-30 days, co-9')
  })

  it('treats a line-end hyphen after a letter and after a digit differently', () => {
    expect(foldForMatch('mid-\nJune')).toBe('midjune')
    expect(foldForMatch('days 26-\n30')).toBe('days 26-30')
  })

  it('closes the space before punctuation and around comparison signs', () => {
    expect(foldForMatch('12 % , or 5 .')).toBe('12%, or 5.')
    expect(foldForMatch('x = 3 \u2264 y')).toBe('x=3\u2264y')
  })

  it('folds the multiplication sign', () => {
    expect(foldForMatch('6\u2032 \u00d7 4\u2032')).toBe("6' x 4'")
  })
})

describe('stripTags', () => {
  const EN_DASH = '\u2013'
  const DEGREE = '\u00b0'

  it('replaces tags with spaces and collapses whitespace', () => {
    expect(stripTags('<p>Shade <b>cloth</b></p>\n<p>works</p>')).toBe('Shade cloth works')
    expect(stripTags('foo<b>bar</b>baz')).toBe('foo bar baz')
  })

  it('reads the text of an XML document', () => {
    expect(stripTags('<?xml version="1.0"?><article><title>Light</title></article>')).toBe('Light')
  })

  it('drops scripts, styles and comments with what they hold', () => {
    expect(
      stripTags(
        '<script type="text/javascript">var tag = "<b>";</script>kept<style>p { color: red }</style>text<!-- hidden <i> -->end',
      ),
    ).toBe('kept text end')
  })

  it('decodes a named reference', () => {
    expect(stripTags('caf&eacute; &amp; 3 &ndash; 5')).toBe(`caf\u00e9 & 3 ${EN_DASH} 5`)
  })

  it('decodes a decimal reference', () => {
    expect(stripTags('30&#176;C')).toBe(`30${DEGREE}C`)
  })

  it('decodes a hex reference in either case', () => {
    expect(stripTags('30&#xB0;C and 30&#xb0;C')).toBe(`30${DEGREE}C and 30${DEGREE}C`)
  })

  it('reads a numeric reference from 128 to 159 as windows-1252', () => {
    expect(stripTags('ages 3&#0150;5 and 3&#150;5')).toBe(`ages 3${EN_DASH}5 and 3${EN_DASH}5`)
  })

  it('decodes in one pass, so a decoded ampersand starts nothing', () => {
    expect(stripTags('&amp;deg;')).toBe('&deg;')
  })

  it('leaves a reference it does not know as written', () => {
    expect(stripTags('&nosuchthing; &#0; &#1114112;')).toBe('&nosuchthing; &#0; &#1114112;')
  })

  it('turns a non-breaking space into a plain one', () => {
    expect(stripTags('a&nbsp;b')).toBe('a b')
  })
})

describe('quotesInClaim', () => {
  it('reads a plain quote', () => {
    expect(
      quotesInClaim(
        "fall window rule, verbatim from Table 2: 'plant at least 4-8 weeks before first fall frost'",
      ),
    ).toEqual([{ text: 'plant at least 4-8 weeks before first fall frost', label: false }])
  })

  it('reads a double-quoted quote', () => {
    expect(quotesInClaim('the floor, verbatim: "a minimum DLI of 12 for vine crops"')).toEqual([
      { text: 'a minimum DLI of 12 for vine crops', label: false },
    ])
  })

  it('keeps an apostrophe inside a quote', () => {
    expect(
      quotesInClaim("cacao spacing, verbatim: 'The farm's tree spacing is 6 ft by 7 ft' (p. 3)"),
    ).toEqual([{ text: "The farm's tree spacing is 6 ft by 7 ft", label: false }])
  })

  it('marks a short name in parentheses as a label', () => {
    expect(
      quotesInClaim(
        "a ceiling, verbatim: 'shade above 30 percent cut yield' (Section 'Light needs')",
      ),
    ).toEqual([
      { text: 'shade above 30 percent cut yield', label: false },
      { text: 'Light needs', label: true },
    ])
  })

  it('marks a long name in parentheses as a label when the word section follows it', () => {
    expect(
      quotesInClaim(
        "a ceiling, verbatim: 'shade above 30 percent cut yield' ('Light needs of vine crops in the north' section)",
      ),
    ).toEqual([
      { text: 'shade above 30 percent cut yield', label: false },
      { text: 'Light needs of vine crops in the north', label: true },
    ])
  })

  it('marks a no-quote note as a label', () => {
    expect(
      quotesInClaim("a frost date, verbatim: '(no quote: the species is frost-free)' (n/a)"),
    ).toEqual([{ text: '(no quote: the species is frost-free)', label: true }])
  })

  it('marks a pipe row as a label', () => {
    expect(quotesInClaim("a height, verbatim: 'Height (cm) | 75-80 | 85-90 | 115-120'")).toEqual([
      { text: 'Height (cm) | 75-80 | 85-90 | 115-120', label: true },
    ])
  })

  it('reads two quotes in one claim, in order', () => {
    expect(
      quotesInClaim(
        'two limits, verbatim: \'the lower limit is 12 mol\' and later "the upper limit is 30 mol"',
      ),
    ).toEqual([
      { text: 'the lower limit is 12 mol', label: false },
      { text: 'the upper limit is 30 mol', label: false },
    ])
  })

  it('finds nothing in a claim without the word verbatim', () => {
    expect(quotesInClaim("the floor for 'vine crops' is 15 mol per day")).toEqual([])
  })

  it('ignores quotation marks before the word verbatim', () => {
    expect(quotesInClaim("the 'vine crops' floor, verbatim: 'a minimum of twelve'")).toEqual([
      { text: 'a minimum of twelve', label: false },
    ])
  })

  it('reads the word verbatim in any case', () => {
    expect(quotesInClaim("Verbatim: 'a minimum of twelve'")).toEqual([
      { text: 'a minimum of twelve', label: false },
    ])
  })
})

describe('verbatimQuotesOf', () => {
  it('lists the quotes of every claim in order and leaves the labels out', () => {
    expect(
      verbatimQuotesOf({
        custom: {
          backsClaims: [
            "first, verbatim: 'the first quoted words' (Section 'Light needs')",
            'a paraphrase with no quote',
            "third, verbatim: '(no quote: not applicable)'",
            "fourth, verbatim: 'the second quoted words'",
          ],
        },
      }),
    ).toEqual(['the first quoted words', 'the second quoted words'])
  })

  it('returns nothing for an entry with no claims', () => {
    expect(verbatimQuotesOf({})).toEqual([])
    expect(verbatimQuotesOf({ custom: {} })).toEqual([])
  })
})

describe('splitSegments', () => {
  const PARTS = ['the first words', 'the last words']

  it('splits at three periods', () => {
    expect(splitSegments('the first words ... the last words')).toEqual(PARTS)
  })

  it('splits at the ellipsis character', () => {
    expect(splitSegments('the first words\u2026the last words')).toEqual(PARTS)
  })

  it('splits at a bracketed ellipsis', () => {
    expect(splitSegments('the first words [...] the last words')).toEqual(PARTS)
  })

  it('drops the empty pieces an ellipsis at either end leaves', () => {
    expect(splitSegments('... the middle words \u2026')).toEqual(['the middle words'])
    expect(splitSegments('[...] only the end')).toEqual(['only the end'])
  })

  it('leaves a quote with no ellipsis whole', () => {
    expect(splitSegments('one whole quote')).toEqual(['one whole quote'])
  })
})

describe('quoteKey', () => {
  // the digests come from shasum, so a change to the fold shows up here before it silently
  // outdates every receipt in the file
  it('is the SHA-256 of the folded text as lowercase hex', () => {
    expect(quoteKey('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    )
    expect(
      quoteKey('A recommended minimum DLI of 12 mol\u00b7m\u207b\u00b2\u00b7d\u207b\u00b9'),
    ).toBe('d3870dfe224b383cf405c8b1f790652cc9d6d6e36ca334d980fe90b99b385a65')
  })

  it('is the same for texts that fold the same', () => {
    expect(quoteKey('The first  QUOTED words')).toBe(quoteKey('the first quoted words'))
    expect(quoteKey('the first quoted words')).toBe(
      '029912cbcde10ef26505a010b9d9edf21b9f7f4cb783634f1a947472d808670f',
    )
  })

  it('changes when a word does', () => {
    expect(quoteKey('the first quoted words')).not.toBe(quoteKey('the first quoted word'))
  })
})

describe('quotePreview', () => {
  it('keeps the first 60 characters', () => {
    expect(quotePreview('x'.repeat(100))).toBe('x'.repeat(60))
    expect(quotePreview('a short quote')).toBe('a short quote')
  })

  it('never cuts a character in two', () => {
    expect(quotePreview(`${'x'.repeat(59)}\u{1f600}tail`)).toBe(`${'x'.repeat(59)}\u{1f600}`)
  })
})

describe('staleReceipts', () => {
  const FIRST = 'the first quoted words'
  const SECOND = 'the second quoted words'
  const LEDGER: readonly LedgerEntryLike[] = [
    {
      id: 'alpha2020-one',
      custom: {
        backsClaims: [`a claim, verbatim: '${FIRST}'`, `another claim, verbatim: '${SECOND}'`],
      },
    },
    { id: 'beta2021-two', custom: { backsClaims: ['a paraphrase with no quote'] } },
    { id: 'gamma2022-three' },
    {
      id: 'delta2023-four',
      custom: { backsClaims: [`quotes the same words, verbatim: '${FIRST}'`] },
    },
  ]

  const receiptFor = (text: string): QuoteReceipt => ({
    quote: quoteKey(text),
    preview: quotePreview(text),
    found: {
      kind: 'pdf',
      bytes: 1024,
      textSha256: 'f'.repeat(64),
      via: 'a-direct',
      date: '2000-01-01',
    },
  })

  const fileOf = (receipts: Record<string, readonly QuoteReceipt[]>): ReceiptsFile => ({
    format: RECEIPTS_FORMAT,
    receipts,
  })

  it('finds nothing when every receipt matches a quote of its entry', () => {
    expect(
      staleReceipts(
        LEDGER,
        fileOf({
          'alpha2020-one': [receiptFor(FIRST), receiptFor(SECOND)],
          'delta2023-four': [receiptFor(FIRST)],
        }),
      ),
    ).toEqual([])
  })

  it('finds nothing for an empty file', () => {
    expect(staleReceipts(LEDGER, fileOf({}))).toEqual([])
  })

  it('finds nothing when a quote was retyped in a way that folds away', () => {
    const retyped: readonly LedgerEntryLike[] = [
      {
        id: 'alpha2020-one',
        custom: { backsClaims: ["a claim, verbatim: 'The  FIRST quoted words'"] },
      },
    ]
    expect(staleReceipts(retyped, fileOf({ 'alpha2020-one': [receiptFor(FIRST)] }))).toEqual([])
  })

  it('flags a receipt whose citekey is not in the ledger', () => {
    expect(staleReceipts(LEDGER, fileOf({ 'nobody2000-none': [receiptFor(FIRST)] }))).toEqual([
      { citekey: 'nobody2000-none', preview: FIRST, reason: 'unknown-citekey' },
    ])
  })

  it('flags a receipt whose quote was edited', () => {
    expect(
      staleReceipts(
        LEDGER,
        fileOf({ 'alpha2020-one': [receiptFor(FIRST), receiptFor('the second quoted word')] }),
      ),
    ).toEqual([
      {
        citekey: 'alpha2020-one',
        preview: 'the second quoted word',
        reason: 'quote-not-in-ledger',
      },
    ])
  })

  it('flags a receipt on an entry that no longer has any quote', () => {
    expect(
      staleReceipts(
        LEDGER,
        fileOf({ 'beta2021-two': [receiptFor(FIRST)], 'gamma2022-three': [receiptFor(SECOND)] }),
      ),
    ).toEqual([
      { citekey: 'beta2021-two', preview: FIRST, reason: 'quote-not-in-ledger' },
      { citekey: 'gamma2022-three', preview: SECOND, reason: 'quote-not-in-ledger' },
    ])
  })

  it("flags a receipt for another entry's quote", () => {
    expect(staleReceipts(LEDGER, fileOf({ 'delta2023-four': [receiptFor(SECOND)] }))).toEqual([
      { citekey: 'delta2023-four', preview: SECOND, reason: 'quote-not-in-ledger' },
    ])
  })

  it('flags the second receipt for the same quote as a duplicate', () => {
    expect(
      staleReceipts(
        LEDGER,
        fileOf({ 'alpha2020-one': [receiptFor(FIRST), receiptFor(SECOND), receiptFor(FIRST)] }),
      ),
    ).toEqual([{ citekey: 'alpha2020-one', preview: FIRST, reason: 'duplicate' }])
  })

  it('reports every reason in file order', () => {
    expect(
      staleReceipts(
        LEDGER,
        fileOf({
          'alpha2020-one': [receiptFor(FIRST), receiptFor(FIRST), receiptFor('an edited quote')],
          'nobody2000-none': [receiptFor(SECOND)],
        }),
      ).map((stale) => [stale.citekey, stale.reason]),
    ).toEqual([
      ['alpha2020-one', 'duplicate'],
      ['alpha2020-one', 'quote-not-in-ledger'],
      ['nobody2000-none', 'unknown-citekey'],
    ])
  })

  it('keys each entry by its own quotes', () => {
    const keys = ledgerQuoteKeys(LEDGER)
    expect([...(keys.get('alpha2020-one') ?? [])].sort()).toEqual(
      [quoteKey(FIRST), quoteKey(SECOND)].sort(),
    )
    expect(keys.get('beta2021-two')?.size).toBe(0)
    expect(keys.get('gamma2022-three')?.size).toBe(0)
    expect(keys.has('nobody2000-none')).toBe(false)
  })
})
