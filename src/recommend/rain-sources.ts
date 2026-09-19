import type { CitationId } from '../types/citation-ids.generated'

/**
 * Where a number in the rain model came from. Held in one place so no constant can drift from the
 * paper it was read out of without a test failing: `rain.test.ts` reads
 * `docs/CITATIONS.csl.json` and holds every `citation` and `quote` here against that entry's own
 * claim text
 */
export interface Provenance {
  /** The citation whose `backsClaims` carries this number, from `docs/CITATIONS.csl.json` */
  readonly citation: CitationId
  /** Where in that source, spelled the way the citation's own claim spells it */
  readonly locator: string
  /** The words the citation uses for it, so a test can hold the two together */
  readonly quote: string
}

/** One number read from a source, with the source's own words for it */
export interface PinnedNumber extends Provenance {
  readonly value: number
}

/**
 * One number this app arrives at itself, with no source behind it. A separate shape from
 * `PinnedNumber` so a derived number can never be read as a sourced one
 */
export interface DerivedNumber {
  readonly value: number
  /** How this app arrives at the number, and what the sources leave open */
  readonly derivation: string
}

/**
 * Gunn and Kinzer 1949, Table 2 (p. 246): a raindrop's terminal fall speed by its equivalent
 * diameter, millimeters to meters per second. Table 1 of the same paper is indexed by the drop's
 * log mass
 */
export const GUNN_KINZER_ROWS: readonly (readonly [diameterMm: number, fallSpeedMS: number])[] = [
  [0.3, 1.17],
  [0.4, 1.62],
  [0.5, 2.06],
  [0.6, 2.47],
  [0.7, 2.87],
  [0.8, 3.27],
  [0.9, 3.67],
  [1.0, 4.03],
  [1.2, 4.64],
  [1.4, 5.17],
  [1.6, 5.65],
  [1.8, 6.09],
  [2.0, 6.49],
  [2.2, 6.9],
  [2.4, 7.27],
  [2.6, 7.57],
  [2.8, 7.82],
  [3.0, 8.06],
  [3.2, 8.26],
  [3.4, 8.44],
  [3.6, 8.6],
  [3.8, 8.72],
  [4.0, 8.83],
  [4.4, 8.98],
  [5.0, 9.09],
  [5.8, 9.17],
]

export const GUNN_KINZER: Provenance & { readonly rows: typeof GUNN_KINZER_ROWS } = {
  rows: GUNN_KINZER_ROWS,
  citation: 'gunn-kinzer1949-terminal-velocity',
  locator: 'Table 2 (p. 246)',
  quote:
    "Table 2 (p. 246), the fall speed of a water drop in still air by its equivalent diameter, the rain field's lookup: 0.5 mm 2.06 m/s, 1.0 mm 4.03, 1.5 mm 5.41 (between the 1.4 and 1.6 mm rows), 2.0 mm 6.49, 3.0 mm 8.06, 3.8 mm 8.72, 4.0 mm 8.83, 5.8 mm 9.17",
}

const BEST_LOCATOR = 'Eq. 1 (as Elamri et al. 2018 Eq. 3)'
const BEST_QUOTE =
  'the share of the liquid water in the air carried by drops smaller than D follows 1 - exp(-(D / a)^2.25) with a = 1.30 I^0.232 mm for a rain rate I in mm/h'

/** The scale coefficient of Best's drop-size distribution, a = 1.30 I^0.232 mm */
export const BEST_COEFFICIENT_A: PinnedNumber = {
  value: 1.3,
  citation: 'best1950-raindrop-size-distribution',
  locator: BEST_LOCATOR,
  quote: BEST_QUOTE,
}

/** The rain rate's exponent in that scale coefficient */
export const BEST_RATE_EXPONENT: PinnedNumber = {
  value: 0.232,
  citation: 'best1950-raindrop-size-distribution',
  locator: BEST_LOCATOR,
  quote: BEST_QUOTE,
}

/** The shape exponent n of the distribution, the one Best warns varies most */
export const BEST_SHAPE_N: PinnedNumber = {
  value: 2.25,
  citation: 'best1950-raindrop-size-distribution',
  locator: BEST_LOCATOR,
  quote: BEST_QUOTE,
}

/**
 * The diameter a drip leaves a panel edge at, taken at the mass mode of Elamri et al. 2018's own
 * Fig. 4 count histogram: its modes are 1.4, 3.8 and 9.3 mm, and a drop's mass goes with its
 * diameter cubed
 */
export const DRIP_DROP_MM: PinnedNumber = {
  value: 3.8,
  citation: 'elamri2018-rain-concentration',
  locator: 'Fig. 4',
  quote:
    'Table 1 takes a 1.5 mm drop as its reference "for simplicity", at the first mode of Fig. 4\'s count histogram of the drops leaving a panel edge, whose modes are 1.4, 3.8 and 9.3 mm',
}

