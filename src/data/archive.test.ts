import { describe, expect, it } from 'bun:test'
import {
  archiveLinkFor,
  closestSnapshot,
  isArchivable,
  MAX_SNAPSHOT_DISTANCE_DAYS,
  snapshotDate,
  timestampFromSaveResponse,
} from './archive'

const BULLETIN = 'https://extension.example.edu/bulletin'
const HEADER = ['urlkey', 'timestamp', 'original', 'mimetype', 'statuscode', 'digest', 'length']

/** A CDX row as the API returns it with `output=json` */
const row = (timestamp: string, url = BULLETIN, status = '200'): string[] => [
  'edu,example,extension)/bulletin',
  timestamp,
  url,
  'text/html',
  status,
  'DIGESTDIGESTDIGEST',
  '9000',
]

/** `YYYYMMDD` moved by a number of days, which puts the window edges exactly where the limit says */
const shifted = (yyyymmdd: string, days: number): string => {
  const date = new Date(
    Date.UTC(
      Number(yyyymmdd.slice(0, 4)),
      Number(yyyymmdd.slice(4, 6)) - 1,
      Number(yyyymmdd.slice(6)),
    ),
  )
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10).replaceAll('-', '')
}

const READ = '20261001'

describe('archiveLinkFor', () => {
  it('puts the URL after the timestamp, unescaped', () => {
    expect(archiveLinkFor('20201111111111', 'https://example.edu/a.pdf?x=1&y=2')).toBe(
      'https://web.archive.org/web/20201111111111/https://example.edu/a.pdf?x=1&y=2',
    )
  })

  it('refuses a timestamp that is not 14 digits', () => {
    for (const bad of ['', '2020', '202011111111111', '2020111111111a', '2020-11-11']) {
      expect(() => archiveLinkFor(bad, BULLETIN), bad).toThrow(RangeError)
    }
  })
})

describe('closestSnapshot', () => {
  it('takes the capture nearest the read date', () => {
    const rows = [HEADER, row('20260101000000'), row('20261003120000'), row('20261120000000')]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20261003120000')
  })

  it('prefers a capture after the read date over a nearer one before it', () => {
    const rows = [HEADER, row('20260930235959'), row('20261010000000')]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20261010000000')
  })

  it('counts a capture on the read date as on or after it', () => {
    const rows = [HEADER, row('20260930235959'), row('20261001060000'), row('20261001180000')]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20261001060000')
  })

  it('takes the latest capture before the read date when none follows it', () => {
    const rows = [HEADER, row('20260101000000'), row('20260801000000'), row('20260301000000')]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20260801000000')
  })

  it('takes the capture before the read date when the only later one is out of range', () => {
    const rows = [HEADER, row('20260915000000'), row(`${shifted(READ, 401)}000000`)]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20260915000000')
  })

  it('accepts a capture exactly at the limit and refuses one day past it', () => {
    expect(MAX_SNAPSHOT_DISTANCE_DAYS).toBe(400)
    for (const direction of [-1, 1]) {
      const edge = `${shifted(READ, direction * MAX_SNAPSHOT_DISTANCE_DAYS)}000000`
      const past = `${shifted(READ, direction * (MAX_SNAPSHOT_DISTANCE_DAYS + 1))}000000`
      expect(closestSnapshot([HEADER, row(edge)], READ)?.timestamp, `${direction} at`).toBe(edge)
      expect(closestSnapshot([HEADER, row(past)], READ), `${direction} past`).toBeNull()
    }
  })

  it('answers null when every capture is out of range', () => {
    const rows = [HEADER, row('20200101000000'), row('20230101000000'), row('20280101000000')]
    expect(closestSnapshot(rows, READ)).toBeNull()
  })

  it('takes the newest capture when there is no read date', () => {
    const rows = [HEADER, row('20230101000000'), row('20260401000000'), row('20190101000000')]
    expect(closestSnapshot(rows, null)?.timestamp).toBe('20260401000000')
  })

  it('treats a read date it cannot parse as no date', () => {
    const rows = [HEADER, row('20230101000000'), row('20260401000000')]
    for (const bad of ['', '2026-10-01', '20261301', '20260230']) {
      expect(closestSnapshot(rows, bad)?.timestamp, bad).toBe('20260401000000')
    }
  })

  it('skips the header row and every capture that was not a 200', () => {
    const rows = [
      HEADER,
      row('20261001000000', BULLETIN, '301'),
      row('20261002000000', BULLETIN, '404'),
      row('20261003000000', BULLETIN, '-'),
      row('20261101000000'),
    ]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20261101000000')
  })

  it('skips a row whose timestamp is not a real capture time', () => {
    const rows = [HEADER, row('2026'), row('20261301000000'), row('20260230000000'), row('')]
    expect(closestSnapshot(rows, READ)).toBeNull()
  })

  it('answers null for no rows, a header alone, or rows with nothing usable', () => {
    expect(closestSnapshot([], READ)).toBeNull()
    expect(closestSnapshot([HEADER], READ)).toBeNull()
    expect(closestSnapshot([HEADER, row('20261001000000', BULLETIN, '404')], null)).toBeNull()
    expect(closestSnapshot([['short']], null)).toBeNull()
  })

  it('works on rows with no header row', () => {
    expect(closestSnapshot([row('20261003000000')], READ)?.timestamp).toBe('20261003000000')
  })

  it('returns the URL the capture holds, which can differ from the one asked for', () => {
    const held = 'http://www.extension.example.edu/bulletin'
    expect(closestSnapshot([HEADER, row('20261003000000', held)], READ)).toEqual({
      timestamp: '20261003000000',
      url: held,
    })
  })

  it('takes the earlier of two captures on the same day', () => {
    const rows = [HEADER, row('20261005180000'), row('20261005060000')]
    expect(closestSnapshot(rows, READ)?.timestamp).toBe('20261005060000')
  })
})

