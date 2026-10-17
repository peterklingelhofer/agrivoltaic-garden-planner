import { describe, expect, it } from 'bun:test'
import {
  agreement,
  driftBetween,
  ledgerFields,
  normalizeTitle,
  recordFromCrossref,
  recordFromDatacite,
  type CrossrefMessage,
  type DataciteAttributes,
  type LedgerEntry,
  type RegistryRecord,
  type RegistrySnapshot,
} from './registry'

// a paper as Crossref returns it: the title in capitals, the online date a year before the issue's
// and an ampersand sent as a character reference
const CROSSREF_SHADE: CrossrefMessage = {
  title: ['SHADE EFFECTS ON LETTUCE YIELD UNDER AGRIVOLTAIC PANELS'],
  author: [{ family: 'Smith' }, { family: 'Okafor' }],
  issued: { 'date-parts': [[2021, 3, 4]] },
  'published-print': { 'date-parts': [[2021, 3]] },
  'published-online': { 'date-parts': [[2020, 12]] },
  'container-title': ['Agriculture, Ecosystems &amp; Environment'],
  volume: '310',
  issue: '2',
  page: '107-118',
}

// the same paper as the ledger holds it
const LEDGER_SHADE: LedgerEntry = {
  title: 'Shade effects on lettuce yield under agrivoltaic panels',
  author: [
    { family: 'Smith', given: 'Jane' },
    { family: 'Okafor', given: 'Ada' },
  ],
  issued: { 'date-parts': [[2020]] },
  'container-title': 'Agriculture, Ecosystems & Environment',
  volume: '310',
  issue: '2',
  page: '107-118',
}

// a Zenodo-style dataset: no container, and a second creator that is an organization
const DATACITE_DATASET: DataciteAttributes = {
  titles: [{ title: 'Lettuce shade response, field data 2019 to 2021' }],
  creators: [{ familyName: 'Laub' }, { name: 'Example Research Institute' }],
  publicationYear: 2021,
}

const EMPTY_RECORD: RegistryRecord = {
  title: '',
  year: null,
  years: [],
  containerTitle: null,
  volume: null,
  issue: null,
  page: null,
  authors: [],
}

// the ledger's record for the paper above, with one field replaced
const shade = (change: Partial<RegistryRecord> = {}): RegistryRecord => ({
  ...ledgerFields(LEDGER_SHADE),
  ...change,
})

// the two year fields of a record whose source offers these years, earliest first
const inYears = (...years: number[]): Pick<RegistryRecord, 'year' | 'years'> => ({
  year: years[0] ?? null,
  years,
})

describe('normalizeTitle', () => {
  it('folds case, punctuation, compatibility forms and spacing', () => {
    expect(normalizeTitle('  The Café\u2019s CO₂ & H₂O:  A "Study"?  ')).toBe(
      'the café s co2 h2o a study',
    )
    expect(normalizeTitle('\ufb01eld trial')).toBe('field trial')
    expect(normalizeTitle('Version 2.0 (2021)')).toBe('version 2 0 2021')
  })

  it('returns an empty string when no letter or digit is left', () => {
    expect(normalizeTitle(' -- ? ')).toBe('')
  })
})

describe('recordFromCrossref', () => {
  it('reads a message, keeping the title as the registry sent it', () => {
    expect(recordFromCrossref(CROSSREF_SHADE)).toEqual({
      title: 'SHADE EFFECTS ON LETTUCE YIELD UNDER AGRIVOLTAIC PANELS',
      year: 2020,
      years: [2020, 2021],
      containerTitle: 'Agriculture, Ecosystems & Environment',
      volume: '310',
      issue: '2',
      page: '107-118',
      authors: ['Smith', 'Okafor'],
    })
  })

  it('offers each year among issued, print and online once, and takes the earliest', () => {
    const dated = (issued: number, print?: number, online?: number): CrossrefMessage => ({
      issued: { 'date-parts': [[issued]] },
      ...(print === undefined ? {} : { 'published-print': { 'date-parts': [[print]] } }),
      ...(online === undefined ? {} : { 'published-online': { 'date-parts': [[online]] } }),
    })
    expect(recordFromCrossref(dated(2019))).toMatchObject({ year: 2019, years: [2019] })
    expect(recordFromCrossref(dated(2021, 2021, 2020))).toMatchObject({
      year: 2020,
      years: [2020, 2021],
    })
    expect(recordFromCrossref(dated(2019, 2018, 2020))).toMatchObject({
      year: 2018,
      years: [2018, 2019, 2020],
    })
  })

  it('reads a date with no year as no date', () => {
    const blank = { year: null, years: [] }
    expect(recordFromCrossref({ issued: { 'date-parts': [[null]] } })).toMatchObject(blank)
    expect(recordFromCrossref({})).toMatchObject(blank)
  })

  it('removes the markup and character references a registry leaves in text', () => {
    const message: CrossrefMessage = {
      title: ['Growth of <i>Lactuca sativa</i> in CO<sub>2</sub>-enriched air &amp; light'],
    }
    expect(recordFromCrossref(message).title).toBe(
      'Growth of Lactuca sativa in CO2-enriched air & light',
    )
  })

  it('names an organization by its name when it has no family name', () => {
    const message: CrossrefMessage = {
      author: [{ name: 'World Meteorological Organization' }, { family: 'Smith' }],
    }
    expect(recordFromCrossref(message).authors).toEqual([
      'World Meteorological Organization',
      'Smith',
    ])
  })

  it('answers a bare message with an empty title and nulls', () => {
    expect(recordFromCrossref({})).toEqual(EMPTY_RECORD)
  })
})

