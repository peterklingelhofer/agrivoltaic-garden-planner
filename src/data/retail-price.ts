import { citedDerived, citedVerbatim } from '../types/cited'
import type { DerivedCited } from '../types/cited'
import type { RetailPrice } from '../types/economy'
import { DEFAULT_FETCH_OPTIONS, fetchJson } from './http'
import { WGSRPD_ATTRIBUTION } from './static-layers'

/**
 * `RetailPrice` is declared in `src/types/economy.ts`, because a season report carries the price
 * it was valued at and `src/types` is the only layer a report may name. Re-exported here so the
 * fetch and its shape are found together
 */
export type { RetailPrice }

export const EIA_ATTRIBUTION =
  'U.S. Energy Information Administration, Electric Power Monthly Table 5.6.A, Form EIA-861M'

/** The half of the caveat that holds for any retail price, a typed tariff included */
export const EXPORT_CAVEAT =
  'A retail price is what a kilowatt-hour costs to buy. An exported kilowatt-hour earns less under net metering caps, time-of-use rates and export tariffs. None of those three is modelled in this app, so a year’s electricity value assumes every kilowatt-hour generated displaces one that would have been bought'

export const RETAIL_PRICE_CAVEAT = `${EXPORT_CAVEAT}. The figure is a state-wide, year-long average, and no household is billed at exactly that rate`

/**
 * The site’s botanical region to the state EIA prices, and the two places that is not one to one.
 *
 * `botanicalArea` is a TDWG level 3 code sampled from the shipped WGSRPD grid, which is the only
 * region this app knows a site by; EIA keys its series by USPS state code. Every entry below was
 * checked line by line against the WGSRPD edition 2 level 3 table (`tblLevel3.txt` in the
 * tdwg/wgsrpd repository), which is where the codes and their area names come from.
 *
 * Four entries are worth naming because they are not simply "the state of the same name":
 * `ASK` and `ALU` are Alaska and the Aleutian Is., two botanical regions inside one state;
 * `WDC` is the District of Columbia, which EIA prices as `DC` alongside the fifty states; and
 * `HAW` is the whole Hawaiian chain, whose level 4 rows are Hawaiian Is. (US-HI) plus Johnston
 * and Midway, so mapping it to `HI` prices the inhabited part and quietly ignores two
 * uninhabited outlying islands. Every code outside this table, US territories included,
 * resolves to null: no price is better than a neighbouring state’s
 */
export const TDWG_LEVEL3_TO_USPS: DerivedCited<Readonly<Record<string, string>>> = citedDerived(
  {
    ALA: 'AL',
    ALU: 'AK',
    ARI: 'AZ',
    ARK: 'AR',
    ASK: 'AK',
    CAL: 'CA',
    CNT: 'CT',
    COL: 'CO',
    DEL: 'DE',
    FLA: 'FL',
    GEO: 'GA',
    HAW: 'HI',
    IDA: 'ID',
    ILL: 'IL',
    INI: 'IN',
    IOW: 'IA',
    KAN: 'KS',
    KTY: 'KY',
    LOU: 'LA',
    MAI: 'ME',
    MAS: 'MA',
    MIC: 'MI',
    MIN: 'MN',
    MNT: 'MT',
    MRY: 'MD',
    MSI: 'MS',
    MSO: 'MO',
    NCA: 'NC',
    NDA: 'ND',
    NEB: 'NE',
    NEV: 'NV',
    NWH: 'NH',
    NWJ: 'NJ',
    NWM: 'NM',
    NWY: 'NY',
    OHI: 'OH',
    OKL: 'OK',
    ORE: 'OR',
    PEN: 'PA',
    RHO: 'RI',
    SCA: 'SC',
    SDA: 'SD',
    TEN: 'TN',
    TEX: 'TX',
    UTA: 'UT',
    VER: 'VT',
    VRG: 'VA',
    WAS: 'WA',
    WDC: 'DC',
    WIS: 'WI',
    WVA: 'WV',
    WYO: 'WY',
  },
  'B',
  ['govaerts2021-wcvp'],
  `Each TDWG level 3 area name in ${WGSRPD_ATTRIBUTION} was read off the published level 3 table and paired with the USPS code of the state it names; the codes themselves are published nowhere in that table`,
  'A geographical crosswalk between two code systems. It covers the fifty states and the District of Columbia only, and it says nothing about whether a botanical region and a state share a boundary: ASK and ALU are two regions of one state, and HAW is a chain whose outlying islands lie outside Hawaii',
)

