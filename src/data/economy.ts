import { banded, interval } from '../types/band'
import type { Banded, UncertaintyContribution } from '../types/band'
import { citedDerived, citedVerbatim } from '../types/cited'
import type { DerivedCited, VerbatimCited } from '../types/cited'
import type {
  EconomyInputs,
  PriceInUse,
  TypedCost,
  TypedPayback,
  TypedPrice,
} from '../types/economy'
import type { Fraction, KilowattHours, KilowattsDc } from '../types/units'
import type { RetailPrice } from './retail-price'

/**
 * What the one priced source actually measured, written once so every figure below carries it.
 *
 * Horowitz et al. 2020 benchmarks a 500 kWdc system as a simple average of eight US states in
 * 2020 dollars. The smallest system it models anywhere is 200 kW, and its own size curve has
 * cost per watt rising as size falls, so a garden’s few kilowatts sit below the bottom of that
 * curve in the expensive direction, by an amount the report never gives
 */
export const HOROWITZ_BENCHMARK_CAVEAT =
  'It covers installed cost only, in 2020 US dollars, with no financing, operations or revenue. It’s a 500 kW benchmark averaged over eight US states. The smallest system it models is 200 kW, and cost per watt rises as size falls. A garden is smaller than anything on the report’s size curve, so it costs more per watt by an amount the report doesn’t give. The report calls its PV + crop inputs the most uncertain it has'

/** The three PV + crops structures of Figure 3, p. 11, in the report’s own words */
export type CropMountScenario = 'vertical' | 'tracker-stilt' | 'reinforced-regular'

/**
 * Dollars per watt DC, quoted.
 *
 * Tier B is what this codebase already gives a national-lab engineering benchmark used as
 * published: `src/sim/pv/provenance.ts` carries the PVWatts default loss stack at B on exactly
 * that footing. The premium over the bare-ground baseline below is structural balance of system
 * and installation labor. Modules, inverters and soft costs barely move between the three
 */
export const CROP_MOUNT_COST_USD_PER_WDC: Readonly<
  Record<CropMountScenario, VerbatimCited<number>>
> = {
  vertical: citedVerbatim(
    1.83,
    'B',
    ['horowitz2020-dual-use-capital-costs'],
    HOROWITZ_BENCHMARK_CAVEAT,
  ),
  'tracker-stilt': citedVerbatim(
    2.09,
    'B',
    ['horowitz2020-dual-use-capital-costs'],
    HOROWITZ_BENCHMARK_CAVEAT,
  ),
  'reinforced-regular': citedVerbatim(
    2.33,
    'B',
    ['horowitz2020-dual-use-capital-costs'],
    HOROWITZ_BENCHMARK_CAVEAT,
  ),
}

/**
 * The bare-ground fixed-tilt row of the same figure, carried for reference and used by nothing.
 *
 * It's what the three above are a premium over, and it's the only way a reader can see that
 * the crop-mount band is a $0.30 to $0.80 per watt adder
 */
export const FIXED_TILT_BASELINE_USD_PER_WDC: VerbatimCited<number> = citedVerbatim(
  1.53,
  'B',
  ['horowitz2020-dual-use-capital-costs'],
  HOROWITZ_BENCHMARK_CAVEAT,
)

const WATTS_PER_KILOWATT = 1000

const CHEAPEST_USD_PER_WDC = CROP_MOUNT_COST_USD_PER_WDC.vertical.value
const DEAREST_USD_PER_WDC = CROP_MOUNT_COST_USD_PER_WDC['reinforced-regular'].value

export const BUILD_COST_CAVEAT = `${HOROWITZ_BENCHMARK_CAVEAT}. A US benchmark is applied wherever the array is, with nothing to show it holds outside the US`

/**
 * What an array like this one cost to build, as a range across all three crop-mount structures.
 *
 * A band, because `PvArray` carries the clearance height and tracker mode that
 * would pick one of the three structures, and mapping them would be a modeling choice nothing
 * here has measured. The width IS the open question, so it's shown
 */
export const buildCostUsdBand = (nameplateDcKw: KilowattsDc): DerivedCited<Banded<number>> => {
  const watts = nameplateDcKw * WATTS_PER_KILOWATT
  const low = watts * CHEAPEST_USD_PER_WDC
  const high = watts * DEAREST_USD_PER_WDC
  const contribution: UncertaintyContribution = {
    source: 'mount-structure',
    halfWidthFraction: (Math.abs(high - low) /
      2 /
      Math.max(Math.abs(high + low) / 2, 1)) as Fraction,
    note: `The three PV + crops structures are $${CHEAPEST_USD_PER_WDC.toFixed(2)}, $${CROP_MOUNT_COST_USD_PER_WDC['tracker-stilt'].value.toFixed(2)} and $${DEAREST_USD_PER_WDC.toFixed(2)} per watt DC, and nothing in this app decides which one a garden array is`,
  }
  return citedDerived(
    banded(interval(low, high), 0.8, 'range', 'mount-structure', [contribution]),
    'B',
    ['horowitz2020-dual-use-capital-costs'],
    `${nameplateDcKw.toFixed(2)} kW DC times ${String(WATTS_PER_KILOWATT)} watts per kilowatt, times $${CHEAPEST_USD_PER_WDC.toFixed(2)} and $${DEAREST_USD_PER_WDC.toFixed(2)} per watt DC for the two ends`,
    BUILD_COST_CAVEAT,
  )
}