/** Manning's n for the runoff film on glass, which sets the speed the film leaves the low edge at */
export const MANNING_N_GLASS: PinnedNumber = {
  value: 0.01,
  citation: 'elamri2018-rain-concentration',
  locator: 'Sect. 2.2.1',
  quote:
    'the runoff film leaving the edge at the Manning speed for an n of 0.01 on glass (after Chow 1959)',
}

/**
 * The water a panel holds before its runoff starts. The rain field carries no retention term, and
 * this is the figure it would carry, the one measured outdoors: the paper's indoor rig needed about
 * ten times as much
 */
export const PANEL_RETENTION_MM: PinnedNumber = {
  value: 0.2,
  citation: 'elamri2018-rain-concentration',
  locator: 'Sect. 2.2.1',
  quote:
    'the wetting of a panel before its runoff starts "is 0.2 mm at most" in the field at low tilts, where Sect. 4.1 puts the same threshold at "(approximately) 2 mm water depth" on the indoor rig',
}

/**
 * Wang and Pruppacher 1977's fall distances to 99 percent of terminal speed, diameter in mm to
 * distance in m. Their own sentence reads "For 1000 mb and 20°C, z99% for the same size drops is
 * 0.15, 0.71, 1.6, 2.8, 3.9, 5.2, 6.3, 7.3, 8.4, 9.5, 14.0, 12.8 m" over radii of 100 to 3000
 * micrometers, so these three are the 500, 1000 and 2000 micrometer radii. The second source the
 * drip's own fall from rest is held against, since the rain field integrates that fall from rest
 * and lets the drag build the drop's speed over the fall
 */
export const TERMINAL_DISTANCE_M: Provenance & {
  readonly rows: readonly (readonly [diameterMm: number, distanceM: number])[]
} = {
  rows: [
    [1, 3.9],
    [2, 9.5],
    [4, 14.0],
  ],
  citation: 'wang-pruppacher1977-acceleration',
  locator: 'Sect. 4',
  quote:
    'measured and computed fall distances to 99 percent of terminal speed at 1000 mb and 20 C: 3.9 m for a 1 mm diameter drop, 9.5 m for 2 mm and 14.0 m for 4 mm',
}

const LACY_QUOTE =
  "Lacy's wind-driven rain relation, R = 0.222 U R^0.88, is the rain's angle from vertical at the median drop of the hour's rate: \"the WDR coefficient is the inverse of the raindrop terminal velocity of fall ... 4.5 m/s, corresponding to a raindrop diameter of 1.2 mm\""

/** Lacy's wind-driven rain coefficient, s/m: the inverse of one fall speed for the whole rain */
export const LACY_WDR_COEFFICIENT_SM: PinnedNumber = {
  value: 0.222,
  citation: 'blocken-carmeliet2004-wdr-review',
  locator: 'Eq. 5',
  quote: LACY_QUOTE,
}

/** The fall speed that coefficient inverts */
export const LACY_REFERENCE_FALL_MS: PinnedNumber = {
  value: 4.5,
  citation: 'blocken-carmeliet2004-wdr-review',
  locator: 'Eq. 5',
  quote: LACY_QUOTE,
}

/** The drop diameter that fall speed belongs to */
export const LACY_REFERENCE_DROP_MM: PinnedNumber = {
  value: 1.2,
  citation: 'blocken-carmeliet2004-wdr-review',
  locator: 'Eq. 5',
  quote: LACY_QUOTE,
}

/**
 * The still-air landing width across a panel's low edge. Derived: at `MANNING_N_GLASS` the runoff
 * film leaves the edge at under 0.2 m/s, so from a garden-height edge the drops land within a
 * hand's width of the edge's vertical, taken as 0.2 m. Elamri et al. 2018 gives no film depth,
 * speed or landing width, so this width is this app's own
 */
export const STILL_AIR_STRIP_M: DerivedNumber = {
  value: 0.2,
  derivation:
    "at MANNING_N_GLASS the runoff film leaves the low edge at under 0.2 m/s, so the drops land within a hand's width of the edge's vertical: the paper gives no landing width",
}

/**
 * The rate the rose falls back to for a record with no hourly rain column (PVGIS, NSRDB) or no wet
 * hour at all. Derived: a declared moderate hourly rate, since a drop size needs some rate and no
 * source picks one for a record that carries none
 */
export const FALLBACK_RAIN_RATE_MM_H: DerivedNumber = {
  value: 2,
  derivation:
    'a declared moderate hourly rate, for a record with no hourly rain column or no wet hour at all',
}