/** null for everywhere the crosswalk does not reach, which is every country except the US */
export const usStateOf = (botanicalArea: string | null): string | null =>
  botanicalArea === null ? null : (TDWG_LEVEL3_TO_USPS.value[botanicalArea] ?? null)

/**
 * Wide on purpose, like `implausibleWeather`: these catch a wrong unit, not an expensive state.
 *
 * The floor is below any US state average ever published and the ceiling is well above Hawaii,
 * the dearest, which was 52.72 cents in the June 2026 table. A dollars-per-kWh figure read as
 * cents lands at 0.3 and a cents figure read as dollars lands at 3,000; both are caught here
 */
export const MIN_PLAUSIBLE_CENTS_PER_KWH = 3
export const MAX_PLAUSIBLE_CENTS_PER_KWH = 70

export const implausiblePrice = (centsPerKwh: number): string | null =>
  centsPerKwh >= MIN_PLAUSIBLE_CENTS_PER_KWH && centsPerKwh <= MAX_PLAUSIBLE_CENTS_PER_KWH
    ? null
    : `${EIA_ATTRIBUTION}: ${centsPerKwh.toFixed(2)} cents per kWh, which no US state pays`

const CENTS_PER_DOLLAR = 100

export interface RetailPriceDeps {
  readonly signal: AbortSignal | null
}

interface EiaRow {
  readonly period?: unknown
  readonly price?: unknown
}

interface EiaBody {
  readonly response?: { readonly data?: readonly EiaRow[] }
}

/** EIA sends numbers as strings, and a null price is a real answer for a state-year with no data */
const numberOf = (raw: unknown): number | null => {
  if (typeof raw !== 'number' && (typeof raw !== 'string' || raw.trim().length === 0)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * The newest annual row that actually carries a price.
 *
 * `sort` is asked for in the request, but the newest row is picked here rather than taken on
 * trust: a sort the upstream silently ignored would otherwise hand back a price from 2001 with
 * this year’s label on it, and the year is shown to the grower
 */
const newestPriced = (
  rows: readonly EiaRow[],
): { readonly year: number; readonly cents: number } | null => {
  let best: { year: number; cents: number } | null = null
  for (const row of rows) {
    const year = numberOf(row.period)
    const cents = numberOf(row.price)
    if (year === null || cents === null || !Number.isInteger(year)) continue
    if (best === null || year > best.year) best = { year, cents }
  }
  return best
}

/**
 * The residential retail price for one state, or null.
 *
 * Null is a supported answer everywhere, and it is what a garden outside the United States gets:
 * there is no free per-country series with this coverage (`the economy document` 2c), so
 * the honest answer off the US grid is no price rather than a borrowed one. Nothing here throws.
 * The API key is added by the Worker at the edge and never exists in this bundle
 */
export const fetchRetailPrice = async (
  stateCode: string,
  deps: RetailPriceDeps,
): Promise<RetailPrice | null> => {
  try {
    const body = await fetchJson<EiaBody>(
      'eia',
      '/v2/electricity/retail-sales/data/',
      new URLSearchParams({
        frequency: 'annual',
        'data[0]': 'price',
        'facets[stateid][]': stateCode,
        'facets[sectorid][]': 'RES',
        'sort[0][column]': 'period',
        'sort[0][direction]': 'desc',
        length: '1',
      }),
      // asked once: an optional figure is not worth riding out a fault for, and a browser logs
      // every failed request, so without the key a US site would show three lines for one
      // figure the panel already says it lacks
      { ...DEFAULT_FETCH_OPTIONS, retries: 0, signal: deps.signal },
    )
    const newest = newestPriced(body.response?.data ?? [])
    if (newest === null) return null
    if (implausiblePrice(newest.cents) !== null) return null
    return {
      usdPerKwh: citedVerbatim(
        newest.cents / CENTS_PER_DOLLAR,
        'B',
        ['eia-electric-power-monthly-5-6-a'],
        RETAIL_PRICE_CAVEAT,
      ),
      stateCode,
      year: newest.year,
      sourceLabel: EIA_ATTRIBUTION,
    }
  } catch {
    // a missing price is a state the economy block simply does not render, so an upstream that
    // is down, unconfigured or refusing degrades to the same answer as a garden outside the US
    return null
  }
}