describe('recordFromDatacite', () => {
  it('reads a dataset, which has no container', () => {
    expect(recordFromDatacite(DATACITE_DATASET)).toEqual({
      title: 'Lettuce shade response, field data 2019 to 2021',
      year: 2021,
      years: [2021],
      containerTitle: null,
      volume: null,
      issue: null,
      page: null,
      authors: ['Laub', 'Example Research Institute'],
    })
  })

  it('reads the container, and a year sent as text', () => {
    const attributes: DataciteAttributes = {
      titles: [{ title: 'Annual report' }],
      publicationYear: '2019',
      container: { title: 'Report series', volume: '4', issue: '1', firstPage: '12' },
    }
    expect(recordFromDatacite(attributes)).toEqual({
      ...EMPTY_RECORD,
      title: 'Annual report',
      year: 2019,
      years: [2019],
      containerTitle: 'Report series',
      volume: '4',
      issue: '1',
      page: '12',
    })
  })

  it('answers bare attributes with an empty title and nulls', () => {
    expect(recordFromDatacite({})).toEqual(EMPTY_RECORD)
    expect(recordFromDatacite({ publicationYear: null })).toMatchObject({ year: null, years: [] })
  })
})

describe('ledgerFields', () => {
  it('reads an article entry, with the first page of its range', () => {
    expect(ledgerFields(LEDGER_SHADE)).toEqual({
      title: 'Shade effects on lettuce yield under agrivoltaic panels',
      year: 2020,
      years: [2020],
      containerTitle: 'Agriculture, Ecosystems & Environment',
      volume: '310',
      issue: '2',
      page: '107',
      authors: ['Smith', 'Okafor'],
    })
  })

  it('keeps the first page as written, whichever dash the range uses', () => {
    const pageOf = (page: string): string | null => ledgerFields({ title: 'T', page }).page
    expect(pageOf('165-174')).toBe('165')
    expect(pageOf('165\u2013174')).toBe('165')
    expect(pageOf('e88695')).toBe('e88695')
    expect(pageOf(' 033701 ')).toBe('033701')
  })

  it('leaves out literal names, which have no family name', () => {
    const sole: LedgerEntry = { title: 'T', author: [{ literal: 'National Research Council' }] }
    expect(ledgerFields(sole).authors).toEqual([])
    const mixed: LedgerEntry = {
      title: 'T',
      author: [{ literal: 'FAO' }, { family: 'Allen', given: 'R. G.' }],
    }
    expect(ledgerFields(mixed).authors).toEqual(['Allen'])
  })

  it('reads missing fields as null', () => {
    expect(ledgerFields({ title: 'Bare' })).toEqual({ ...EMPTY_RECORD, title: 'Bare' })
  })
})