/** Nothing typed, and the currency the two sources on file are in */
export const DEFAULT_ECONOMY_INPUTS: EconomyInputs = {
  perKwh: null,
  currency: 'USD',
  installedCost: null,
}

/** ISO 4217: three capital letters, which is all the runtime’s formatter is promised to accept */
export const CURRENCY_CODE = /^[A-Z]{3}$/

export const isCurrencyCode = (code: string): boolean => CURRENCY_CODE.test(code)

export const isTypedPrice = (price: PriceInUse): price is TypedPrice => 'sourceId' in price

export const perKwhOf = (price: PriceInUse): number =>
  isTypedPrice(price) ? price.perKwh : price.usdPerKwh.value

/** The EIA series is in US dollars. A typed tariff is in whatever the grower named */
export const currencyOf = (price: PriceInUse): string =>
  isTypedPrice(price) ? price.currency : 'USD'

/**
 * The price a season values its electricity at: the typed tariff when there's one, otherwise the
 * EIA state average, otherwise nothing. A typed zero is nothing typed, so a cleared field falls
 * back to the state average
 */
export const priceInUse = (typed: EconomyInputs, retail: RetailPrice | null): PriceInUse | null =>
  typed.perKwh !== null && typed.perKwh > 0
    ? { sourceId: 'user', perKwh: typed.perKwh, currency: typed.currency }
    : retail

/** The cost the grower typed, or null. A typed zero is nothing typed, as with the price */
export const typedCostOf = (typed: EconomyInputs): TypedCost | null =>
  typed.installedCost !== null && typed.installedCost > 0
    ? { sourceId: 'user', amount: typed.installedCost, currency: typed.currency }
    : null

/**
 * A year’s generation valued at what that electricity would have cost to buy, in the price’s
 * currency.
 *
 * A plain number, because the price it came from is what the caller already holds and the
 * caveat that matters (`RETAIL_PRICE_CAVEAT`: a kilowatt-hour bought isn't a kilowatt-hour
 * exported) belongs on the price, shown beside it
 */
export const electricityValue = (energyKwh: KilowattHours, price: PriceInUse): number =>
  energyKwh * perKwhOf(price)

/** A year that earned nothing has no payback, and dividing by it would be an infinity to special-case */
const earned = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value > 0

export const PAYBACK_CAVEAT =
  'Simple payback: no discount rate, no panel degradation and no operations cost are applied, because no cited source gives any of the three. It uses this year’s electricity price for every year. It doesn’t count the ground the array needed'

/**
 * How many years of electricity at this year’s rate the build cost is worth.
 *
 * Null when the year earned nothing: a garden with no priced region, no array or no sun has no
 * payback, and dividing by it would produce an infinity a panel would have to special-case
 * anyway. The band’s contributions ride through unchanged because dividing both ends by one
 * number leaves the fractional half-width exactly where it was
 */
export const paybackYearsBand = (
  cost: DerivedCited<Banded<number>>,
  valueUsd: number,
): DerivedCited<Banded<number>> | null => {
  if (!earned(valueUsd)) return null
  const years = interval(cost.value.interval.lower / valueUsd, cost.value.interval.upper / valueUsd)
  return citedDerived(
    banded(
      years,
      cost.value.confidence,
      cost.value.intervalKind,
      cost.value.dominantSource,
      cost.value.contributions,
    ),
    'B',
    cost.citations,
    `The build-cost band divided by $${valueUsd.toFixed(2)} of electricity in one year`,
    PAYBACK_CAVEAT,
  )
}

/**
 * The payback a season is entitled to: the typed cost over the year’s value when one was typed,
 * the benchmark band over it otherwise, and null where the cost and the value are in different
 * currencies. The benchmark is in US dollars, so a tariff in anything else has no payback until
 * the panels’ cost is typed in that currency. `paybackBlocker` says so
 */
export const paybackOf = (
  buildCostUsd: DerivedCited<Banded<number>> | null,
  installedCost: TypedCost | null,
  value: number | null,
  price: PriceInUse | null,
): DerivedCited<Banded<number>> | TypedPayback | null => {
  if (price === null || !earned(value)) return null
  const currency = currencyOf(price)
  if (installedCost !== null) {
    return installedCost.currency === currency
      ? { sourceId: 'user', years: installedCost.amount / value }
      : null
  }
  return buildCostUsd === null || currency !== 'USD' ? null : paybackYearsBand(buildCostUsd, value)
}

/**
 * Why a valued year has no payback, in one sentence, or null when it has one or has no value to
 * pay anything back with. The two branches are the two currency mismatches `paybackOf` refuses
 */
export const paybackBlocker = (
  installedCost: TypedCost | null,
  value: number | null,
  price: PriceInUse | null,
): string | null => {
  if (price === null || !earned(value)) return null
  const currency = currencyOf(price)
  if (installedCost === null) {
    return currency === 'USD'
      ? null
      : `Payback needs the panels' cost typed in ${currency}, since the benchmark on file is in US dollars.`
  }
  return installedCost.currency === currency
    ? null
    : `Payback needs the electricity price typed in ${installedCost.currency}, since the price on file is in US dollars.`
}
