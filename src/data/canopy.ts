import { citedDerived, unsourcedClaim } from '../types/cited'
import type { DerivedCited, UnsourcedCited } from '../types/cited'
import type { ExceedancePercentile } from '../types/site'
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
 * The risk this app reads a drawn deciduous tree's leaf-on months at: `growingWindowFor` in
 * `src/sim/growing-window.ts`, called with this percentile from `src/sim/pipeline.ts`. Fixed
 * rather than the grower's own chosen frost risk (`state.frostPercentile`), because `src/sim`
 * cannot read the store; 50 is the median date, neither the cautious nor the bold end of the
 * band the wants step offers for everything else a frost date gates
 */
export const LEAF_SEASON_PERCENTILE: ExceedancePercentile = 50

/**
 * Which months count as in leaf is this app's own reading, not a phenology date any source
 * publishes for a drawn tree of unknown species: the site's growing window at the median frost
 * risk. It decides which of the two figures above a given month's light uses (Decision Record 26)
 */
export const LEAF_SEASON_CLAIM: UnsourcedCited<ExceedancePercentile> = unsourcedClaim(
  LEAF_SEASON_PERCENTILE,
  "A deciduous tree's leaf-on months are read as the site's growing window at the 50th-percentile, median frost risk: this app's own reading, not a measured phenology date for a tree of unknown species. It decides which of the in-leaf and leafless crown-transmittance figures a given month's light uses",
)