describe('agreement', () => {
  it('agrees on every field when the ledger matches a registry whose title is in capitals', () => {
    expect(agreement(ledgerFields(LEDGER_SHADE), recordFromCrossref(CROSSREF_SHADE))).toEqual({
      title: true,
      year: true,
      containerTitle: true,
      volume: true,
      page: true,
      authors: true,
    })
  })

  it('agrees on a DataCite dataset that has no container, volume or page', () => {
    const ledger = ledgerFields({
      title: 'Lettuce shade response, field data 2019 to 2021',
      author: [{ family: 'Laub', given: 'Moritz' }],
      issued: { 'date-parts': [[2021]] },
    })
    expect(Object.values(agreement(ledger, recordFromDatacite(DATACITE_DATASET)))).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
    ])
  })

  describe('title', () => {
    it('agrees when only one side carries a subtitle', () => {
      const bare = shade({ title: 'Shade tolerance of kale' })
      const subtitled = shade({ title: 'Shade tolerance of kale: a field trial in New Jersey' })
      expect(agreement(bare, subtitled).title).toBe(true)
      expect(agreement(subtitled, bare).title).toBe(true)
    })

    it('disagrees on a mistyped word, including one cut short', () => {
      const registry = shade({ title: 'Shade tolerance of kale: a field trial' })
      expect(agreement(shade({ title: 'Shade tolerence of kale' }), registry).title).toBe(false)
      expect(agreement(shade({ title: 'Shade tolerance of kal' }), registry).title).toBe(false)
    })

    it('never agrees with a blank title', () => {
      expect(agreement(shade(), shade({ title: '' })).title).toBe(false)
      expect(agreement(shade({ title: '?' }), shade({ title: '?' })).title).toBe(false)
    })
  })

  describe('year', () => {
    // issued and printed in 2021, online in 2020
    const registry = recordFromCrossref(CROSSREF_SHADE)

    it('agrees when the ledger year is any year the registry offers', () => {
      expect(agreement(shade(inYears(2020)), registry).year).toBe(true)
      expect(agreement(shade(inYears(2021)), registry).year).toBe(true)
    })

    it('disagrees when the ledger year is none of them, a year between two included', () => {
      expect(agreement(shade(inYears(2019)), registry).year).toBe(false)
      expect(agreement(shade(inYears(2022)), registry).year).toBe(false)
      expect(agreement(shade(inYears(2020)), shade(inYears(2019, 2021))).year).toBe(false)
    })

    it('agrees on no year only with a registry that offers none', () => {
      expect(agreement(shade(inYears()), shade(inYears())).year).toBe(true)
      expect(agreement(shade(inYears()), shade(inYears(2020))).year).toBe(false)
      expect(agreement(shade(inYears(2020)), shade(inYears())).year).toBe(false)
    })
  })

  describe('containerTitle', () => {
    it('agrees when the ledger has none', () => {
      expect(agreement(shade({ containerTitle: null }), shade()).containerTitle).toBe(true)
      expect(
        agreement(shade({ containerTitle: null }), shade({ containerTitle: null })).containerTitle,
      ).toBe(true)
    })

    it('agrees when the normalized titles contain one another', () => {
      const long = shade({ containerTitle: 'Soil Research and Tillage' })
      const short = shade({ containerTitle: 'Soil research' })
      expect(agreement(short, long).containerTitle).toBe(true)
      expect(agreement(long, short).containerTitle).toBe(true)
    })

    it('disagrees on a different journal, or on a registry with none', () => {
      const ledger = shade({ containerTitle: 'Soil Research' })
      expect(agreement(ledger, shade({ containerTitle: 'Plant Science' })).containerTitle).toBe(
        false,
      )
      expect(agreement(ledger, shade({ containerTitle: null })).containerTitle).toBe(false)
    })
  })

  describe('volume', () => {
    it('agrees when the ledger has none or the trimmed strings are equal', () => {
      expect(agreement(shade({ volume: null }), shade({ volume: '12' })).volume).toBe(true)
      expect(agreement(shade({ volume: ' 310 ' }), shade({ volume: '310' })).volume).toBe(true)
    })

    it('disagrees on another volume, or on a registry with none', () => {
      expect(agreement(shade({ volume: '310' }), shade({ volume: '311' })).volume).toBe(false)
      expect(agreement(shade({ volume: '310' }), shade({ volume: null })).volume).toBe(false)
    })
  })

  describe('page', () => {
    it('agrees when the ledger has none', () => {
      expect(agreement(shade({ page: null }), shade({ page: '9-12' })).page).toBe(true)
    })

    it('compares the part before a hyphen or an en dash', () => {
      expect(agreement(shade({ page: '107' }), shade({ page: '107-118' })).page).toBe(true)
      expect(agreement(shade({ page: '107' }), shade({ page: '107\u2013118' })).page).toBe(true)
      expect(agreement(shade({ page: '107-118' }), shade({ page: '107' })).page).toBe(true)
    })

    it('disagrees on another first page, an article number, or a registry with none', () => {
      expect(agreement(shade({ page: '107' }), shade({ page: '108-118' })).page).toBe(false)
      expect(agreement(shade({ page: 'e88695' }), shade({ page: 'e88696' })).page).toBe(false)
      expect(agreement(shade({ page: '107' }), shade({ page: null })).page).toBe(false)
    })
  })

  describe('authors', () => {
    it('agrees when the ledger has none, or only literal names', () => {
      expect(agreement(shade({ authors: [] }), shade({ authors: ['Smith'] })).authors).toBe(true)
      const literal = ledgerFields({
        title: 'T',
        author: [{ literal: 'National Research Council' }],
      })
      expect(agreement(literal, shade({ authors: ['Someone', 'Else'] })).authors).toBe(true)
    })

    it('agrees when the first family name is among the registry names, in any case or place', () => {
      expect(
        agreement(shade({ authors: ['SMITH'] }), shade({ authors: ['Okafor', 'smith'] })).authors,
      ).toBe(true)
    })

    it('agrees across the shapes of an apostrophe', () => {
      expect(
        agreement(shade({ authors: ["O'Brien"] }), shade({ authors: ['O\u2019Brien'] })).authors,
      ).toBe(true)
    })

    it('disagrees when the first family name is not among them, or the registry has none', () => {
      expect(agreement(shade({ authors: ['Smith'] }), shade({ authors: ['Okafor'] })).authors).toBe(
        false,
      )
      expect(agreement(shade({ authors: ['Smith'] }), shade({ authors: [] })).authors).toBe(false)
    })
  })
})

