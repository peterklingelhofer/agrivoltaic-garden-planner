import type { VerbatimCited } from './cited'

/**
 * What a kilowatt-hour costs to buy where the garden is, and nothing more.
 *
 * The shape lives here rather than beside the fetch that fills it because a season report carries
 * the price it was valued at, and `src/types` is the only layer a report may name: Biome enforces
 * `types -> sim -> data`, so `src/types/simulation.ts` cannot reach into `src/data/retail-price.ts`
 * for it. `src/data/retail-price.ts` re-exports it beside the fetch that fills it.
 *
 * The price is carried as a `Cited` rather than a bare number because the caveat travels with it:
 * EIA publishes what a residential customer PAYS, and this app has no model of what an exported
 * kilowatt-hour EARNS. Every value built on it inherits that
 */
export interface RetailPrice {
  /** USD per kWh, converted from the cents per kWh EIA publishes */
  readonly usdPerKwh: VerbatimCited<number>
  /** USPS two-letter code, which is the facet the EIA series is keyed by */
  readonly stateCode: string
  /** the calendar year the annual average is for, read off the answer rather than assumed */
  readonly year: number
  readonly sourceLabel: string
}

/**
 * A tariff the grower typed, stamped 'user' the way a typed soil pH is, in the currency they
 * named. It is the only price a garden outside the EIA's coverage can have, and anyone who knows
 * their own tariff may type it over the state average
 */
export interface TypedPrice {
  readonly sourceId: 'user'
  readonly perKwh: number
  /** ISO 4217, three capital letters */
  readonly currency: string
}

/** The price a season valued its electricity at: the EIA state average or the grower's own tariff */
export type PriceInUse = RetailPrice | TypedPrice

/** What the grower typed the panels cost, installed, in the currency they named */
export interface TypedCost {
  readonly sourceId: 'user'
  readonly amount: number
  readonly currency: string
}

/** Years of electricity until a typed cost is paid back: a point, because the cost is one */
export interface TypedPayback {
  readonly sourceId: 'user'
  readonly years: number
}

/**
 * What the grower has typed about money, persisted with the design. A null figure is one nobody
 * typed; a zero is typed and counts as nothing typed. The currency covers both figures and is
 * 'USD' until changed, which is what the EIA price and the NREL benchmark are in
 */
export interface EconomyInputs {
  readonly perKwh: number | null
  readonly currency: string
  readonly installedCost: number | null
}
