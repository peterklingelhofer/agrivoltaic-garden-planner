import { citedComputed, citedInferred, type Cited } from '../types/cited'
import { GROUND_COVER_ALBEDO, GROUND_COVERS, type GroundCover } from '../types/ground'
import type { Fraction } from '../types/units'

/**
 * Where each ground cover's albedo came from, and what a grower is being asked to choose.
 *
 * The numbers themselves are in `src/types/ground.ts`, read from there and stated nowhere else:
 * a table of citations that could drift from the table of values would be worse than no table
 * at all.
 *
 * A note on the evidence, because it's thinner than the physics around it. Albedo is a
 * well-measured quantity and the RANGES below are textbook. What isn't published anywhere we
 * could find is a value for "the straw mulch on a garden bed" or "the wood chips on a path", so
 * every entry except grass is a point taken from inside a published range for the nearest
 * surface Oke tabulates, and each says so. That's why they're `citedInferred`, tier C: the
 * mechanism is certain and the exact figure is ours
 */
export interface GroundCoverOption {
  readonly id: GroundCover
  /** What it's called on screen, in the words a grower uses */
  readonly label: string
  /** One line saying what choosing it does to both halves of the design */
  readonly help: string
  readonly albedo: Cited<Fraction>
}

const OKE_RANGES =
  "Oke tabulates shortwave albedo by surface: soils span roughly 0.05 for dark wet soil to 0.40 for dry light sand, short grass sits near 0.20-0.26, and dry plant litter is brighter than the living canopy that made it. No source measures a garden's own mulch, so the figure here is a point chosen inside the nearest of those bands and isn't a number Oke states"

const ALBEDO: Readonly<Record<GroundCover, Cited<Fraction>>> = {
  'bare-soil': citedInferred(
    GROUND_COVER_ALBEDO['bare-soil'],
    ['oke1987-boundary-layer-climates'],
    `A worked, moist, organic-rich bed is at the dark end of the soil range, the 0.08-0.14 band the solar-engineering notes give for wet bare soil. ${OKE_RANGES}`,
    'Dry pale tilth is a different surface, at 0.20-0.30, which is the grass figure. Choose grass for a bed that bakes pale between crops',
  ),
  grass: citedComputed(
    GROUND_COVER_ALBEDO.grass,
    'B',
    ['dobos2014-pvwatts-v5', 'sandia-pvpmc'],
    'pvwatts-v5-default-ground-reflectance',
    'PVWatts v5 assumes 0.20 where the ground is unknown, and this app assumed the same single number everywhere until ground cover became a choice. FAO-56 puts its 0.12 m reference grass at 0.23, close enough that the difference is inside the spread of a real lawn and far enough to be worth naming',
  ),
  'wood-chip': citedInferred(
    GROUND_COVER_ALBEDO['wood-chip'],
    ['oke1987-boundary-layer-climates'],
    `Fresh bark and chip are darker than the soil they cover and weather darker still. ${OKE_RANGES}`,
  ),
  'straw-mulch': citedInferred(
    GROUND_COVER_ALBEDO['straw-mulch'],
    ['oke1987-boundary-layer-climates'],
    `Dry cereal straw is the brightest thing most gardens put on the ground on purpose. ${OKE_RANGES}`,
    'Straw weathers gray and then dark within a season or two, so this is the fresh figure and the yearly average under a re-mulched bed will sit below it',
  ),
  'light-gravel': citedInferred(
    GROUND_COVER_ALBEDO['light-gravel'],
    ['oke1987-boundary-layer-climates'],
    `Pale crushed stone reads as the dry light sand end of the soil range: above the 0.30-0.40 tabulated for dry sand and deliberately below the 0.55-0.75 for WHITE gravel and geotextile, which this isn't. ${OKE_RANGES}`,
    "Nothing grows in it. It's offered because it's the strongest lever on generation available at garden scale",
  ),
}

const LABEL: Readonly<Record<GroundCover, string>> = {
  'bare-soil': 'Bare soil',
  grass: 'Grass or a green cover crop',
  'wood-chip': 'Wood-chip mulch',
  'straw-mulch': 'Straw mulch',
  'light-gravel': 'Pale gravel or crushed stone',
}

/**
 * Both consequences in one line each, because a choice that changes two things and explains one
 * of them is a trap. Brighter ground bounces more light onto the backs of the panels AND holds
 * less of the day's heat in the soil, and those pull opposite ways for a grower who wants an
 * early bed
 */
const HELP: Readonly<Record<GroundCover, string>> = {
  'bare-soil':
    'Darkest of these: soaks up the day’s heat, and reflects the least light onto the panel backs',
  grass: 'The middle of the range, and the default until you choose another',
  'wood-chip':
    'Dark, so it warms the soil, and it reflects a little less light onto the panel backs than grass',
  'straw-mulch': 'Bright: noticeably more power off the backs of the panels, and a cooler bed',
  'light-gravel': 'Brightest, and the most power off the backs of the panels. Nothing grows in it',
}

export const GROUND_COVER_OPTIONS: readonly GroundCoverOption[] = GROUND_COVERS.map((id) => ({
  id,
  label: LABEL[id],
  help: HELP[id],
  albedo: ALBEDO[id],
}))