describe('driftBetween', () => {
  it('lists nothing for an entry that has not moved', () => {
    expect(driftBetween(shade(), shade())).toEqual([])
  })

  it('names the one field a title typo changed', () => {
    const typo = shade({ title: 'Shade effects on lettuce yeild under agrivoltaic panels' })
    expect(driftBetween(typo, shade())).toEqual(['title'])
  })

  it('lists several fields in the order the record declares them', () => {
    expect(driftBetween(shade({ page: '1', year: 2019, title: 'Other' }), shade())).toEqual([
      'title',
      'year',
      'page',
    ])
  })

  it('sees a change in the author list, a reorder included', () => {
    expect(driftBetween(shade({ authors: ['Okafor', 'Smith'] }), shade())).toEqual(['authors'])
    expect(driftBetween(shade({ authors: ['Smith'] }), shade())).toEqual(['authors'])
  })

  it('reads a field filled in since the check as a change', () => {
    expect(driftBetween(shade({ volume: '311' }), shade({ volume: null }))).toEqual(['volume'])
  })

  it('lists year once though the record restates it in years', () => {
    expect(driftBetween(shade(inYears(2019)), shade())).toEqual(['year'])
  })

  it('watches every field of the record, one at a time', () => {
    const changes: Partial<RegistryRecord>[] = [
      { title: 'Other' },
      { year: 2000 },
      { containerTitle: 'Other' },
      { volume: '1' },
      { issue: '9' },
      { page: '1' },
      { authors: ['Other'] },
    ]
    for (const change of changes) {
      expect(driftBetween(shade(change), shade())).toEqual(Object.keys(change))
    }
  })
})

describe('the snapshot types', () => {
  it('survive a trip through JSON with no field lost', () => {
    const ledger = ledgerFields(LEDGER_SHADE)
    const record = recordFromCrossref(CROSSREF_SHADE)
    const snapshot: RegistrySnapshot = {
      format: 1,
      checked: '2026-10-19T06:17:00.000Z',
      dois: {
        'smith-2020-shade': {
          doi: '10.1000/shade',
          registry: 'crossref',
          status: 200,
          record,
          ledger,
          agrees: agreement(ledger, record),
          checked: '2026-10-19T06:17:03.000Z',
        },
        'gone-2019-lost': {
          doi: '10.1000/lost',
          registry: null,
          status: 404,
          record: null,
          ledger,
          agrees: null,
          checked: '2026-10-19T06:17:05.000Z',
        },
      },
      urls: {
        'example-guideline': {
          url: 'https://example.org/guideline',
          status: 200,
          finalUrl: 'https://example.org/guideline/',
          bodySha256: 'ab'.repeat(32),
          checked: '2026-10-19T06:17:07.000Z',
        },
      },
    }
    expect(JSON.parse(JSON.stringify(snapshot))).toStrictEqual(snapshot)
  })
})