describe('timestampFromSaveResponse', () => {
  const SAVE_PAGE = `https://web.archive.org/save/${BULLETIN}`
  const TAKEN = '20261017123456'

  it('reads a response that has only a Location header', () => {
    expect(timestampFromSaveResponse({ location: `/web/${TAKEN}/${BULLETIN}` }, SAVE_PAGE)).toBe(
      TAKEN,
    )
  })

  it('reads an absolute Location', () => {
    const location = `https://web.archive.org/web/${TAKEN}/${BULLETIN}`
    expect(timestampFromSaveResponse({ location }, SAVE_PAGE)).toBe(TAKEN)
  })

  it('reads Content-Location when there is no Location', () => {
    const contentLocation = `/web/${TAKEN}/${BULLETIN}`
    expect(timestampFromSaveResponse({ contentLocation }, SAVE_PAGE)).toBe(TAKEN)
  })

  it('reads the final URL when neither header is present', () => {
    expect(timestampFromSaveResponse({}, `https://web.archive.org/web/${TAKEN}/${BULLETIN}`)).toBe(
      TAKEN,
    )
  })

  it('prefers Location, then Content-Location, then the final URL', () => {
    const at = (stamp: string): string => `/web/${stamp}/${BULLETIN}`
    const final = `https://web.archive.org${at('20260303030303')}`
    expect(
      timestampFromSaveResponse(
        { location: at('20260101010101'), contentLocation: at('20260202020202') },
        final,
      ),
    ).toBe('20260101010101')
    expect(timestampFromSaveResponse({ contentLocation: at('20260202020202') }, final)).toBe(
      '20260202020202',
    )
    expect(timestampFromSaveResponse({}, final)).toBe('20260303030303')
  })

  it('moves on from a header that carries no timestamp', () => {
    const headers = { location: `/save/${BULLETIN}`, contentLocation: `/web/${TAKEN}/${BULLETIN}` }
    expect(timestampFromSaveResponse(headers, SAVE_PAGE)).toBe(TAKEN)
  })

  it('reads a timestamp followed by a replay mode', () => {
    expect(timestampFromSaveResponse({ location: `/web/${TAKEN}id_/${BULLETIN}` }, SAVE_PAGE)).toBe(
      TAKEN,
    )
  })

  it('answers null when nothing carries a timestamp', () => {
    expect(timestampFromSaveResponse({}, SAVE_PAGE)).toBeNull()
    expect(timestampFromSaveResponse({ location: '', contentLocation: '' }, '')).toBeNull()
  })

  it('does not take a timestamp-shaped segment from the page that was being saved', () => {
    const odd = 'https://extension.example.edu/web/20200101000000/page'
    expect(timestampFromSaveResponse({}, `https://web.archive.org/save/${odd}`)).toBeNull()
  })
})

