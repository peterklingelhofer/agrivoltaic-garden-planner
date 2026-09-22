import {
  GSI_LEAF_ON,
  GSI_PHOTOPERIOD_MAX_H,
  GSI_PHOTOPERIOD_MIN_H,
  GSI_TMIN_MAX_C,
  GSI_TMIN_MIN_C,
  GSI_VPD_MAX_PA,
  GSI_VPD_MIN_PA,
  GSI_WINDOW_DAYS,
} from '../sim/phenology'
import { citedDerived, citedVerbatim } from '../types/cited'
import type { DerivedCited, VerbatimCited } from '../types/cited'
import type { Fraction } from '../types/units'

const KONARSKA_CAVEAT =
  'Direct-beam transmissivity only, measured under five street trees (one conifer, four deciduous) in Göteborg, Sweden. The app applies one figure to beam, diffuse and sky-view alike, over a solid box crown rather than a real crown’s gaps'

/**
 * A drawn tree's crown transmittance in leaf: the midpoint of what Konarska et al. 2014 measured
 * beneath five street trees, "1.3 to 5.3%", read with a pyranometer against a rooftop reference
 * over nine clear days. `src/sim/obstruction.ts#treeQuads` puts this over the whole crown box
 * (Decision Record 26)
 */
export const CROWN_TRANSMITTANCE_IN_LEAF: DerivedCited<Fraction> = citedDerived(
  0.033 as Fraction,
  'B',
  ['konarska2014-urban-tree-transmissivity'],
  'the midpoint of the 1.3-5.3% foliated range Konarska et al. 2014 measured beneath five street trees',
  KONARSKA_CAVEAT,
)

/**
 * The same crown, bare: the midpoint of the defoliated range in the same sentence, "40.2 to
 * 51.9%" (Decision Record 26)
 */
export const CROWN_TRANSMITTANCE_LEAFLESS: DerivedCited<Fraction> = citedDerived(
  0.46 as Fraction,
  'B',
  ['konarska2014-urban-tree-transmissivity'],
  'the midpoint of the 40.2-51.9% defoliated range Konarska et al. 2014 measured beneath the same five trees',
  KONARSKA_CAVEAT,
)

/**
 * Which months count as in leaf: the eight thresholds of the Growing Season Index (Jolly, Nemani
 * and Running 2005), the same constants `src/sim/phenology.ts#growingSeasonIndex` computes from.
 * Declared here too, cited, so the rule's provenance stands beside the two transmittance
 * figures above, here as well as in the sim layer (Decision Record 26)
 */
export const LEAF_SEASON_INDEX: VerbatimCited<{
  readonly GSI_TMIN_MIN_C: number
  readonly GSI_TMIN_MAX_C: number
  readonly GSI_VPD_MIN_PA: number
  readonly GSI_VPD_MAX_PA: number
  readonly GSI_PHOTOPERIOD_MIN_H: number
  readonly GSI_PHOTOPERIOD_MAX_H: number
  readonly GSI_WINDOW_DAYS: number
  readonly GSI_LEAF_ON: number
}> = citedVerbatim(
  {
    GSI_TMIN_MIN_C,
    GSI_TMIN_MAX_C,
    GSI_VPD_MIN_PA,
    GSI_VPD_MAX_PA,
    GSI_PHOTOPERIOD_MIN_H,
    GSI_PHOTOPERIOD_MAX_H,
    GSI_WINDOW_DAYS,
    GSI_LEAF_ON,
  },
  'B',
  ['jolly2005-growing-season-index'],
  "Fitted to satellite greenness at nine sites and to leaf flush and colouring at Harvard Forest. A drawn tree of unknown species takes the same limits, read by calendar month from the site's typical year, with the vapour-pressure-deficit term held at its moist value: the paper uses dry air as a surrogate for soil water natural vegetation cannot reach, and a garden tree stands where the beds are watered",
)
