import { citedInferred } from '../../types/cited'
import type { LaubCropGroup, PollinatorDependence, PollinatorForage } from '../../types/crop'
import type { PlantingRole } from '../../types/garden'

/**
 * What a crop asks of pollinators, and what it offers them. Two different questions, kept apart.
 *
 * Conflating them is the first mistake available here, and the catalogue already contained the
 * makings of it: nine plants carry `role: 'insectary'` cited to Fiedler and Landis 2007, which
 * counted ARTHROPOD NATURAL ENEMIES, the predators and parasitoids that eat pests. That is not a
 * pollinator survey. A plant can be excellent for lacewings and poor for bees. So the insectary
 * role is read here as evidence that a plant is grown for its flowers and visited at them, and
 * the pollinator claim itself is carried by pollinator literature.
 *
 * Both values are `citedInferred`, which this codebase fixes at tier C and makes carry its own
 * basis string, because that is honestly what they are. Klein et al. 2007 classify 107 crops at the
 * level of the harvested product; this derives a class from botanical family and harvested organ,
 * which is the paper's own structure applied one level up. Reading a per-species value out of the
 * published table for each of 182 rows by hand would look more precise and would be less honest
 * about where the number came from
 */

/** What is taken off the plant, which is what decides whether flowers had to happen first */
type Harvest = 'fruit' | 'seed' | 'grain' | 'root' | 'leaf'

const HARVEST_BY_GROUP: Readonly<Record<LaubCropGroup, Harvest>> = {
  fruits: 'fruit',
  berries: 'fruit',
  'fruity-vegetables': 'fruit',
  'grain-legumes': 'seed',
  'c3-cereals': 'grain',
  'maize-c4': 'grain',
  'tubers-root-crops': 'root',
  'leafy-vegetables': 'leaf',
  forages: 'leaf',
}

/**
 * Wind pollination is a fact about the FAMILY, so this set holds families.
 *
 * `laubGroup` is Laub et al.'s SHADE-RESPONSE grouping. It puts the sunflower in `c3-cereals`
 * because its yield behaves like a cereal's under shade, which says nothing whatever about how
 * it is pollinated. Keying "wind-pollinated" off that group therefore announced that a sunflower
 * feeds pollinators nothing and needs no insect visits, over one of the best known bee plants in
 * any garden, with Klein et al. cited beside the claim contradicting it. The same fault hit
 * buckwheat and the clovers and vetches, all filed under `forages` for the same shade-response
 * reason and all classic nectar sources.
 *
 * The grasses really are wind-pollinated, and so are the beets and spinaches of the
 * Amaranthaceae, the alders and the walnuts. That is what this set is for, and it is the only
 * thing that now shuts a plant out of both answers
 */
const WIND_FAMILIES = new Set([
  'Poaceae',
  'Amaranthaceae',
  'Betulaceae',
  'Juglandaceae',
  'Cannabaceae',
])

/**
 * The families whose fruit set is worst hit by losing pollinators, after Klein et al. Squashes,
 * melons and cucumbers are the standing example of a crop that sets almost nothing without an
 * insect visit; the pome and stone fruit, and the Ericaceae berries, lose most of a crop, short of
 * all of it. The nightshades and the grain legumes sit at the other end because they are largely
 * self-fertile: a tomato pollinates itself in a breeze, and gains something from a bee shaking it
 */
const ESSENTIAL_FAMILIES = new Set(['Cucurbitaceae'])
const GREAT_FAMILIES = new Set(['Rosaceae', 'Ericaceae', 'Grossulariaceae', 'Actinidiaceae'])
const LITTLE_FAMILIES = new Set(['Solanaceae', 'Fabaceae'])

/**
 * Families whose flowers are open to, and worked by, short-tongued and long-tongued insects alike,
 * and which are in a garden long enough to flower there. The mints and the borages are near the top
 * of both published garden counts; the umbels are the classic shallow-nectar family, and
 * buckwheat's Polygonaceae is the classic break crop sown for exactly this. Asteraceae is
 * deliberately absent even though it contains real forage plants: this catalogue's Asteraceae are
 * mostly lettuce and chicory, which a grower harvests before bolting, treating flowering as a
 * failure. The ones grown FOR their flowers carry the insectary role, and the ones grown for seed
 * are caught by the seed test instead
 */
const NECTAR_FAMILIES = new Set([
  'Lamiaceae',
  'Boraginaceae',
  'Apiaceae',
  'Polygonaceae',
  'Fabaceae',
])

export const pollinatorDependenceOf = (
  family: string,
  group: LaubCropGroup,
): PollinatorDependence => {
  if (WIND_FAMILIES.has(family)) return 'none'
  const harvest = HARVEST_BY_GROUP[group]
  // nothing taken off the plant before it flowers can depend on a flower being visited
  if (harvest === 'root' || harvest === 'leaf') return 'none'
  if (ESSENTIAL_FAMILIES.has(family)) return 'essential'
  if (GREAT_FAMILIES.has(family)) return 'great'
  if (LITTLE_FAMILIES.has(family)) return 'little'
  return 'modest'
}

export const pollinatorForageOf = (
  family: string,
  group: LaubCropGroup,
  role: PlantingRole | null,
): PollinatorForage => {
  if (role === 'insectary') return 'high'
  // the one thing that rules a plant out of feeding anything: no nectar, no insect-worked pollen
  if (WIND_FAMILIES.has(family)) return 'none'
  const harvest = HARVEST_BY_GROUP[group]
  // a root is out of the ground long before it could flower
  if (harvest === 'root') return 'none'
  if (NECTAR_FAMILIES.has(family)) return 'high'
  // a seed crop that is not wind-pollinated had to be worked by something to set that seed, and
  // it flowers conspicuously to get it: the sunflower is the case this exists for
  if (harvest === 'seed' || harvest === 'grain') return 'high'
  // anything fruiting had to flower to do it, and orchard blossom is real forage even though
  // the plant is not grown for it
  if (harvest === 'fruit') return 'some'
  return 'none'
}

const DEPENDENCE_BASIS =
  'Klein et al. 2007 classify the dependence of 107 world crops on animal pollination by harvested product. This applies that classification at the level of botanical family and harvested organ, so it is a class-level inference'

const FORAGE_BASIS =
  'Garbuzov and Ratnieks 2014 and Rollings and Goulson 2019 both found flower visitors concentrated on a minority of garden plants, with the mints, borages and umbels near the top. This applies that at family level, to plants that actually flower in a garden before they are harvested'

export const wildlifeOf = (family: string, group: LaubCropGroup, role: PlantingRole | null) => ({
  dependence: citedInferred(
    pollinatorDependenceOf(family, group),
    ['klein2007-pollinators'],
    DEPENDENCE_BASIS,
  ),
  forage: citedInferred(
    pollinatorForageOf(family, group, role),
    ['garbuzov2014-attractiveness', 'rollings2019-garden-flowers'],
    FORAGE_BASIS,
  ),
})
