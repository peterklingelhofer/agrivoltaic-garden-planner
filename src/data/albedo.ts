import { citedComputed, citedInferred, type Cited } from '../types/cited'
import { GROUND_COVER_ALBEDO, GROUND_COVERS, SNOW_ALBEDO, type GroundCover } from '../types/ground'
import type { Fraction } from '../types/units'

/**
 * Where each ground cover's albedo came from, and what a grower is being asked to choose.
 *
 * The numbers themselves are in `src/types/ground.ts` and are read from there, never restated:
 * a table of citations that could drift from the table of values would be worse than no table
 * at all.
 *
 * A note on the evidence, because it is thinner than the physics around it. Albedo is a
 * well-measured quantity and the RANGES below are textbook. What is not published anywhere we
 * could find is a value for "the straw mulch on a garden bed" or "the wood chips on a path", so
 * every entry except grass is a point taken from inside a published range for the nearest
 * surface Oke tabulates, and each says so. That is why they are `citedInferred`, tier C: the
 * mechanism is certain and the exact figure is ours
 */
export interface GroundCoverOption {
  readonly id: GroundCover
  /** What it is called on screen, in a grower's words rather than a physicist's */
  readonly label: string
  /** One line saying what choosing it does to both halves of the design */
  readonly help: string
  readonly albedo: Cited<Fraction>
}

// the same ranges broken out per surface are in the solar geometry document section 7.1
const OKE_RANGES =
  "Oke tabulates shortwave albedo by surface: soils span roughly 0.05 for dark wet soil to 0.40 for dry light sand, short grass sits near 0.20-0.26, and dry plant litter is brighter than the living canopy that made it. No source measures a garden's own mulch, so the figure here is a point chosen inside the nearest of those bands and is not a number Oke states"

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
    'Straw weathers grey and then dark within a season or two, so this is the fresh figure and the yearly average under a re-mulched bed will sit below it',
  ),
  'light-gravel': citedInferred(
    GROUND_COVER_ALBEDO['light-gravel'],
    ['oke1987-boundary-layer-climates'],
    `Pale crushed stone reads as the dry light sand end of the soil range: above the 0.30-0.40 tabulated for dry sand and deliberately below the 0.55-0.75 for WHITE gravel and geotextile, which this is not. ${OKE_RANGES}`,
    'Nothing grows in it. It is offered because it is the strongest lever on generation available at garden scale',
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
  'bare-soil': 'Darkest of these: soaks up the day’s heat, and gives the panel backs the least',
  grass: 'The middle of the range, and what every figure here assumed before you were asked',
  'wood-chip': 'Dark, so it warms the soil, and it gives the panel backs a little less than grass',
  'straw-mulch': 'Bright: noticeably more power off the backs of the panels, and a cooler bed',
  'light-gravel':
    'Brightest, and the most power off the backs of the panels. Not a growing surface',
}

export const GROUND_COVER_OPTIONS: readonly GroundCoverOption[] = GROUND_COVERS.map((id) => ({
  id,
  label: LABEL[id],
  help: HELP[id],
  albedo: ALBEDO[id],
}))

export const groundCoverAlbedoClaim = (cover: GroundCover): Cited<Fraction> => ALBEDO[cover]

/**
 * Snow is not a cover a grower picks, so it is not in the list above, but it is the single
 * largest thing that happens to the ground's albedo in a year and the chain now reads it hour by
 * hour. That ground reflectivity is strongly seasonal wherever snow lies, and that a single
 * annual figure therefore misstates the winter, is the result Thevenard and Haddad set out
 */
export const SNOW_ALBEDO_CLAIM: Cited<Fraction> = citedInferred(
  SNOW_ALBEDO,
  ['thevenard2006-ground-reflectivity', 'oke1987-boundary-layer-climates'],
  'Settled snowpack, days after a storm. Oke separates fresh snow, near 0.80-0.90, from old and melting snow, which is far darker and spans roughly 0.40-0.70; a smooth seasonal weighting off monthly normals is describing the lying pack across whole months, so it takes the upper part of the old-snow band',
  'Neither source states 0.70 for this. It is a point inside the old-snow band, chosen so that a modelled winter is not flattered: the fresh-snow figure would have raised the modelled year further still, and the same number is what the renderer draws, so the picture cannot disagree with it',
)