describe('isArchivable', () => {
  it('is true for a URL source with nothing recorded yet', () => {
    expect(isArchivable({ URL: BULLETIN })).toBe(true)
    expect(isArchivable({ URL: BULLETIN, custom: {} })).toBe(true)
    expect(
      isArchivable({ URL: 'https://doi.org/10.1000/182', custom: { archived: undefined } }),
    ).toBe(true)
  })

  it('is false for a source with no URL', () => {
    expect(isArchivable({})).toBe(false)
    expect(isArchivable({ URL: '' })).toBe(false)
  })

  it('is false for a URL that is already on web.archive.org', () => {
    const capture = 'https://web.archive.org/web/20220121170740/https://www.gob.mx/Epazote_.pdf'
    expect(isArchivable({ URL: capture })).toBe(false)
    expect(isArchivable({ URL: capture.replace('https', 'http') })).toBe(false)
    expect(isArchivable({ URL: 'https://WEB.ARCHIVE.ORG/web/2022/https://example.edu/' })).toBe(
      false,
    )
  })

  it('is true for other archive.org pages, which are not captures of the source', () => {
    expect(isArchivable({ URL: 'https://archive.org/details/vanillaculture00chil' })).toBe(true)
    expect(isArchivable({ URL: 'https://web.archive.org.example.edu/page' })).toBe(true)
  })

  it('is false once custom.archived is recorded', () => {
    const archived = `https://web.archive.org/web/20261001000000/${BULLETIN}`
    expect(isArchivable({ URL: BULLETIN, custom: { archived } })).toBe(false)
  })
})

describe('snapshotDate', () => {
  const parts = (...date: number[]) => ({ 'date-parts': [date] })

  it('writes year, month and day as YYYYMMDD', () => {
    expect(snapshotDate(parts(2026, 10, 1))).toBe('20261001')
    expect(snapshotDate(parts(2026, 7, 30))).toBe('20260730')
    expect(snapshotDate(parts(2026, 12, 31))).toBe('20261231')
  })

  it('reads a missing month or day as 01', () => {
    expect(snapshotDate(parts(2026, 7))).toBe('20260701')
    expect(snapshotDate(parts(2026))).toBe('20260101')
  })

  it('answers null when there is no date', () => {
    expect(snapshotDate(undefined)).toBeNull()
    expect(snapshotDate(null)).toBeNull()
    expect(snapshotDate({})).toBeNull()
    expect(snapshotDate({ 'date-parts': [] })).toBeNull()
    expect(snapshotDate({ 'date-parts': [[]] })).toBeNull()
  })

  it('answers null for parts that are not a real day', () => {
    expect(snapshotDate(parts(2026, 13, 1))).toBeNull()
    expect(snapshotDate(parts(2026, 0, 1))).toBeNull()
    expect(snapshotDate(parts(2026, 2, 30))).toBeNull()
    expect(snapshotDate(parts(2026, 4, 31))).toBeNull()
    expect(snapshotDate(parts(2026.5, 1, 1))).toBeNull()
  })

  it('feeds the capture choice', () => {
    const rows = [HEADER, row('20260930000000'), row('20261004000000')]
    expect(closestSnapshot(rows, snapshotDate(parts(2026, 10, 1)))?.timestamp).toBe(
      '20261004000000',
    )
  })
})
