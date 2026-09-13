import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { vi } from '../../test/vi'

const fetchJson = vi.fn()

/* captured before the mock is installed, so the spread carries the real module */
const actualHttp = await import('./http')
mock.module('./http', () => ({ ...actualHttp, fetchJson }))

const {
  fetchRetailPrice,
  implausiblePrice,
  MAX_PLAUSIBLE_CENTS_PER_KWH,
  MIN_PLAUSIBLE_CENTS_PER_KWH,
  TDWG_LEVEL3_TO_USPS,
  usStateOf,
} = await import('./retail-price')

/** the shape api.eia.gov actually answered with on 2026-09-04, prices included */
const body = (rows: readonly { period: string; price: string | null }[]): unknown => ({
  response: {
    total: String(rows.length),
    dateFormat: 'YYYY',
    frequency: 'annual',
    data: rows.map((row) => ({
      period: row.period,
      stateid: 'MA',
      stateDescription: 'Massachusetts',
      sectorid: 'RES',
      sectorName: 'residential',
      price: row.price,
      'price-units': 'cents per kilowatt-hour',
    })),
  },
})

describe('usStateOf', () => {
  it('maps the TDWG level 3 codes onto the states EIA prices', () => {
    expect(usStateOf('MAS')).toBe('MA')
    expect(usStateOf('ARI')).toBe('AZ')
    // the District of Columbia is a botanical region of its own and a priced sector of its own
    expect(usStateOf('WDC')).toBe('DC')
    // two botanical regions, one state: the Aleutians are priced as Alaska because Alaska is
    // the only thing EIA prices them as
    expect(usStateOf('ASK')).toBe('AK')
    expect(usStateOf('ALU')).toBe('AK')
    expect(usStateOf('HAW')).toBe('HI')
    // the pair a transcription slip would swap
    expect(usStateOf('MSI')).toBe('MS')
    expect(usStateOf('MSO')).toBe('MO')
  })

  it('is null off the map rather than guessing at a neighbour', () => {
    expect(usStateOf('NOR')).toBeNull()
    expect(usStateOf('PUE')).toBeNull()
    expect(usStateOf(null)).toBeNull()
    expect(usStateOf('')).toBeNull()
    expect(usStateOf('mas')).toBeNull()
  })

  it('covers the fifty states and the District of Columbia, and nothing else', () => {
    const codes = new Set(Object.values(TDWG_LEVEL3_TO_USPS.value))
    expect(codes.size).toBe(51)
    expect(Object.keys(TDWG_LEVEL3_TO_USPS.value)).toHaveLength(52)
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/)
  })

  it('cites the geographical scheme the region code came from', () => {
    expect(TDWG_LEVEL3_TO_USPS.provenance).toBe('derived')
    expect(TDWG_LEVEL3_TO_USPS.citations).toEqual(['govaerts2021-wcvp'])
    expect(TDWG_LEVEL3_TO_USPS.derivation).toContain('TDWG')
  })
})

describe('implausiblePrice', () => {
  it('passes what a US state actually pays', () => {
    for (const cents of [MIN_PLAUSIBLE_CENTS_PER_KWH, 15.32, 30.48, 52.72]) {
      expect(implausiblePrice(cents)).toBeNull()
    }
    expect(implausiblePrice(MAX_PLAUSIBLE_CENTS_PER_KWH)).toBeNull()
  })

  it('names a wrong unit rather than passing it on', () => {
    // dollars read as cents, and cents read as dollars: the two failures this gate is for
    expect(implausiblePrice(0.3048)).toContain('cents per kWh')
    expect(implausiblePrice(3048)).toContain('no US state pays')
    expect(implausiblePrice(-1)).not.toBeNull()
  })
})

describe('fetchRetailPrice', () => {
  beforeEach(() => {
    fetchJson.mockReset()
  })

  it('reads the newest annual price and converts cents to dollars', async () => {
    fetchJson.mockResolvedValue(
      body([
        { period: '2024', price: '29.35' },
        { period: '2025', price: '30.48' },
      ]),
    )
    const price = await fetchRetailPrice('MA', { signal: null })
    expect(price?.usdPerKwh.value).toBeCloseTo(0.3048, 10)
    expect(price?.year).toBe(2025)
    expect(price?.stateCode).toBe('MA')
    expect(price?.usdPerKwh.citations).toEqual(['eia-electric-power-monthly-5-6-a'])
    expect(price?.usdPerKwh.caveat).toContain('An exported kilowatt-hour earns less')
  })

  it('asks the proxy for the annual residential series and never sends a key', async () => {
    fetchJson.mockResolvedValue(body([{ period: '2025', price: '30.48' }]))
    await fetchRetailPrice('MA', { signal: null })
    const [upstream, path, params] = fetchJson.mock.calls[0] as [string, string, URLSearchParams]
    expect(upstream).toBe('eia')
    expect(path).toBe('/v2/electricity/retail-sales/data/')
    expect(params.get('facets[stateid][]')).toBe('MA')
    expect(params.get('facets[sectorid][]')).toBe('RES')
    expect(params.get('data[0]')).toBe('price')
    expect(params.get('frequency')).toBe('annual')
    expect([...params.keys()].some((name) => /api[-_]?key/i.test(name))).toBe(false)
  })

  it('is null on an implausible price rather than pricing a garden off a wrong unit', async () => {
    fetchJson.mockResolvedValue(body([{ period: '2025', price: '0.3048' }]))
    await expect(fetchRetailPrice('MA', { signal: null })).resolves.toBeNull()
  })

  it('is null on a malformed, empty or price-less answer', async () => {
    for (const answer of [
      {},
      { response: {} },
      { response: { data: [] } },
      body([{ period: '2025', price: null }]),
      { response: { data: [{ period: 'not-a-year', price: '30.48' }] } },
    ]) {
      fetchJson.mockResolvedValue(answer)
      await expect(fetchRetailPrice('MA', { signal: null })).resolves.toBeNull()
    }
  })

  /**
   * The upstream needs a secret this deployment may not have, and a garden with no price is a
   * supported state everywhere. Nothing here may reach the caller as a throw
   */
  it('is null when the upstream fails, and never throws', async () => {
    fetchJson.mockRejectedValue(new Error('eia is not configured: EIA_API_KEY secret is unset'))
    await expect(fetchRetailPrice('MA', { signal: null })).resolves.toBeNull()
  })
})
