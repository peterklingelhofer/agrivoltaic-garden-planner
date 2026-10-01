import type { NonEmpty } from '../../types/cited'
import type { CitationId } from '../../types/citation-ids.generated'
import type { CropRow } from './schema'

/**
 * The two extension documents, kept apart because they print different things and a row may cite
 * one without the other. VCE SPES-720NP Table 3 prints a band for lettuce, spinach, parsley,
 * cilantro, basil, tomato, cucumber and zucchini,
 * and Purdue HO-238-B-W's chart marks bands for Lycopersicon and Capsicum among its greenhouse
 * species. Five rows carry a figure one of them prints for the crop itself, and raspberry
 * carries one Widmer prints. Every other row cites neither, because neither holds its number
 * (Decision Record 23)
 */
const VCE: NonEmpty<CitationId> = ['stallknecht2025-vce-dli']

/**
 * The three documents behind the vine crops' numbers, in the order the numbers come from them:
 * VCE Table 3 prints "Tomato 20-30", Purdue HO-238-B-W's chart marks Lycopersicon and Capsicum
 * at 10 to 12 for minimum acceptable quality, 14 to 20 for good and 22 to 30 for high, and
 * Runkle 2011 is the 15 for vine crops as a group
 */
const VINE_CROPS: NonEmpty<CitationId> = [
  'stallknecht2025-vce-dli',
  'torres-purdue-dli-b',
  'runkle2011-vegetable-dli',
]

/**
 * Per-crop DLI trials are read in full or by abstract (Decision Record 23). The
 * Cornell pair is cited together: the 1997 paper is the origin of the 17 mol/m2/d target and
 * its abstract is served to no automated fetch, so the handbook is where the figure was read
 */
const LETTUCE: NonEmpty<CitationId> = [
  'both1997-cornell-lettuce-light',
  'brechner2013-cornell-lettuce-handbook',
  'kelly2020-lettuce-dli',
  'pennisi2020-lettuce-basil-ppfd',
]
const BASIL: NonEmpty<CitationId> = [
  'dou2018-basil-dli',
  'pennisi2020-lettuce-basil-ppfd',
  'walters2018-basil-species-dli',
]

/**
 * What the lettuce and basil figures are in the trials, carried onto the verbatim record so the
 * UI reads it beside the number. Neither trial placed a failure point, and the row comments say
 * where each number comes from
 */
const LETTUCE_CAVEAT =
  '5.8 mol/m2/d is the lowest level Pennisi et al. 2020 grew lettuce at (100 µmol/m2/s for 16 h), where it still produced a crop with the least biomass. Kelly et al. 2020 grew two cultivars from 6.9. No cited trial places a failure point below that, so the floor is where measurement stops. The target runs from Pennisi et al.’s optimum, 14.4, past which yield stopped rising, to the Cornell CEA program’s 17. Every trial behind these numbers is a growth chamber or a greenhouse at a fixed photoperiod, and none measured an outdoor bed'
const BASIL_CAVEAT =
  "12.9 mol/m2/d is the level Dou et al. 2018 suggest for commercial production, the lowest of their five light levels at which yield and nutritional quality were both high. 9.3 is the lowest level they grew it at, where it produced a crop with shoot fresh weight 35 to 44 percent below the three higher levels. Walters and Currey 2018 grew sweet basil at about 7 and about 15 mol/m2/d and report fresh weight 144 percent higher at the high level, which inverts to 59 percent less at the low one, a figure this app derives and the paper doesn't print. The target runs from Pennisi et al. 2020’s optimum, 14.4, to 17.8, the top of Dou et al.’s range, where shoot mass was highest"

/**
 * Tomato, both peppers and cucumber share one record: the numbers come from the same two
 * greenhouse tables and the same trade column, and the trials that have measured these crops
 * under panels all measured losses. Carried as the rows' basis so the UI prints it beside the
 * number
 */
const VINE_CROP_CAVEAT =
  'The 15 is Runkle 2011’s figure for vine crops as a group, "at least 15 (and preferably more than 20)", in a sentence that names no crop. The lowest band Purdue HO-238-B-W marks acceptable for tomato and pepper is 10 to 12. The 20 to 30 is the range Virginia Cooperative Extension’s Table 3 prints for tomato. Both are greenhouse figures and neither traces to a tomato experiment. The yield curve for these crops is Laub’s fruity-vegetables group, three studies (bell pepper under nets and sweet pepper under cloth, both subtropical, and squash), none of them tomato and none under panels. The field trials this app cites (Mata et al. 2026 at Bridgeton, Ben Naim et al. 2025 in Israel) measured yield losses that grew with shading, with no gain measured anywhere'

/** Spinach carries Virginia Extension's own spinach row, and a floor that table doesn't print */
const SPINACH_CAVEAT =
  'Virginia Cooperative Extension’s Table 3 prints 14 to 20 mol/m2/d for spinach, which is this row’s target. The 6 floor is this app’s own: Gao et al. 2020 grew spinach from 11.5 to 20.2 with an optimum at 17.3, so the trial starts too high to place a minimum'

/** Strawberry and raspberry are the two rows an agrivoltaic trial states a DLI for */
const STRAWBERRY_CAVEAT =
  '25 mol/m2/d is the level Widmer et al. 2026 found maintains trial-average yield under agrivoltaic cover, from a four-year study of 21 cases in Switzerland, every one substrate-grown under a protective cover. The 30 at the top of the band is where the Ohio State Kubota Lab’s greenhouse guidance reports strawberry plants tend to be stressed. Neither figure is a failure point, and transfer to an in-ground bed is an extrapolation'
const RASPBERRY_CAVEAT =
  '15 mol/m2/d is the level Widmer et al. 2026 found maintains trial-average yield for raspberry, on the same convention as strawberry. They publish no target band and no shading percentage for raspberry, so the 18 to 25 is this app’s own'

/** The one row whose shade ceiling a trial on the crop itself stands behind */
const POTATO_CEILING_NOTE =
  "Potato is the one crop in this catalog with a shade trial of its own: Weselek et al. 2021 grew it under an array at about 30 percent shade across two seasons, and Laub et al. 2022 class tubers and root crops as tolerant to about half the light. The 50 percent ceiling is where the reviews put potato's yield-loss threshold, well past anything the trial tested"

/** Potato keeps a tier B record for its shade behavior, and neither cited work prints a DLI */
const POTATO_CAVEAT =
  'Weselek et al. 2021 grew potato under an array at about 30 percent shade and Laub et al. 2022 place tubers and root crops on their own response curve. Neither prints a daily light integral for potato, so the 12 and the 18 to 25 are this app’s own band. The tier shown comes from the shade studies'

/**
 * Where a crop's Laub group is an analogy, its row says in one sentence which fact makes it one.
 * Each reaches the reader as a yield caveat, so the band shows as the extrapolation it is
 */
const IMMATURE_POD_NOTE =
  'The grain-legume trials in the meta-analysis measured dry seed, and this crop is picked as an immature pod or a green seed, which is a different sink (where the plant sends its sugars)'
const OILSEED_NOTE =
  'No group in the meta-analysis holds an oilseed, so this crop uses the nearest grain curve as a proxy'
const PSEUDOCEREAL_NOTE =
  'The C3-cereals group is wheat and barley, and this crop is a pseudocereal of the amaranth family (Amaranthaceae), so the group is a proxy'
const NO_COMPARABLE_CROP_NOTE =
  'No crop in the nine groups is harvested the way this one is, so the group is an analogy this app chose'
const LAUB_EXCLUDED_NOTE =
  'Laub et al. 2022 name this species among the crops they excluded as not relevant for temperate regions, so the curve runs past the data it was fitted on'
const OUTSIDE_SCOPE_NOTE =
  'The meta-analysis took data from temperate and subtropical sites only, and this crop is grown outside that range, so the curve is an extrapolation'
const SWEET_CORN_NOTE =
  'The corn trials in the meta-analysis are grain corn, and sweet corn is cut at the milk stage, so the loss this curve predicts is likely overstated for it'
const NO_HARVEST_NOTE =
  'The forages curve is a biomass-yield response measured on cut hay and pasture. Nothing is harvested from this planting, so a relative yield means nothing for it'

/**
 * ECOCROP names its climate zones in Trewartha's letters. Read onto the Köppen codes
 * `static-layers.ts` produces: Ar (tropical wet) is Af and Am, Aw is Aw, Bs is BSh and BSk, Bw is
 * BWh and BWk, Cf is Cfa and Cfb, Cs is Csa and Csb, Cw is Cwa and Cwb. Each tropical row below
 * lists exactly the zones its ECOCROP sheet gives, so `koppen` transcribes the sheet. Trewartha's
 * temperate letters are read the same way: Do (oceanic) is Cfb, Dc (continental) is Dfb, Df is
 * Dfa and Dfb, Dw is Dwa and Dwb
 */
const AR = ['Af', 'Am']
const AW = ['Aw']
const BS = ['BSh', 'BSk']
const BW = ['BWh', 'BWk']
const CF = ['Cfa', 'Cfb']
const CS = ['Csa', 'Csb']
const CW = ['Cwa', 'Cwb']
const DO = ['Cfb']
const DC = ['Dfb']
const DF = ['Dfa', 'Dfb']
const DW = ['Dwa', 'Dwb']

/**
 * The hot half of the `subtropical` envelope laid over the cold half `hardy-perennial` already
 * gives these crops. Thyme, oregano, sage, winter savory and hyssop are Mediterranean-basin
 * sub-shrubs grown routinely in hot-summer climates including the low desert. A perennial stays in
 * the bed through its hottest month and is judged on that month, so the temperate archetype's 34 C
 * ceiling would exclude all five from a Phoenix bed, while `rosemary`, the same family from the
 * same region, passes on the `subtropical` archetype's 30 C optimum and 40 C ceiling: an accident
 * of which archetype was assigned. Only that hot limb is borrowed, so no number here is new and
 * none is invented for the occasion: the cold end stays where `hardy-perennial` put it because
 * these five are hardy to -23 C or below on their own `coldC`, and taking the whole `subtropical`
 * envelope instead would move their floor to 8 C, their window to March-November, their minimum
 * soil temperature to 12 C and their Koppen list off the temperate codes, which is the same
 * misclassification pointing the other way
 */
const MEDITERRANEAN_SUBSHRUB_TEMP = [0, 12, 30, 40] as const

/**
 * Curated catalog. Columns are
 * [id, acceptedName, family, commonNames, laubGroup, dliClass, habit,
 *  archetype, dliMin, dliTargetLow, dliTargetHigh, tier, shade, daysToMaturity,
 *  spacingCm, heightM, widthM, overrides?]
 *
 * DLI figures and evidence tiers are transcribed per crop. The majority are Tier C inferences
 * from the crop's sun-hour class, labeled as such and never presented as measurements. Rooting
 * depths marked with an fao56 citation are FAO-56 Table 22 midpoints. The rest fall back to a
 * per-class default
 */
export const CROP_ROWS: readonly CropRow[] = [
  // Fruiting vegetables
  [
    'tomato',
    'Solanum lycopersicum',
    'Solanaceae',
    'tomato',
    'fruity-vegetables',
    'solanaceae',
    'vining-trellised',
    'warm',
    // VCE SPES-720NP Table 3 prints "Tomato 20-30", and Purdue HO-238-B-W's chart marks
    // Lycopersicon at 10 to 12 for minimum acceptable quality, 14 to 20 for good and 22 to 30
    // for high. The 15 is Runkle 2011's vine-crop figure, in a sentence that names no crop, and
    // it stays as the floor. Tier C: none of the three chains ends in a tomato experiment
    15,
    20,
    30,
    'C',
    0,
    80,
    60,
    1.8,
    0.6,
    {
      // weeks of picking: an indeterminate tomato crops from the first ripe
      // fruit to the frost, and the 14-day default (right for a head of lettuce) closed the
      // harvest on September 11 in Hadley six weeks before the frost did. The same rule sets
      // peppers, eggplant, tomatillo, cucumber, summer squash, okra and the beans
      harvestDays: 60,
      zr: 1.1,
      p: 0.4,
      gddBase: 10,
      dtmRef: 'transplant',
      support: 'cage',
      dliCitations: VINE_CROPS,
      dliCaveat: VINE_CROP_CAVEAT,
    },
  ],
  [
    'pepper-sweet',
    'Capsicum annuum',
    'Solanaceae',
    'sweet pepper|bell pepper',
    'fruity-vegetables',
    'solanaceae',
    'bush',
    'warm',
    // Purdue HO-238-B-W gives Capsicum the same three bands as Lycopersicon, cell for cell:
    // 10 to 12 minimum acceptable, 14 to 20 good, 22 to 30 high. VCE Table 3 has no pepper row,
    // so the 20 to 30 is the range it prints for tomato, and the 15 is Runkle's vine-crop
    // figure. Tier C for the same reason as tomato
    15,
    20,
    30,
    'C',
    2,
    75,
    45,
    0.8,
    0.5,
    {
      harvestDays: 60,
      zr: 0.75,
      p: 0.3,
      dtmRef: 'transplant',
      // peppers set out into soil at 65 F (18 C). The warm archetype's 13 C is the tomato
      // rule, and it puts the pepper date about three weeks early in a New England spring
      minSoilTempC: 18,
      dliCitations: VINE_CROPS,
      dliCaveat: VINE_CROP_CAVEAT,
    },
  ],
  [
    'pepper-hot',
    'Capsicum frutescens',
    'Solanaceae',
    'hot pepper|chilli',
    'fruity-vegetables',
    'solanaceae',
    'bush',
    'warm',
    15,
    20,
    30,
    'C',
    1,
    85,
    45,
    0.9,
    0.5,
    {
      harvestDays: 60,
      zr: 0.75,
      p: 0.3,
      dtmRef: 'transplant',
      minSoilTempC: 18,
      dliCitations: VINE_CROPS,
      dliCaveat: VINE_CROP_CAVEAT,
    },
  ],
  [
    'eggplant',
    'Solanum melongena',
    'Solanaceae',
    'eggplant|aubergine',
    'fruity-vegetables',
    'solanaceae',
    'bush',
    'hot',
    14,
    20,
    28,
    'C',
    0,
    85,
    60,
    1,
    0.7,
    { harvestDays: 60, dtmRef: 'transplant' },
  ],
  [
    'tomatillo',
    'Physalis philadelphica',
    'Solanaceae',
    'tomatillo',
    'fruity-vegetables',
    'solanaceae',
    'bush',
    'warm',
    14,
    20,
    28,
    'C',
    0,
    80,
    90,
    1.2,
    1,
    { harvestDays: 60, dtmRef: 'transplant' },
  ],
  [
    'cucumber',
    'Cucumis sativus',
    'Cucurbitaceae',
    'cucumber',
    'fruity-vegetables',
    'cucurbits',
    'vining-trellised',
    'warm',
    // VCE SPES-720NP Table 3 prints "Cucumber 20-30" for the crop itself, and Runkle 2011
    // names cucumber among the vine crops at 15, preferably above 20. Purdue's chart has no
    // cucumber row, so this row doesn't cite it
    15,
    20,
    30,
    'C',
    1,
    55,
    45,
    2,
    0.5,
    {
      harvestDays: 45,
      zr: 0.95,
      p: 0.5,
      dliCitations: ['stallknecht2025-vce-dli', 'runkle2011-vegetable-dli'],
      dliCaveat: VINE_CROP_CAVEAT,
    },
  ],
  [
    'bitter-melon',
    'Momordica charantia',
    'Cucurbitaceae',
    'bitter melon|bitter gourd|balsam pear',
    // dliClass, DLI figures and tier as cucumber, the catalog's other trellised cucurbit, no
    // DLI trial exists for bitter melon itself
    'fruity-vegetables',
    'cucurbits',
    'vining-trellised',
    'warm',
    15,
    20,
    30,
    'C',
    // NC State Extension Plant Toolbox: "Light: Full sun... Partial Shade (Direct sunlight only
    // part of the day, 2-6 hours)"
    1,
    // UF/IFAS HS1271: "Fruit should be started harvesting approximately 50 days after seeding in
    // north Florida". Two other UF/IFAS sheets give 80-100 days and 3-4 months for the same crop,
    // 50 days matches how this catalog dates every other fruiting vine to its first pick, ahead
    // of full fruit maturity (cucumber 55, summer squash 50)
    50,
    // UF/IFAS HS1271: "Distance between rows should be 5 to 6 feet and spacing between plants
    // should be between 3 and 5 feet", row mid 5.5 ft x in-row mid 4 ft, sqrt(5.5 x 4) = 4.69 ft
    143,
    // NC State Extension Plant Toolbox structured Dimensions field: "Height: 12 ft. 0 in. - 20
    // ft. 0 in.", the 16 ft midpoint, the trellised vine's own reach
    4.88,
    // NC State Extension Plant Toolbox: "Width: 3 ft. 0 in. - 6 ft. 0 in.", the 4.5 ft midpoint
    1.37,
    { harvestDays: 45 },
  ],
  [
    'chayote',
    'Sechium edule',
    'Cucurbitaceae',
    'chayote|mirliton',
    // dliClass, DLI figures and tier as cucumber, the catalog's other trellised cucurbit
    'fruity-vegetables',
    'cucurbits',
    'vining-trellised',
    'warm',
    15,
    20,
    30,
    'C',
    // UF/IFAS HS1454: "Chayote can grow in full-sun and partially shaded conditions", LSU
    // AgCenter notes shade cloth "helps keep the plants from wilting" in hot afternoon sun
    2,
    // LSU AgCenter (GNO Gardening, Jan 2017): "typically takes 150 frost free days before the
    // vine will produce", planted from a whole sprouted fruit
    150,
    // UF/IFAS HS579: "Plant one fruit per hill in hills spaced 12 feet apart and in rows spaced
    // 12 feet apart"
    366,
    // UF/IFAS HS1454: "A trellis, usually 6 feet tall... should be placed near the plant"
    1.83,
    // no source gives chayote a spread, the 12 ft hill spacing stands in, as the spacing above
    3.66,
    { dtmRef: 'transplant' },
  ],
  [
    'squash-summer',
    'Cucurbita pepo',
    'Cucurbitaceae',
    'summer squash|zucchini|courgette',
    'fruity-vegetables',
    'cucurbits',
    'bush',
    'warm',
    // VCE Table 3 prints "Zucchini 20-30" and this row carries 18 to 25. The row keeps its numbers
    // and cites nothing
    12,
    18,
    25,
    'C',
    1,
    50,
    90,
    0.8,
    1.2,
    { harvestDays: 50, zr: 0.8, p: 0.5 },
  ],
  [
    'squash-winter',
    'Cucurbita maxima',
    'Cucurbitaceae',
    'winter squash',
    'fruity-vegetables',
    'cucurbits',
    'vining-ground',
    'warm',
    14,
    20,
    28,
    'C',
    0,
    100,
    150,
    0.5,
    3,
    { zr: 0.8, p: 0.5 },
  ],
  [
    'pumpkin',
    'Cucurbita moschata',
    'Cucurbitaceae',
    'pumpkin',
    'fruity-vegetables',
    'cucurbits',
    'vining-ground',
    'warm',
    14,
    20,
    28,
    'C',
    0,
    110,
    180,
    0.5,
    3.5,
    { zr: 0.8, p: 0.5 },
  ],
  [
    'melon',
    'Cucumis melo',
    'Cucurbitaceae',
    'melon|muskmelon|cantaloupe',
    'fruity-vegetables',
    'cucurbits',
    'vining-ground',
    'hot',
    // 20 is the cucurbit class target low. Runkle covers only tomato, pepper and cucumber, and no
    // DLI figure for melon exists in peer-reviewed or Extension literature
    16,
    20,
    30,
    'C',
    0,
    85,
    120,
    0.4,
    2.5,
    { zr: 1.15, p: 0.4 },
  ],
  [
    'watermelon',
    'Citrullus lanatus',
    'Cucurbitaceae',
    'watermelon',
    'fruity-vegetables',
    'cucurbits',
    'vining-ground',
    'hot',
    16,
    20,
    30,
    'C',
    0,
    95,
    150,
    0.4,
    3,
    { zr: 1.1, p: 0.4 },
  ],
  [
    'okra',
    'Abelmoschus esculentus',
    'Malvaceae',
    'okra',
    'fruity-vegetables',
    'cucurbits',
    'upright-herb',
    'hot',
    16,
    20,
    30,
    'C',
    0,
    60,
    45,
    1.5,
    0.6,
    { harvestDays: 60 },
  ],

  // Grain and fresh legumes
  [
    'bean-bush',
    'Phaseolus vulgaris',
    'Fabaceae',
    'bush bean|snap bean',
    'grain-legumes',
    'grain-legumes',
    'bush',
    'warm',
    12,
    18,
    25,
    'C',
    1,
    55,
    15,
    0.5,
    0.3,
    {
      harvestDays: 21,
      zr: 0.6,
      p: 0.45,
      nfix: true,
      succession: 14,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'bean-pole',
    'Phaseolus vulgaris',
    'Fabaceae',
    'pole bean|climbing bean',
    'grain-legumes',
    'grain-legumes',
    'vining-trellised',
    'warm',
    12,
    18,
    25,
    'C',
    1,
    65,
    20,
    2.5,
    0.3,
    {
      harvestDays: 45,
      zr: 0.6,
      p: 0.45,
      nfix: true,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'lima-bean',
    'Phaseolus lunatus',
    'Fabaceae',
    'lima bean|butter bean',
    'grain-legumes',
    'grain-legumes',
    'vining-trellised',
    // dliClass, habit, archetype and DLI figures as bean-pole, the same pole-type habit
    'warm',
    12,
    18,
    25,
    'C',
    // LSU AgCenter Pub. 2309: "Choose a fertile, well-drained area that receives full sunlight",
    // with no shade tolerance stated, unlike bean-pole's own figure
    0,
    // UGA Bulletin 577 planting chart, "Bean, lima" row: "65-75" days, the midpoint
    70,
    // UGA B577 same row: distance between rows 2-2.5 ft, between plants 3-4 in, row mid 2.25 ft
    // (68.58 cm) x in-row mid 3.5 in (8.89 cm), sqrt(68.58 x 8.89) = 24.7 cm
    25,
    // LSU AgCenter Pub. 2309: "Many pole varieties will grow 10-12 feet", the 11 ft midpoint
    3.35,
    // no source gives lima bean a spread, as bean-pole
    0.3,
    {
      // as bean-pole: weeks of picking
      harvestDays: 45,
      // FAO-56 Table 22, "Beans, lima, large vines": Zr 0.8-1.2 m, p 0.45, the 1.0 m midpoint
      zr: 1,
      p: 0.45,
      nfix: true,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'bean-runner',
    'Phaseolus coccineus',
    'Fabaceae',
    'runner bean',
    'grain-legumes',
    'grain-legumes',
    'vining-trellised',
    // frost-tender like the pole bean two rows up: its seed rots in soil that hasn't warmed and
    // the seedling takes no frost, so it's sown after the last spring frost the same as any
    // other tender crop. A cool summer helps it set pods, but that is a temperature envelope for
    // fruit set, and leaves the plant exactly as tender at each end of the season as the bean
    // beside it
    'warm',
    12,
    18,
    25,
    'C',
    1,
    70,
    20,
    2.5,
    0.3,
    {
      nfix: true,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'pea-garden',
    'Pisum sativum',
    'Fabaceae',
    'garden pea|snap pea|snow pea',
    'grain-legumes',
    'grain-legumes',
    'vining-trellised',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    60,
    8,
    1.5,
    0.2,
    {
      zr: 0.8,
      p: 0.35,
      gddBase: 4.5,
      nfix: true,
      succession: 14,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'fava-bean',
    'Vicia faba',
    'Fabaceae',
    'fava bean|broad bean',
    'grain-legumes',
    'grain-legumes',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    90,
    20,
    1.2,
    0.3,
    {
      nfix: true,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'cowpea',
    'Vigna unguiculata',
    'Fabaceae',
    'cowpea|southern pea|black-eyed pea',
    'grain-legumes',
    'grain-legumes',
    'bush',
    'hot',
    14,
    20,
    28,
    'C',
    0,
    70,
    20,
    0.6,
    0.4,
    { harvestDays: 30, nfix: true },
  ],
  [
    'soybean-edamame',
    'Glycine max',
    'Fabaceae',
    'edamame|soybean',
    'grain-legumes',
    'grain-legumes',
    'upright-herb',
    'warm',
    14,
    20,
    28,
    'C',
    0,
    85,
    15,
    0.8,
    0.3,
    {
      nfix: true,
      laubNote: IMMATURE_POD_NOTE,
    },
  ],
  [
    'lentil',
    'Lens culinaris',
    'Fabaceae',
    'lentil',
    'grain-legumes',
    'grain-legumes',
    'upright-herb',
    'cool',
    12,
    18,
    25,
    'C',
    0,
    100,
    10,
    0.4,
    0.2,
    { nfix: true },
  ],
  [
    'chickpea',
    'Cicer arietinum',
    'Fabaceae',
    'chickpea|garbanzo',
    'grain-legumes',
    'grain-legumes',
    'bush',
    'warm',
    14,
    20,
    28,
    'C',
    0,
    100,
    25,
    0.5,
    0.4,
    { nfix: true },
  ],
  [
    'peanut',
    'Arachis hypogaea',
    'Fabaceae',
    'peanut|groundnut',
    'grain-legumes',
    'grain-legumes',
    'bush',
    'hot',
    14,
    20,
    28,
    'C',
    0,
    130,
    30,
    0.5,
    0.6,
    { nfix: true },
  ],

  // Cereals and pseudocereals
  [
    'sweet-corn',
    'Zea mays',
    'Poaceae',
    'sweet corn|maize',
    'corn-c4',
    'corn-c4',
    'clumping-grass',
    'warm',
    // Laub 2022 backs the shade-susceptibility ranking but reports %RSR, so the mol/m2/d values
    // 18 / 25-35 are class-level inferences and the row is Tier C
    18,
    25,
    35,
    'C',
    0,
    80,
    30,
    2.2,
    0.5,
    {
      zr: 1,
      p: 0.5,
      // 6.7 C = 44 F, OSU EM 9305, the only source that fitted SWEET corn: 44 F for fresh-market
      // varieties, 50 F only for processing. NDSU NDAWN's 10 C is for corn generally, and its page
      // never mentions sweet corn. Upper 30 C = 86 F, on which both sources agree
      gddBase: 6.7,
      gddUpper: 30,
      betweenCm: 75,
      laubNote: SWEET_CORN_NOTE,
    },
  ],
  [
    'corn-grain',
    'Zea mays',
    'Poaceae',
    'field corn|grain corn|dent corn',
    // Laub's own corn-c4 group is grain corn: this is what the meta-analysis measured, so unlike
    // sweet-corn (cut at the milk stage) this row carries no laubNote. dliClass, habit, archetype
    // and DLI figures as sweet-corn
    'corn-c4',
    'corn-c4',
    'clumping-grass',
    'warm',
    18,
    25,
    35,
    'C',
    0,
    // UGA 2024 Corn Production Guide Table 8: hybrids of 115 to 119 day relative maturity reach
    // black layer (physiological maturity) 115-119 days after planting, NDSU NDAWN gives the same
    // relative-maturity range for the crop generally. The 117 midpoint
    117,
    // UGA 2024 guide: rows 30-36 in (33 in midpoint, 83.8 cm), irrigated population 28,000-36,000
    // plants/acre translating (Table 4) to 4.5-9 in within-row at that row width (6.75 in
    // midpoint, 17.1 cm). sqrt(83.8 x 17.1) = 37.9 cm
    38,
    // University of Minnesota Extension (Minnesota Crop News, 2026): "traditional corn towers at 9
    // to 12 feet" before newer short-stature hybrids, the 10.5 ft midpoint
    3.2,
    // no source gives field corn a spread, as sweet-corn
    0.5,
    {
      // no gdd override: sweet-corn's 6.7 C base is OSU EM 9305's fresh-market figure, the warm
      // archetype's own 10 C, kept here, is NDSU's general field-corn figure
      // FAO-56 Table 22, "Maize, Field (grain) (field corn)": Zr 1.0-1.7 m, p 0.55, the 1.35 m
      // midpoint
      zr: 1.35,
      p: 0.55,
    },
  ],
  [
    'wheat-spring',
    'Triticum aestivum',
    'Poaceae',
    'spring wheat',
    'c3-cereals',
    'c3-cereals',
    'clumping-grass',
    'cool',
    14,
    20,
    28,
    'C',
    1,
    110,
    12,
    1,
    0.15,
  ],
  [
    'barley',
    'Hordeum vulgare',
    'Poaceae',
    'barley',
    'c3-cereals',
    'c3-cereals',
    'clumping-grass',
    'cool',
    14,
    20,
    28,
    'C',
    1,
    100,
    12,
    0.9,
    0.15,
  ],
  [
    'oat',
    'Avena sativa',
    'Poaceae',
    'oat',
    'c3-cereals',
    'c3-cereals',
    'clumping-grass',
    'cool',
    14,
    20,
    28,
    'C',
    1,
    100,
    12,
    1.1,
    0.15,
  ],
  [
    'rye-cereal',
    'Secale cereale',
    'Poaceae',
    'cereal rye',
    'c3-cereals',
    'c3-cereals',
    'clumping-grass',
    'cool',
    12,
    18,
    26,
    'C',
    1,
    120,
    12,
    1.4,
    0.15,
  ],
  [
    'quinoa',
    'Chenopodium quinoa',
    'Amaranthaceae',
    'quinoa',
    'c3-cereals',
    'c3-cereals',
    'upright-herb',
    'cool',
    14,
    20,
    28,
    'C',
    0,
    110,
    30,
    1.5,
    0.4,
    {
      laubNote: PSEUDOCEREAL_NOTE,
    },
  ],
  [
    'amaranth-grain',
    'Amaranthus cruentus',
    'Amaranthaceae',
    'grain amaranth',
    // Laub's C3-cereals group in Table S1 is wheat, barley, durum wheat and winter wheat. The paper
    // separates its two cereal groups on C3 and C4, and grain amaranth is a C4 species, so it reads
    // the corn curve
    'corn-c4',
    'c3-cereals',
    'upright-herb',
    'hot',
    14,
    20,
    28,
    'C',
    0,
    110,
    30,
    1.8,
    0.5,
  ],
  [
    'goosefoot',
    'Chenopodium berlandieri',
    'Amaranthaceae',
    'goosefoot|pitseed goosefoot',
    'c3-cereals',
    'c3-cereals',
    'upright-herb',
    'cool',
    12,
    18,
    26,
    'C',
    1,
    110,
    30,
    1.2,
    0.4,
    {
      laubNote: PSEUDOCEREAL_NOTE,
    },
  ],
  [
    'sumpweed',
    'Iva annua',
    'Asteraceae',
    'sumpweed|marsh elder',
    'c3-cereals',
    'c3-cereals',
    'upright-herb',
    'warm',
    12,
    18,
    26,
    'C',
    1,
    120,
    40,
    1.5,
    0.5,
    {
      laubNote: OILSEED_NOTE,
    },
  ],
  [
    'flax',
    'Linum usitatissimum',
    'Linaceae',
    'flax|linseed',
    // an oilseed with no Laub group of its own, the C3 seed-crop curve, as sesame and sunflower
    'c3-cereals',
    'c3-cereals',
    'upright-herb',
    'cool',
    // NC State Extension: "It does best in full sun and cannot grow in the shade"
    14,
    20,
    28,
    'C',
    0,
    // NDSU A1038: "a 50-day vegetative period, 25-day flowering period and about 35 days to
    // mature", 50+25+35 = 110
    110,
    // NDSU A1038: "A stand of 70 plants per square foot is desired", sqrt(1/70 ft2) = 0.1195 ft
    // = 3.6 cm
    4,
    // NDSU A1038: "Flax grows to a height of 24 to 36 inches", the 30 in midpoint
    0.76,
    // no source gives flax a spread, as sesame, an erect single-stem annual
    0.3,
    {
      // FAO-56 Table 22, "Flax": Zr 1.0-1.5 m, p 0.50, the 1.25 m midpoint
      zr: 1.25,
      p: 0.5,
      laubNote: OILSEED_NOTE,
    },
  ],
  [
    'canola',
    'Brassica napus',
    'Brassicaceae',
    'canola|rapeseed',
    // the oilseed Laub treatment, as flax, the Brassica light class carries its DLI figures
    'c3-cereals',
    'brassicas',
    'upright-herb',
    'cool',
    10,
    14,
    20,
    'C',
    // no source states a full-sun requirement for canola, as flax, its oilseed-curve sibling
    0,
    // OMAFRA Agronomy Guide ch. 6: "matures in 90-96 days" after emergence, the 93 midpoint
    93,
    // OMAFRA: "optimum plant stand is 75-130 healthy plants/m2", the 102.5 midpoint,
    // sqrt(1/102.5 m2) = 0.0988 m
    10,
    // Purdue AY-272: "reaching a height of 3 to 5 feet", the 4 ft midpoint
    1.22,
    // no source gives canola a spread, as flax, another densely sown erect oilseed annual
    0.3,
    {
      // FAO-56 Table 22, "Rapeseed, Canola": Zr 1.0-1.5 m, p 0.60, the 1.25 m midpoint
      zr: 1.25,
      p: 0.6,
      laubNote: OILSEED_NOTE,
    },
  ],

  // Root, tuber and bulb
  [
    'potato',
    'Solanum tuberosum',
    'Solanaceae',
    'potato',
    'tubers-root-crops',
    'root-tuber',
    'upright-herb',
    'cool',
    // tier B for the shade evidence, which is what Weselek and Laub carry for this crop. The
    // 12 and the 18 to 25 are this app's own band: neither work prints a daily light integral
    12,
    18,
    25,
    'B',
    1,
    100,
    30,
    0.6,
    0.5,
    {
      zr: 0.5,
      p: 0.35,
      maxRsr: 0.5,
      maxRsrTier: 'B',
      maxRsrNote: POTATO_CEILING_NOTE,
      betweenCm: 75,
      dliCitations: ['weselek2021-potato', 'laub2022-shade-meta'],
      dliCaveat: POTATO_CAVEAT,
    },
  ],
  [
    'sweet-potato',
    'Ipomoea batatas',
    'Convolvulaceae',
    'sweet potato',
    'tubers-root-crops',
    'root-tuber',
    'vining-ground',
    'hot',
    14,
    20,
    28,
    'C',
    0,
    110,
    30,
    0.3,
    1.5,
    { zr: 1.25, p: 0.65 },
  ],
  [
    'carrot',
    'Daucus carota',
    'Apiaceae',
    'carrot',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    // the row cites a potato shade trial and the meta-analysis, and neither prints a daily
    // light integral for carrot, so the tier is C
    8,
    14,
    20,
    'C',
    1,
    75,
    6,
    0.35,
    0.15,
    { zr: 0.75, p: 0.35, succession: 21 },
  ],
  [
    'beet',
    'Beta vulgaris',
    'Amaranthaceae',
    'beet|beetroot',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    // as carrot: no cited work prints a daily light integral for beet, so the row is tier C
    8,
    14,
    20,
    'C',
    1,
    60,
    10,
    0.35,
    0.2,
    { succession: 21 },
  ],
  [
    'radish',
    'Raphanus sativus',
    'Brassicaceae',
    'radish',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    6,
    12,
    18,
    'C',
    1,
    28,
    5,
    0.2,
    0.1,
    { zr: 0.4, p: 0.3, succession: 10 },
  ],
  [
    'turnip',
    'Brassica rapa',
    'Brassicaceae',
    'turnip',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    8,
    12,
    18,
    'C',
    1,
    50,
    10,
    0.35,
    0.25,
    { succession: 21 },
  ],
  [
    'rutabaga',
    'Brassica napus',
    'Brassicaceae',
    'rutabaga|swede',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    10,
    14,
    20,
    'C',
    1,
    90,
    20,
    0.4,
    0.3,
  ],
  [
    'parsnip',
    'Pastinaca sativa',
    'Apiaceae',
    'parsnip',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    120,
    10,
    0.4,
    0.2,
    { life: 'biennial' },
  ],
  [
    'celeriac',
    'Apium graveolens',
    'Apiaceae',
    'celeriac|celery root',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    110,
    25,
    0.5,
    0.35,
    { dtmRef: 'transplant' },
  ],
  [
    'kohlrabi',
    'Brassica oleracea',
    'Brassicaceae',
    'kohlrabi',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    55,
    20,
    0.4,
    0.3,
    { succession: 21 },
  ],
  [
    'jerusalem-artichoke',
    'Helianthus tuberosus',
    'Asteraceae',
    'jerusalem artichoke|sunchoke',
    'tubers-root-crops',
    'root-tuber',
    'upright-herb',
    'hardy-perennial',
    12,
    18,
    26,
    'C',
    0,
    130,
    45,
    2.5,
    0.6,
    { life: 'perennial', coldC: -30 },
  ],
  [
    'horseradish',
    'Armoracia rusticana',
    'Brassicaceae',
    'horseradish',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'hardy-perennial',
    8,
    14,
    20,
    'C',
    1,
    150,
    45,
    0.8,
    0.6,
    {
      life: 'perennial',
      coldC: -34,
      // University of Minnesota Extension, for Minnesota (Minneapolis-St Paul): "Horseradish grows
      // the most during late summer and early autumn. For this reason, delay fall harvest until
      // late October or early November, or just before the ground freezes". The median last spring
      // freeze there is Apr 23 at Minneapolis-St Paul International Airport, so picking starts 185
      // days after it and runs 11 days
      harvest: {
        afterFreezeDays: 185,
        citations: ['umn-extension-2024-horseradish', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 11,
    },
  ],
  [
    'ginger',
    'Zingiber officinale',
    'Zingiberaceae',
    'ginger',
    'tubers-root-crops',
    'understory-herbs',
    'rhizomatous',
    'subtropical',
    // as lemon-balm and sorrel, the understory-herbs rows with no DLI trial of their own
    4,
    8,
    14,
    'C',
    // UF/IFAS Gardening Solutions: "Edible ginger does best in partial shade... More than a
    // couple hours in the sun is too much, the plants will grow poorly"
    2,
    // UF/IFAS Gardening Solutions: "considered a long-season crop and takes about eight to ten
    // months to produce fully developed rhizomes", the 9-month (270-day) midpoint, counted from
    // planting the rhizome piece
    270,
    // UF/IFAS Gardening Solutions: "Space pieces about 15 inches apart"
    38,
    // NC State Extension Plant Toolbox: "Height: 2 ft. 0 in. - 4 ft. 0 in.", the 3 ft midpoint
    0.91,
    // NC State Extension Plant Toolbox: "Width: 2 ft. 0 in. - 3 ft. 0 in.", the 2.5 ft midpoint
    0.76,
    {
      // grown from a rhizome piece through one season
      life: 'annual',
      dtmRef: 'transplant',
      // NC State Extension Plant Toolbox: "thrives in zones 9-12", the zone 9a floor
      coldC: -6.7,
      // ECOCROP sheet 2177: temperature 13 / 19-29 / 35 C, rainfall 700 / 1400-3000 / 4000 mm,
      // pH 4.3 / 6-7 / 7.5, cycle 270 to 365 days
      temp: [13, 19, 29, 35],
      rain: [700, 1400, 3000, 4000],
      ph: [4.3, 6, 7, 7.5],
      cycle: [270, 365],
      // ECOCROP sheet 2177 climate zones: Aw, Ar, Cf
      koppen: [...AW, ...AR, ...CF],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'turmeric',
    'Curcuma longa',
    'Zingiberaceae',
    'turmeric',
    'tubers-root-crops',
    'root-tuber',
    'rhizomatous',
    'subtropical',
    // as potato, the root-tuber row closest to a full-sun preference
    12,
    18,
    25,
    'C',
    // NC State Extension Plant Toolbox: "full sun in the morning and afternoon shade", CTAHR's
    // VC-9 adds the crop "tolerates up to 40% shade"
    1,
    // UF/IFAS EP638: "Ginger and turmeric rhizomes harvested approximately seven months after
    // planting... are suitable for curing and selling in retail", 7 months = 210 days
    210,
    // UF/IFAS Gardening Solutions: "Space them 15 inches in the row and 15 inches between the
    // row"
    38,
    // NC State Extension Plant Toolbox: "Height: 3 ft. 0 in. - 4 ft. 0 in.", the 3.5 ft midpoint
    1.07,
    // NC State Extension Plant Toolbox: "Width: 3 ft. 0 in. - 4 ft. 0 in.", the same 3.5 ft
    // figure
    1.07,
    {
      life: 'annual',
      dtmRef: 'transplant',
      // NC State Extension Plant Toolbox: "The USDA Hardiness Zones are 8-11", the zone 8a floor
      coldC: -12.2,
      // CTAHR's VC-9 Hawaii Turmeric Production Guidelines states turmeric "tolerates up to 40%
      // shade". No trial measured a yield response behind that figure, so it stays Tier C, and
      // the class's own citation (Laub) says nothing about turmeric: CTAHR is named in the note
      // text only, because this field can't redirect the formal citation
      maxRsr: 0.4,
      maxRsrTier: 'C',
      maxRsrNote:
        'CTAHR’s VC-9 Hawaii Turmeric Production Guidelines states the crop "tolerates up to 40% shade." No trial measured a yield response behind that figure',
      // ECOCROP sheet 828: temperature 18 / 20-28 / 32 C, rainfall 800 / 1000-2000 / 3000 mm,
      // pH 5.5 / 6-7 / 7.5, cycle 270 to 300 days
      temp: [18, 20, 28, 32],
      rain: [800, 1000, 2000, 3000],
      ph: [5.5, 6, 7, 7.5],
      cycle: [270, 300],
      // ECOCROP sheet 828 climate zones: Aw, Ar, Cs
      koppen: [...AW, ...AR, ...CS],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'onion-bulb',
    'Allium cepa',
    'Amaryllidaceae',
    'bulb onion',
    'tubers-root-crops',
    'alliums',
    'upright-herb',
    'cool',
    14,
    20,
    28,
    'C',
    0,
    110,
    12,
    0.5,
    0.15,
    { zr: 0.45, p: 0.3, k: 0.35 },
  ],
  [
    'shallot',
    'Allium cepa',
    'Amaryllidaceae',
    'shallot',
    'tubers-root-crops',
    'alliums',
    'upright-herb',
    'cool',
    12,
    18,
    25,
    'C',
    0,
    100,
    15,
    0.4,
    0.15,
    { synonyms: ['Allium cepa Aggregatum group'], k: 0.35 },
  ],
  [
    'garlic',
    'Allium sativum',
    'Amaryllidaceae',
    'garlic',
    'tubers-root-crops',
    'alliums',
    'upright-herb',
    'cool',
    12,
    18,
    25,
    'C',
    0,
    // planted as cloves in autumn and lifted the following summer: most of these 270 days pass
    // dormant underground over winter, while a spring-sown crop spends its days to maturity
    // growing. 240 (a spring-sown figure some seed catalogs quote for the same species) would put
    // this bed's harvest in the same season as sowing, which a garlic clove planted in October
    // never is
    270,
    15,
    0.6,
    0.15,
    {
      zr: 0.4,
      p: 0.3,
      k: 0.35,
      // 'alliums' otherwise reads as onion and leek, sown in spring against the LAST spring freeze
      // like the rest of this dliClass. Garlic is planted the previous autumn, so its `window` runs
      // Oct-Jul (every other allium here gets a spring-to-summer span), and `sow` pins the
      // calendar's window directly: see `recommend/calendar.ts`, where an explicit sow window
      // overrides the spring-freeze anchor and the frost-free-season check that would otherwise
      // measure a fall-sown, next-summer crop against the wrong season and either date it in winter
      // or refuse it outright. `frostOffset` is left at the 'cool' archetype's -14: its only
      // remaining job is its sign, which reads as frost-hardy and keeps the harvest window from
      // being cut short by this same autumn's first freeze
      window: [10, 7],
      sow: [280, 296],
    },
  ],
  [
    'leek',
    'Allium ampeloprasum',
    'Amaryllidaceae',
    'leek',
    'tubers-root-crops',
    'alliums',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    120,
    15,
    0.7,
    0.2,
    { k: 0.35, dtmRef: 'transplant' },
  ],
  [
    'scallion',
    'Allium fistulosum',
    'Amaryllidaceae',
    'scallion|bunching onion|spring onion',
    'tubers-root-crops',
    'alliums',
    'upright-herb',
    'cool',
    6,
    12,
    18,
    'C',
    1,
    60,
    5,
    0.4,
    0.1,
    { k: 0.35, succession: 21 },
  ],
  [
    'chives',
    'Allium schoenoprasum',
    'Amaryllidaceae',
    'chives',
    'leafy-vegetables',
    'alliums',
    'clumping-grass',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    1,
    80,
    20,
    0.35,
    0.25,
    {
      life: 'perennial',
      coldC: -34,
      // University of Illinois Extension: "Harvest chives throughout the season to prevent the
      // leaves from becoming tough and to encourage formation of new bulblets"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-chives'] },
    },
  ],

  // Leafy greens
  [
    'lettuce-leaf',
    'Lactuca sativa',
    'Asteraceae',
    'leaf lettuce|loose-leaf lettuce',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    // 5.8 is the lowest level in Pennisi et al. 2020 (100 µmol/m2/s for 16 h) at which lettuce
    // still produced a crop. Kelly et al. 2020 grew the oakleaf 'Rouxai' from 6.9. 14.4 is Pennisi
    // et al.'s optimum, past which yield stopped rising at 17.3, and 17 is the Cornell CEA target
    // (Both et al. 1997, read in Brechner and Both 2013). Tier A: three per-crop trials, none
    // placing a failure point, which LETTUCE_CAVEAT says beside the number
    5.8,
    14.4,
    17,
    'A',
    2,
    45,
    20,
    0.25,
    0.25,
    {
      zr: 0.4,
      p: 0.3,
      ceiling: 17,
      succession: 14,
      dliCitations: LETTUCE,
      dliCaveat: LETTUCE_CAVEAT,
    },
  ],
  [
    'lettuce-head',
    'Lactuca sativa',
    'Asteraceae',
    'head lettuce|romaine|cos',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    // The leaf row's figures: Kelly et al. 2020 grew the butterhead 'Rex' from 6.9 alongside
    // 'Rouxai', Pennisi et al. 2020 name no cultivar, and the Cornell 17 was set on boston bibb, a
    // head type
    5.8,
    14.4,
    17,
    'A',
    2,
    65,
    30,
    0.3,
    0.3,
    {
      zr: 0.4,
      p: 0.3,
      ceiling: 17,
      succession: 14,
      dliCitations: LETTUCE,
      dliCaveat: LETTUCE_CAVEAT,
    },
  ],
  [
    'spinach',
    'Spinacia oleracea',
    'Amaranthaceae',
    'spinach',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    // VCE SPES-720NP Table 3 prints "Spinach 14-20" for the crop itself, which is this row's
    // target. Gao et al. 2020 (gao2020-spinach-dli) grew hydroponic spinach at 11.5, 14.4, 17.3
    // and 20.2 mol/m2/d and found the optimum at 17.3, a plant-factory setting that places no
    // minimum, so the 6 floor stays this app's own
    6,
    14,
    20,
    'C',
    2,
    42,
    15,
    0.25,
    0.2,
    {
      zr: 0.4,
      p: 0.2,
      succession: 14,
      dliCitations: VCE,
      dliCaveat: SPINACH_CAVEAT,
    },
  ],
  [
    'swiss-chard',
    'Beta vulgaris',
    'Amaranthaceae',
    'swiss chard|silverbeet',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    6,
    12,
    18,
    'C',
    2,
    55,
    25,
    0.5,
    0.35,
    { synonyms: ['Beta vulgaris subsp. vulgaris Cicla group'], harvestDays: 90 },
  ],
  [
    'kale',
    'Brassica oleracea',
    'Brassicaceae',
    'kale|borecole',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    // the row cites a potato shade trial and the meta-analysis for a figure neither of them
    // prints for kale, so the tier is C
    6,
    12,
    18,
    'C',
    2,
    60,
    40,
    0.7,
    0.5,
    { synonyms: ['Brassica oleracea Acephala group'], harvestDays: 90 },
  ],
  [
    'collards',
    'Brassica oleracea',
    'Brassicaceae',
    'collards|collard greens',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    6,
    12,
    18,
    'C',
    1,
    70,
    45,
    0.8,
    0.6,
    { harvestDays: 90 },
  ],
  [
    'mustard-greens',
    'Brassica juncea',
    'Brassicaceae',
    'mustard greens|brown mustard',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    6,
    12,
    18,
    'C',
    1,
    45,
    20,
    0.5,
    0.3,
    { succession: 14 },
  ],
  [
    'arugula',
    'Eruca vesicaria',
    'Brassicaceae',
    'arugula|rocket',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    5,
    10,
    16,
    'C',
    2,
    35,
    12,
    0.25,
    0.2,
    { succession: 10 },
  ],
  [
    'mizuna',
    'Brassica rapa',
    'Brassicaceae',
    'mizuna',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    5,
    10,
    16,
    'C',
    2,
    40,
    20,
    0.3,
    0.3,
    { synonyms: ['Brassica rapa var. nipposinica'], succession: 14 },
  ],
  [
    'tatsoi',
    'Brassica rapa',
    'Brassicaceae',
    'tatsoi',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    5,
    10,
    16,
    'C',
    2,
    45,
    20,
    0.2,
    0.25,
    { synonyms: ['Brassica rapa var. rosularis'], succession: 14 },
  ],
  [
    'bok-choy',
    'Brassica rapa',
    'Brassicaceae',
    'bok choy|pak choi',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    6,
    12,
    18,
    'C',
    2,
    50,
    20,
    0.3,
    0.25,
    { synonyms: ['Brassica rapa Chinensis group'], succession: 14 },
  ],
  [
    'endive',
    'Cichorium endivia',
    'Asteraceae',
    'endive|escarole',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    6,
    12,
    17,
    'C',
    2,
    80,
    30,
    0.3,
    0.35,
  ],
  [
    'radicchio',
    'Cichorium intybus',
    'Asteraceae',
    'radicchio|chicory',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool',
    6,
    12,
    17,
    'C',
    1,
    85,
    25,
    0.3,
    0.3,
  ],
  [
    'celery',
    'Apium graveolens',
    'Apiaceae',
    'celery',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    120,
    25,
    0.6,
    0.3,
    { dtmRef: 'transplant', p: 0.2 },
  ],
  [
    'nz-spinach',
    'Tetragonia tetragonoides',
    'Aizoaceae',
    'New Zealand spinach',
    'leafy-vegetables',
    'leafy-greens',
    'vining-ground',
    'warm',
    8,
    14,
    20,
    'C',
    1,
    60,
    45,
    0.4,
    1,
    { harvestDays: 90 },
  ],
  [
    'malabar-spinach',
    'Basella alba',
    'Basellaceae',
    'malabar spinach|ceylon spinach',
    // dliClass, laubGroup, archetype and DLI figures as nz-spinach, the catalog's other
    // warm-season leaf vine
    'leafy-vegetables',
    'leafy-greens',
    'vining-trellised',
    'warm',
    8,
    14,
    20,
    'C',
    // UF/IFAS HS1371: "While full-sun cultivation does not harm plants, partial shade may be
    // beneficial by facilitating development of larger and more succulent leaves"
    2,
    // UF/IFAS HS1371: "reaches maturity around 70 days from seed in optimal conditions"
    70,
    // University of Kentucky CCD-CP-130: "direct seeded in rows spaced 1 foot apart, with seeds
    // spaced 1 to 2 inches and thinned to 6 inches between plants", sqrt(12 in x 6 in) = 8.5 in
    22,
    // UF/IFAS HS1371: "a fast-growing vine that can grow six feet or even longer", trellised
    1.83,
    // NC State Extension Plant Toolbox: "Width: 2 ft. 0 in. - 3 ft. 0 in.", the 2.5 ft midpoint
    0.76,
    { harvestDays: 90 },
  ],
  [
    'sorrel',
    'Rumex acetosa',
    'Polygonaceae',
    'sorrel|garden sorrel',
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool-perennial',
    4,
    8,
    14,
    'C',
    2,
    60,
    30,
    0.4,
    0.3,
    {
      life: 'perennial',
      coldC: -34,
      // University of Minnesota Extension: "Once the plants are established, you can harvest sorrel
      // at any time from early spring until frost kills the growth"
      harvest: { wholeSeason: true, citations: ['umn-extension-2024-sorrel'] },
    },
  ],
  [
    'mache',
    'Valerianella locusta',
    'Caprifoliaceae',
    'mache|corn salad|lambs lettuce',
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool',
    4,
    8,
    14,
    'C',
    2,
    60,
    10,
    0.12,
    0.12,
    { window: [2, 5], succession: 14 },
  ],
  [
    'claytonia',
    'Claytonia perfoliata',
    'Montiaceae',
    "claytonia|miner's lettuce",
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool',
    3,
    6,
    12,
    'C',
    2,
    50,
    12,
    0.15,
    0.15,
    { window: [2, 5] },
  ],
  [
    'watercress',
    'Nasturtium officinale',
    'Brassicaceae',
    'watercress',
    'leafy-vegetables',
    'understory-herbs',
    'groundcover',
    'cool-perennial',
    4,
    8,
    14,
    'C',
    2,
    55,
    20,
    0.2,
    0.4,
    {
      life: 'perennial',
      coldC: -20,
      // Utah State University Extension: "Harvest dime sized dark green leaves at any time during
      // the year. ... Watercress can be harvested year round". The source says it's picked year
      // round, longer than the frost-free season used here
      harvest: { wholeSeason: true, citations: ['usu-extension-2020-watercress'] },
    },
  ],
  [
    'orach',
    'Atriplex hortensis',
    'Amaranthaceae',
    'orach|mountain spinach',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    6,
    12,
    18,
    'C',
    1,
    50,
    30,
    1.2,
    0.4,
  ],
  [
    'purslane',
    'Portulaca oleracea',
    'Portulacaceae',
    'purslane',
    'leafy-vegetables',
    'leafy-greens',
    'groundcover',
    'warm',
    6,
    12,
    18,
    'C',
    1,
    50,
    20,
    0.15,
    0.4,
  ],
  [
    'good-king-henry',
    'Blitum bonus-henricus',
    'Amaranthaceae',
    'good king henry',
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool-perennial',
    4,
    8,
    14,
    'C',
    2,
    90,
    40,
    0.5,
    0.4,
    { life: 'perennial', coldC: -30 },
  ],
  [
    'sea-kale',
    'Crambe maritima',
    'Brassicaceae',
    'sea kale',
    'leafy-vegetables',
    'brassicas',
    'rosette',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    1,
    200,
    60,
    0.7,
    0.8,
    {
      life: 'perennial',
      coldC: -25,
      // USDA Northeast SARE (Sustainable Agriculture Research and Education), with University of
      // Vermont Extension as technical advisor, for Vermont (represented by Burlington): "Seakale
      // provides a harvest of shoot (in May) and broccoli florets (in early June), which presents
      // farmers with an opportunity to functionally integrate Seakale into their cropping when
      // there are few other crops available for harvest". The median last spring freeze there is 29
      // Apr at Burlington International Airport, VT, so picking starts 2 days after it and runs 30
      // days. A USDA SARE farmer grant report with University of Vermont Extension as technical
      // adviser, and it gives the harvest as the bare month of May
      harvest: {
        afterFreezeDays: 2,
        citations: ['sare-2021-sea-kale', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 30,
    },
  ],

  // Heading brassicas
  [
    'cabbage',
    'Brassica oleracea',
    'Brassicaceae',
    'cabbage',
    'leafy-vegetables',
    'brassicas',
    'rosette',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    85,
    40,
    0.4,
    0.5,
    {
      zr: 0.65,
      p: 0.45,
      synonyms: ['Brassica oleracea Capitata group'],
      dtmRef: 'transplant',
    },
  ],
  [
    'broccoli',
    'Brassica oleracea',
    'Brassicaceae',
    'broccoli',
    'leafy-vegetables',
    'brassicas',
    'upright-herb',
    'cool',
    10,
    14,
    20,
    'C',
    1,
    70,
    45,
    0.6,
    0.5,
    {
      zr: 0.5,
      p: 0.45,
      synonyms: ['Brassica oleracea Italica group'],
      dtmRef: 'transplant',
    },
  ],
  [
    'cauliflower',
    'Brassica oleracea',
    'Brassicaceae',
    'cauliflower',
    'leafy-vegetables',
    'brassicas',
    'upright-herb',
    'cool',
    10,
    14,
    20,
    'C',
    1,
    80,
    50,
    0.6,
    0.6,
    { synonyms: ['Brassica oleracea Botrytis group'], dtmRef: 'transplant' },
  ],
  [
    'brussels-sprouts',
    'Brassica oleracea',
    'Brassicaceae',
    'brussels sprouts',
    'leafy-vegetables',
    'brassicas',
    'upright-herb',
    'cool',
    10,
    16,
    22,
    'C',
    1,
    110,
    60,
    0.9,
    0.6,
    {
      synonyms: ['Brassica oleracea Gemmifera group'],
      dtmRef: 'transplant',
      // a fall crop wherever it is grown as an annual: the sprouts form in cool weather and sweeten
      // after frost, so Extension sheets for the northeast sow it in late May and transplant in
      // June for an October harvest. Dated from the spring, it would be transplanted in early April
      // and harvested in the July heat
      fallHarvest: true,
    },
  ],
  [
    'napa-cabbage',
    'Brassica rapa',
    'Brassicaceae',
    'napa cabbage|chinese cabbage',
    'leafy-vegetables',
    'brassicas',
    'rosette',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    70,
    35,
    0.4,
    0.4,
    { synonyms: ['Brassica rapa Pekinensis group'] },
  ],
  [
    'romanesco',
    'Brassica oleracea',
    'Brassicaceae',
    'romanesco',
    'leafy-vegetables',
    'brassicas',
    'upright-herb',
    'cool',
    10,
    14,
    20,
    'C',
    1,
    90,
    50,
    0.6,
    0.6,
    { dtmRef: 'transplant' },
  ],

  // Herbs
  [
    'basil',
    'Ocimum basilicum',
    'Lamiaceae',
    'basil|sweet basil',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'warm',
    // 12.9 is the production level Dou et al. 2018 suggest, the lowest of their five (9.3 to 17.8)
    // at which yield and quality were both high. 14.4 is Pennisi et al. 2020's optimum for basil as
    // for lettuce, and 17.8 is the top of Dou et al.'s range, where shoot mass was highest. Tier A:
    // BASIL_CAVEAT carries what each figure is
    12.9,
    14.4,
    17.8,
    'A',
    1,
    60,
    25,
    0.6,
    0.4,
    {
      harvestDays: 90,
      succession: 21,
      dliCitations: BASIL,
      dliCaveat: BASIL_CAVEAT,
    },
  ],
  [
    'parsley',
    'Petroselinum crispum',
    'Apiaceae',
    'parsley',
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool',
    // VCE Table 3 prints "Parsley 10-15" and this row carries 10 to 16, so it cites nothing:
    // the number is close to the printed one and isn't it
    5,
    10,
    16,
    'C',
    2,
    75,
    20,
    0.35,
    0.3,
    { life: 'biennial', harvestDays: 120 },
  ],
  [
    'cilantro',
    'Coriandrum sativum',
    'Apiaceae',
    'cilantro|coriander',
    'leafy-vegetables',
    'understory-herbs',
    'upright-herb',
    'cool',
    // VCE Table 3 prints "Cilantro 15-20" and this row carries 10 to 16, a lower band for a crop
    // grown for leaf. The row keeps its numbers and cites nothing
    5,
    10,
    16,
    'C',
    2,
    45,
    15,
    0.5,
    0.2,
    { succession: 14 },
  ],
  [
    'dill',
    'Anethum graveolens',
    'Apiaceae',
    'dill',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    10,
    16,
    22,
    'C',
    0,
    60,
    25,
    1,
    0.3,
    { succession: 21 },
  ],
  [
    'mint',
    'Mentha spicata',
    'Lamiaceae',
    'mint|spearmint',
    'leafy-vegetables',
    'understory-herbs',
    'rhizomatous',
    'cool-perennial',
    4,
    8,
    14,
    'C',
    2,
    70,
    40,
    0.6,
    0.9,
    {
      life: 'perennial',
      coldC: -29,
      // University of Missouri Extension: "Leaves and stems may be picked anytime"
      harvest: { wholeSeason: true, citations: ['rothenberger-mu-g6470-growing-herbs'] },
    },
  ],
  [
    'oregano',
    'Origanum vulgare',
    'Lamiaceae',
    'oregano',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'hardy-perennial',
    12,
    18,
    25,
    'C',
    0,
    90,
    30,
    0.5,
    0.5,
    {
      life: 'perennial',
      coldC: -23,
      temp: MEDITERRANEAN_SUBSHRUB_TEMP,
      harvestDays: 120,
    },
  ],
  [
    'lemongrass',
    'Cymbopogon citratus',
    'Poaceae',
    'lemongrass',
    // no crop in the nine groups is harvested as a cut stalk, so this is an analogy this app
    // chose. dliClass, DLI figures and tier as oregano, a full-sun leafy-greens herb
    'leafy-vegetables',
    'leafy-greens',
    'clumping-grass',
    'subtropical',
    12,
    18,
    25,
    'C',
    // UF/IFAS EP618 Table 1: "Light needs: Partial-full sun"
    1,
    // grown as a frost-tender perennial clump, the column is unused once `life` is set to
    // perennial below, and 365 marks a full growing season
    365,
    // UF/IFAS EP618: "planting them about 4' apart, center-to-center"
    122,
    // UF/IFAS EP618: "growing to approximately 6' tall"
    1.83,
    // UF/IFAS EP618: "4' wide"
    1.22,
    {
      life: 'perennial',
      // USU Extension: "Typically plants will produce several harvestable stalks by the end of
      // the summer", from divisions set out that same spring
      yearsToMature: 1,
      // UF/IFAS EP618 Table 1: "Hardiness zones: 9-11", the zone 9a floor
      coldC: -6.7,
      // USU Extension: "lemongrass can be harvested at any time, once the plant stalks have
      // reached 1/2 inch thick"
      harvest: { wholeSeason: true, citations: ['usu-2020-lemongrass'] },
      laubNote: NO_COMPARABLE_CROP_NOTE,
    },
  ],
  [
    'lavender',
    'Lavandula angustifolia',
    'Lamiaceae',
    'lavender|english lavender',
    // laubGroup, dliClass, DLI figures, tier and the woody-perennial MEDITERRANEAN_SUBSHRUB_TEMP
    // treatment as sage, the catalog's other woody Mediterranean subshrub
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'hardy-perennial',
    12,
    18,
    25,
    'C',
    // USU Extension: "Grow in full sun", no source mentions shade tolerance
    0,
    // USU Extension: lavender "takes 3 years to reach full size", its own first-year flowers are
    // clipped off (below), so 730 (2 years) marks the column pending that first harvest
    730,
    // USU Extension: "Space lavender plants 18-24 inches apart", the 21 in midpoint
    53,
    // USU Extension: "Lavender grows about 1-2 feet tall and wide depending on variety", the
    // 1.5 ft midpoint
    0.46,
    // same sentence: "1-2 feet... wide"
    0.46,
    {
      life: 'woody-perennial',
      deciduous: false,
      temp: MEDITERRANEAN_SUBSHRUB_TEMP,
      // Washington State University EB2005: "Lavandula angustifolia... can survive winter
      // temperatures of -15C (5F)"
      coldC: -15,
      // USU Extension: "During the first year, branches should be clipped to keep them from
      // flowering", implying first harvest in year two
      yearsToMature: 2,
      // Penn State Extension: "Harvest is accomplished by hand and can occur throughout the
      // summer months", read as June to August at State College, PA (USC00368449), where the
      // median last spring freeze is Apr 20: picking starts 42 days after it (Jun 1) and runs
      // 91 days (to Aug 31)
      harvest: {
        afterFreezeDays: 42,
        citations: ['psu-2026-agritourism-lavender', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 91,
    },
  ],
  [
    'chamomile',
    'Matricaria chamomilla',
    'Asteraceae',
    'chamomile|german chamomile',
    // dliClass, laubGroup, archetype, habit, DLI figures and tier as calendula
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    // NC State Extension Plant Toolbox: "Full sun (6 or more hours of direct sunlight a day)",
    // as calendula
    1,
    // Purdue NewCrop fact sheet: German chamomile has a "short, two-month growing season", read
    // as a season length and used as days to harvest, the 60-day midpoint
    60,
    // Virginia Cooperative Extension 426-420, "Herb Culture and Use" table: "6-12\"" spacing for
    // chamomile, the 9 in midpoint
    23,
    // Purdue NewCrop: German chamomile "reaches a height of about 0.3 meter"
    0.3,
    // NC State Extension Plant Toolbox: "Width: 0 ft. 6 in. - 2 ft. 0 in.", the 15 in midpoint
    0.38,
  ],
  [
    'thyme',
    'Thymus vulgaris',
    'Lamiaceae',
    'thyme',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'hardy-perennial',
    12,
    18,
    25,
    'C',
    0,
    90,
    30,
    0.3,
    0.4,
    {
      life: 'perennial',
      coldC: -23,
      temp: MEDITERRANEAN_SUBSHRUB_TEMP,
      // University of Illinois Extension: "Stems of thyme can be cut through the season but is best
      // cut just before the plant starts to flower"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-thyme'] },
    },
  ],
  [
    'rosemary',
    'Salvia rosmarinus',
    'Lamiaceae',
    'rosemary',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'subtropical',
    14,
    20,
    28,
    'C',
    0,
    200,
    60,
    1.2,
    1,
    {
      life: 'woody-perennial',
      coldC: -12,
      deciduous: false,
      // University of Illinois Extension: "The tender tips and foliage can be cut as needed
      // throughout the growing season"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-rosemary'] },
    },
  ],
  [
    'sage',
    'Salvia officinalis',
    'Lamiaceae',
    'sage|common sage',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'hardy-perennial',
    12,
    18,
    25,
    'C',
    0,
    120,
    50,
    0.7,
    0.8,
    {
      life: 'woody-perennial',
      coldC: -23,
      temp: MEDITERRANEAN_SUBSHRUB_TEMP,
      deciduous: false,
      // University of Illinois Extension: "Leaves can be harvested through the season as needed"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-sage'] },
    },
  ],
  [
    'tarragon',
    'Artemisia dracunculus',
    'Asteraceae',
    'tarragon|french tarragon',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'hardy-perennial',
    8,
    14,
    20,
    'C',
    1,
    100,
    45,
    0.8,
    0.5,
    {
      life: 'perennial',
      coldC: -29,
      // University of Illinois Extension: "Young stem tips and leaves can be harvested as needed
      // throughout the season"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-tarragon-french'] },
    },
  ],
  [
    'lemon-balm',
    'Melissa officinalis',
    'Lamiaceae',
    'lemon balm',
    'leafy-vegetables',
    'understory-herbs',
    'bush',
    'cool-perennial',
    4,
    8,
    14,
    'C',
    2,
    80,
    40,
    0.7,
    0.6,
    {
      life: 'perennial',
      coldC: -29,
      // University of Illinois Extension: "Stems can be cut as needed anytime during the season
      // preferably before flowering"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-lemon-balm'] },
    },
  ],
  [
    'lovage',
    'Levisticum officinale',
    'Apiaceae',
    'lovage',
    'leafy-vegetables',
    'understory-herbs',
    'upright-herb',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    1,
    120,
    60,
    1.8,
    0.9,
    {
      life: 'perennial',
      coldC: -34,
      // University of Illinois Extension: "Leaves and stems can be used fresh anytime they are
      // needed"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-lovage'] },
    },
  ],
  [
    'marjoram',
    'Origanum majorana',
    'Lamiaceae',
    'marjoram|sweet marjoram',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'warm',
    12,
    18,
    25,
    'C',
    0,
    80,
    25,
    0.4,
    0.35,
    { harvestDays: 90 },
  ],
  [
    'fennel-bulb',
    'Foeniculum vulgare',
    'Apiaceae',
    'fennel|florence fennel',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    12,
    18,
    25,
    'C',
    0,
    90,
    25,
    1,
    0.4,
  ],
  [
    'shiso',
    'Perilla frutescens',
    'Lamiaceae',
    'shiso|perilla',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'warm',
    6,
    12,
    18,
    'C',
    1,
    70,
    30,
    0.8,
    0.4,
    { harvestDays: 80 },
  ],
  [
    'chervil',
    'Anthriscus cerefolium',
    'Apiaceae',
    'chervil',
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool',
    3,
    6,
    12,
    'C',
    2,
    50,
    15,
    0.4,
    0.2,
    { succession: 14 },
  ],
  [
    'summer-savory',
    'Satureja hortensis',
    'Lamiaceae',
    'summer savory',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'warm',
    12,
    18,
    25,
    'C',
    0,
    65,
    20,
    0.4,
    0.25,
  ],
  [
    'bay-laurel',
    'Laurus nobilis',
    'Lauraceae',
    'bay laurel|sweet bay',
    'fruits',
    'leafy-greens',
    'columnar-tree',
    'subtropical',
    8,
    14,
    22,
    'C',
    1,
    1000,
    200,
    4,
    2.5,
    {
      life: 'woody-perennial',
      coldC: -9,
      deciduous: false,
      yearsToMature: 8,
      // University of Illinois Extension: "Leaves can be harvested throughout the season as needed"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-bay-laurel'] },
    },
  ],
  [
    'winter-savory',
    'Satureja montana',
    'Lamiaceae',
    'winter savory',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'hardy-perennial',
    12,
    18,
    25,
    'C',
    0,
    120,
    30,
    0.4,
    0.4,
    {
      life: 'perennial',
      coldC: -23,
      temp: MEDITERRANEAN_SUBSHRUB_TEMP,
      // University of Illinois Extension: "Young shoots and leaves can be harvested throughout the
      // growing season"
      harvest: { wholeSeason: true, citations: ['illinois-extension-herbs-savory-winter'] },
    },
  ],
  [
    'hyssop',
    'Hyssopus officinalis',
    'Lamiaceae',
    'hyssop',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'hardy-perennial',
    12,
    18,
    25,
    'C',
    0,
    120,
    40,
    0.6,
    0.5,
    { life: 'perennial', coldC: -29, temp: MEDITERRANEAN_SUBSHRUB_TEMP },
  ],
  [
    'anise-hyssop',
    'Agastache foeniculum',
    'Lamiaceae',
    'anise hyssop',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'hardy-perennial',
    10,
    16,
    24,
    'C',
    1,
    120,
    45,
    0.9,
    0.5,
    {
      life: 'perennial',
      coldC: -34,
      // University of Wisconsin-Madison Division of Extension: "The best time to harvest foliage to
      // dry is when the flowers are just past full bloom, as the oil content in the leaves is the
      // highest at that time, but they can be used at any time"
      harvest: { wholeSeason: true, citations: ['mahr-2025-anise-hyssop'] },
    },
  ],

  // Fruits and perennial crops
  [
    'strawberry',
    'Fragaria x ananassa',
    'Rosaceae',
    'strawberry',
    'berries',
    'strawberry',
    'rosette',
    'cool-perennial',
    // 25 is Widmer 2026 verbatim: the DLI at which the standardized yield regression
    // crosses zero, the level that maintains trial-average yield. It's a design convention
    // and no physiological failure threshold. The 30 at the top of the band is where the Ohio
    // State Kubota Lab's greenhouse guidance says plants tend to be stressed, and the same page
    // gives 12 as a greenhouse-productivity minimum and 20-25 as the optimum, a different
    // quantity from Widmer's agrivoltaic 25, which is the one the gate uses (Decision Record
    // 23). The tier is B: Widmer is a four-year study of 21 cases and states its figure in the
    // unit this row carries
    25,
    25,
    30,
    'B',
    2,
    365,
    35,
    0.25,
    0.4,
    {
      life: 'perennial',
      coldC: -25,
      yearsToMature: 2,
      // the 0.10 ceiling and its tier live on the strawberry class in `schema.ts`, and this row is
      // the class's only member, so the number is kept in one place
      dliCitations: ['widmer-strawberry-dli', 'kubota-osu-strawberry-dli'],
      dliCaveat: STRAWBERRY_CAVEAT,
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): "June-bearing
      // strawberries produce a large, concentrated crop in mid-June to early July". The median last
      // spring freeze there is Apr 23 at Minneapolis-St Paul Intl AP, MN, so picking starts 53 days
      // after it and runs 20 days
      harvest: {
        afterFreezeDays: 53,
        citations: ['umn-extension-2024-strawberries', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 20,
    },
  ],
  [
    'raspberry',
    'Rubus idaeus',
    'Rosaceae',
    'raspberry',
    'berries',
    'cane-bush-berries',
    'caned',
    'cool-perennial',
    // 15 is Widmer 2026 verbatim for raspberry, on the same average-yield convention as strawberry.
    // The 18 to 25 band is this app's own: Widmer publishes no target and no shading figure for
    // raspberry
    15,
    18,
    25,
    'C',
    1,
    730,
    60,
    1.8,
    0.8,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 2,
      dliCitations: ['widmer-strawberry-dli'],
      dliCaveat: RASPBERRY_CAVEAT,
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): its "Care
      // through the seasons" checklist for summer-bearing raspberries marks July and August for
      // "Harvest". The median last spring freeze there is Apr 23 at Minneapolis-St Paul Intl AP,
      // MN, so picking starts 69 days after it and runs 61 days
      harvest: {
        afterFreezeDays: 69,
        citations: ['umn-extension-2026-raspberries', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 61,
    },
  ],
  [
    'blackberry',
    'Rubus fruticosus',
    'Rosaceae',
    'blackberry',
    'berries',
    'cane-bush-berries',
    'caned',
    'cool-perennial',
    12,
    18,
    26,
    'C',
    1,
    730,
    90,
    2,
    1.2,
    {
      life: 'woody-perennial',
      coldC: -23,
      yearsToMature: 2,
      // Oregon State University Extension Service (EC 1303), for Willamette Valley, Oregon: "All
      // cultivars are summer-bearing (‘Triple Crown’, for example) and are the latest
      // summer-bearing cultivars, fruiting from early August to September or October in the
      // Willamette Valley". The median last spring freeze there is Apr 11 at Eugene-Mahlon Sweet
      // Fld, OR, so picking starts 116 days after it and runs 87 days. The semierect type, the
      // guide's latest-fruiting group
      harvest: {
        afterFreezeDays: 116,
        citations: [
          'osu-extension-2020-blackberries-ec1303',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 87,
    },
  ],
  [
    'blueberry',
    'Vaccinium corymbosum',
    'Ericaceae',
    'blueberry|highbush blueberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    12,
    20,
    26,
    'C',
    1,
    1460,
    150,
    1.6,
    1.4,
    {
      life: 'woody-perennial',
      coldC: -29,
      yearsToMature: 5,
      ph: [4, 4.5, 5.5, 6],
      chillHours: 800,
      deciduous: true,
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): its "Care
      // through the seasons" checklist marks July for "Harvest". The median last spring freeze there
      // is Apr 23 at Minneapolis-St Paul Intl AP, MN, so picking starts 69 days after it and runs 30
      // days
      harvest: {
        afterFreezeDays: 69,
        citations: ['umn-extension-2026-blueberries', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 30,
    },
  ],

  // Acid-soil guild. Highbush blueberry is the only crop in this catalog that optimizes
  // below pH 6.2, so without these species an acid bed has nothing to pair with. Every pH
  // trapezoid below except cranberry's and sweetfern's is transcribed verbatim from the
  // named FEIS species review. The DLI figures are class-level inferences as everywhere else
  [
    'lingonberry',
    'Vaccinium vitis-idaea',
    'Ericaceae',
    'lingonberry|cowberry',
    'berries',
    'cane-bush-berries',
    'groundcover',
    'cool-perennial',
    8,
    14,
    20,
    'C',
    1,
    1095,
    40,
    0.3,
    0.4,
    {
      life: 'woody-perennial',
      coldC: -40,
      yearsToMature: 3,
      // FEIS: "Soil pH ranges from 2.7 to 8.2, but best growth has been reported at 4.0 to 4.9"
      ph: [2.7, 4, 4.9, 8.2],
      envCitations: ['tirmenstein1991-lingonberry-feis'],
      maxRsr: 0.5,
      maxRsrTier: 'C',
      // Oregon State University Extension Service (PNW Extension Publication, PNW 583), for
      // Willamette Valley, Oregon: "There are two bloom periods: March to April and July to August.
      // The fruit ripens in mid-August and mid-October, respectively". The median last spring
      // freeze there is Apr 11 at Eugene-Mahlon Sweet Fld, OR, so picking starts 126 days after it
      // and runs 61 days. Two crops a year, in mid-August and mid-October, read as one season
      harvest: {
        afterFreezeDays: 126,
        citations: [
          'osu-extension-2006-lingonberry-pnw583',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 61,
    },
  ],
  [
    'lowbush-blueberry',
    'Vaccinium angustifolium',
    'Ericaceae',
    'lowbush blueberry|wild blueberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    12,
    18,
    24,
    'C',
    1,
    1095,
    60,
    0.4,
    0.6,
    {
      life: 'woody-perennial',
      coldC: -40,
      yearsToMature: 3,
      // FEIS: "grows on acidic soils with pH ranging from 2.8 to 6.6 but reportedly thrives
      // on soils with a pH of 4.2 to 5.2"
      ph: [2.8, 4.2, 5.2, 6.6],
      envCitations: ['tirmenstein1991-lowbush-blueberry-feis'],
      deciduous: true,
      // University of Maine Cooperative Extension, for Washington County, Maine (Down East wild
      // blueberry barrens): "If possible, go to the fields and buy berries directly from growers
      // during harvest season. Buy your supply when berries are at their peak, from July to
      // mid-August". The median last spring freeze there is May 3 at Jonesboro, ME, so picking
      // starts 59 days after it and runs 45 days. Buying advice in a nutrition bulletin, read as
      // the peak of the harvest season
      harvest: {
        afterFreezeDays: 59,
        citations: [
          'umaine-extension-2008-wild-blueberries-bulletin-4263',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 45,
    },
  ],
  [
    'cranberry',
    'Vaccinium macrocarpon',
    'Ericaceae',
    'cranberry|large cranberry',
    'berries',
    'cane-bush-berries',
    'groundcover',
    'cool-perennial',
    12,
    18,
    25,
    'C',
    1,
    1095,
    30,
    0.2,
    0.5,
    {
      life: 'woody-perennial',
      coldC: -35,
      yearsToMature: 3,
      // No work in the corpus tabulates a cranberry pH trapezoid: FEIS has no V. macrocarpon
      // review. These bounds are Tier C curation under CATALOG_PROVENANCE, the same standing
      // as the highbush blueberry row above, and no source is claimed for the numbers
      ph: [3.2, 4, 5.5, 6.5],
      envCitations: [],
      // University of Massachusetts Amherst Cranberry Station Extension (ScholarWorks@UMass
      // Amherst), for Massachusetts (East Wareham / southeastern Massachusetts cranberry-growing
      // area): "Harvesting typically begins around mid-September and continues through early
      // November". The median last spring freeze there is Apr 21 at East Wareham, MA, so picking
      // starts 147 days after it and runs 51 days
      harvest: {
        afterFreezeDays: 147,
        citations: [
          'umass-extension-2008-cranberry-production-guide',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 51,
    },
  ],
  [
    'teaberry',
    'Gaultheria procumbens',
    'Ericaceae',
    'eastern teaberry|wintergreen|checkerberry',
    'berries',
    'understory-herbs',
    'groundcover',
    'cool-perennial',
    3,
    6,
    12,
    'C',
    2,
    730,
    30,
    0.15,
    0.3,
    {
      life: 'perennial',
      coldC: -40,
      // FEIS: a boreal and cool-temperate understory shrub of eastern North America, so it
      // grows only where winters are cold. The envelope alone admitted it to Nairobi and Mumbai
      coldWinterOnly: true,
      // FEIS: found from pH 3.5 to 6.9 at the surface, "a pH of 4.5 to 6.0 has been reported
      // as optimum for growth, with 7.0 the maximum eastern teaberry tolerates"
      ph: [3.5, 4.5, 6, 7],
      envCitations: ['coladonato1994-teaberry-feis'],
      maxRsr: 0.75,
      maxRsrTier: 'C',
    },
  ],
  [
    'sweetfern',
    'Comptonia peregrina',
    'Myricaceae',
    'sweetfern',
    'forages',
    'forages-c3-pasture',
    'bush',
    'hardy-perennial',
    8,
    14,
    20,
    'C',
    1,
    1095,
    90,
    1.2,
    1.2,
    {
      role: 'nurse',
      life: 'woody-perennial',
      nfix: true,
      coldC: -40,
      yearsToMature: 3,
      // FEIS gives "well-drained, dry, acid, sandy or gravelly soils" and publishes no pH numbers,
      // so the envelope is deliberately uncited
      ph: [3.5, 4.5, 6.5, 7.5],
      envCitations: [],
      deciduous: true,
      laubNote: NO_HARVEST_NOTE,
    },
  ],

  [
    'currant-red',
    'Ribes rubrum',
    'Grossulariaceae',
    'red currant|white currant',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    5,
    10,
    16,
    'C',
    2,
    1095,
    120,
    1.4,
    1.2,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 4,
      chillHours: 800,
      deciduous: true,
      maxRsr: 0.45,
      maxRsrTier: 'C',
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): "July,
      // August: Harvest". The median last spring freeze there is Apr 23 at Minneapolis-St Paul Intl
      // AP, MN, so picking starts 69 days after it and runs 61 days
      harvest: {
        afterFreezeDays: 69,
        citations: [
          'umn-extension-2024-currants-gooseberries',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 61,
    },
  ],
  [
    'currant-black',
    'Ribes nigrum',
    'Grossulariaceae',
    'blackcurrant',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    2,
    1095,
    150,
    1.5,
    1.4,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 4,
      chillHours: 800,
      deciduous: true,
      maxRsr: 0.4,
      maxRsrTier: 'C',
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): "July,
      // August: Harvest". The median last spring freeze there is Apr 23 at Minneapolis-St Paul Intl
      // AP, MN, so picking starts 69 days after it and runs 61 days
      harvest: {
        afterFreezeDays: 69,
        citations: [
          'umn-extension-2024-currants-gooseberries',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 61,
    },
  ],
  [
    'gooseberry',
    'Ribes uva-crispa',
    'Grossulariaceae',
    'gooseberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    5,
    10,
    16,
    'C',
    2,
    1095,
    120,
    1.2,
    1.2,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 4,
      chillHours: 800,
      deciduous: true,
      maxRsr: 0.45,
      maxRsrTier: 'C',
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): "July,
      // August: Harvest". The median last spring freeze there is Apr 23 at Minneapolis-St Paul Intl
      // AP, MN, so picking starts 69 days after it and runs 61 days
      harvest: {
        afterFreezeDays: 69,
        citations: [
          'umn-extension-2024-currants-gooseberries',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 61,
    },
  ],
  [
    'elderberry',
    'Sambucus canadensis',
    'Viburnaceae',
    'elderberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    8,
    14,
    22,
    'C',
    1,
    1095,
    240,
    3,
    2.5,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 4,
      deciduous: true,
      // University of Maryland Extension, Home and Garden Information Center, for Maryland:
      // "Harvest is usually between mid-August and mid-September, depending on cultivar and
      // location". The median last spring freeze there is Apr 10 at Baltimore-Washington Intl AP,
      // MD, so picking starts 127 days after it and runs 31 days
      harvest: {
        afterFreezeDays: 127,
        citations: [
          'umd-extension-2024-less-common-fruits',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 31,
    },
  ],
  [
    'rhubarb',
    'Rheum rhabarbarum',
    'Polygonaceae',
    'rhubarb',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    2,
    730,
    90,
    0.9,
    1.1,
    {
      life: 'perennial',
      coldC: -34,
      yearsToMature: 3,
      laubNote: NO_COMPARABLE_CROP_NOTE,
      // Iowa State University Extension and Outreach, Yard and Garden, for Iowa (represented by Des
      // Moines): "Begin harvesting rhubarb when stalks reach 10 to 15 inches long (usually sometime
      // in April or early May in Iowa). Rhubarb can be harvested for eight to ten weeks, ending in
      // mid-June". The median last spring freeze there is Apr 18 at Des Moines International
      // Airport, so picking starts 0 days after it and runs 58 days. The start is the middle of the
      // stated range, April to early May
      harvest: {
        afterFreezeDays: 0,
        citations: ['iastate-extension-2025-rhubarb', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 58,
    },
  ],
  [
    'asparagus',
    'Asparagus officinalis',
    'Asparagaceae',
    'asparagus',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool-perennial',
    14,
    20,
    28,
    'C',
    0,
    1095,
    40,
    1.6,
    0.6,
    {
      life: 'perennial',
      coldC: -34,
      yearsToMature: 3,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      laubNote: NO_COMPARABLE_CROP_NOTE,
      // University of Minnesota Extension, for Minnesota (Minneapolis-St Paul): "The asparagus
      // harvest season lasts about 6 to 8 weeks, from early May to late June in Minnesota". The
      // median last spring freeze there is Apr 23 at Minneapolis-St Paul International Airport, so
      // picking starts 12 days after it and runs 51 days
      harvest: {
        afterFreezeDays: 12,
        citations: ['umn-extension-2026-asparagus', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 51,
    },
  ],
  [
    'globe-artichoke',
    'Cynara cardunculus',
    'Asteraceae',
    'globe artichoke',
    'leafy-vegetables',
    'leafy-greens',
    'rosette',
    'cool-perennial',
    14,
    20,
    28,
    'C',
    0,
    730,
    120,
    1.4,
    1.4,
    {
      life: 'perennial',
      coldC: -12,
      yearsToMature: 2,
      laubNote: NO_COMPARABLE_CROP_NOTE,
      // University of California Division of Agriculture and Natural Resources, for Central Coast
      // California (Salinas Valley, Monterey County, represented by Salinas): "Perennial artichokes
      // are harvested year-round, but the highest volume of production occurs between March and
      // May". The median last spring freeze there is Jan 29 at Salinas Municipal Airport, CA, so
      // picking starts 31 days after it and runs 91 days. Picked year-round on the Central Coast,
      // and the figure is the stated March to May peak
      harvest: {
        afterFreezeDays: 31,
        citations: ['ucanr-2008-artichoke', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 91,
    },
  ],
  [
    'grape',
    'Vitis vinifera',
    'Vitaceae',
    'grape|wine grape|table grape',
    'fruits',
    'cane-bush-berries',
    'vining-trellised',
    'temperate-tree',
    18,
    25,
    35,
    'C',
    0,
    1095,
    200,
    2.5,
    2,
    {
      life: 'woody-perennial',
      coldC: -18,
      yearsToMature: 4,
      chillHours: 200,
      deciduous: true,
      support: 'trellis',
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): "In
      // Minnesota, many varieties begin to grow in May, and the earliest-ripening varieties are
      // harvested in mid-August, while later-ripening varieties may hang until mid-to-late
      // October". The median last spring freeze there is Apr 23 at Minneapolis-St Paul Intl AP, MN,
      // so picking starts 114 days after it and runs 71 days
      harvest: {
        afterFreezeDays: 114,
        citations: [
          'umn-extension-2026-cold-climate-grapes',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 71,
    },
  ],
  [
    'apple',
    'Malus domestica',
    'Rosaceae',
    'apple',
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    // No DLI figure in mol/m2/d exists for any temperate tree fruit in peer-reviewed or Extension
    // literature. 15 is the cane/bush-berry class floor and 20-30 the generic full-sun band
    15,
    20,
    30,
    'C',
    0,
    1825,
    350,
    3.5,
    3,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 6,
      chillHours: 800,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 in the publication's own map: Table 3, "Approximate time of maturity": July
      // for Lodi through October for Braeburn, Fuji, Golden Delicious and the other late varieties.
      // The median last spring freeze there is Apr 3 at Salem AP (McNary Field), OR, so picking
      // starts 89 days after it and runs 122 days. The span runs from the earliest to the latest
      // listed variety
      harvest: {
        afterFreezeDays: 89,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 122,
    },
  ],
  [
    'pear',
    'Pyrus communis',
    'Rosaceae',
    'pear',
    'fruits',
    'cane-bush-berries',
    'columnar-tree',
    'temperate-tree',
    15,
    20,
    30,
    'C',
    0,
    1825,
    350,
    4,
    2.8,
    {
      life: 'woody-perennial',
      coldC: -29,
      yearsToMature: 6,
      chillHours: 700,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 and 2 in the publication's own map: Table 8, "Approximate time of maturity":
      // Aug 1 - 15 for Starkrimson through Sept 20 - 30 for Comice. The median last spring freeze
      // there is Apr 3 at Salem AP (McNary Field), OR, so picking starts 120 days after it and runs
      // 60 days. The span runs from the earliest to the latest listed variety
      harvest: {
        afterFreezeDays: 120,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 60,
    },
  ],
  [
    'peach',
    'Prunus persica',
    'Rosaceae',
    'peach|nectarine',
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    18,
    25,
    35,
    'C',
    0,
    1460,
    400,
    3.5,
    3.5,
    {
      life: 'woody-perennial',
      coldC: -23,
      yearsToMature: 4,
      chillHours: 750,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 and 2 in the publication's own map: Table 7, "Approximate time of maturity":
      // early August for Harko and Red Haven through late August for Improved Elberta and Veteran.
      // The median last spring freeze there is Apr 3 at Salem AP (McNary Field), OR, so picking
      // starts 124 days after it and runs 20 days. The span runs from the earliest to the latest
      // listed variety
      harvest: {
        afterFreezeDays: 124,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 20,
    },
  ],
  [
    'almond',
    'Prunus dulcis',
    'Rosaceae',
    'almond',
    // laubGroup, dliClass, habit, archetype, DLI figures, tier, chillHours and maxRsr as peach,
    // almond's closer relative within Prunus (both subgenus Amygdalus, unlike apricot)
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    18,
    25,
    35,
    'C',
    // USU Extension: "Select a location that will receive full sun for at least 3/4 of the day"
    0,
    1460,
    // USU Extension: "will occupy a space roughly 20 x 20 feet (10-12 foot radius from the
    // trunk)"
    610,
    // no source states almond's own height, as peach
    3.5,
    // USU Extension: derived from "10-12 foot radius from the trunk", a 20-24 ft diameter, the
    // 22 ft midpoint
    6.71,
    {
      life: 'woody-perennial',
      // USU Extension: "Don't expect to harvest nuts for 4 to 6 years after planting"
      yearsToMature: 5,
      chillHours: 750,
      // USU Extension: "temperatures below -20 F will damage the woody stems and branches of
      // almond trees"
      coldC: -28.9,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // FAO-56 Table 22, "Almonds": Zr 1.0-2.0 m, p 0.40, the 1.5 m midpoint
      zr: 1.5,
      p: 0.4,
      // USU Extension, cultivar 'Nonpareil' at Fresno, CA (USW00093193, Jan 14 median last
      // spring freeze): "matures at the end of August", picking starts 223 days after the
      // freeze. As peach, this source gives no closing date of its own, so harvestDays is
      // peach's own 20-day span
      harvest: {
        afterFreezeDays: 223,
        citations: [
          'usu-extension-2020-almonds-home-garden',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 20,
    },
  ],
  [
    'plum',
    'Prunus domestica',
    'Rosaceae',
    'plum|european plum',
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    15,
    20,
    30,
    'C',
    0,
    1460,
    400,
    4,
    3.5,
    {
      life: 'woody-perennial',
      coldC: -29,
      yearsToMature: 5,
      chillHours: 800,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 in the publication's own map: Table 10, European varieties: Sept 1 - 15 for
      // Parsons and Stanley through Oct. 1 for Moyer Perfecto. The median last spring freeze there
      // is Apr 3 at Salem AP (McNary Field), OR, so picking starts 151 days after it and runs 30
      // days. The span runs from the earliest to the latest listed European variety
      harvest: {
        afterFreezeDays: 151,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 30,
    },
  ],
  [
    'cherry-sweet',
    'Prunus avium',
    'Rosaceae',
    'sweet cherry',
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    15,
    20,
    30,
    'C',
    0,
    1825,
    450,
    5,
    4,
    {
      life: 'woody-perennial',
      coldC: -29,
      yearsToMature: 6,
      chillHours: 1000,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Utah State University Extension, for Box Elder County south to Salt Lake County, Utah:
      // "From Box Elder County south to Salt Lake County, sweet cherries ripen around June 10 to
      // the 25". The median last spring freeze there is Apr 8 at Salt Lake City Intl AP, UT, so
      // picking starts 63 days after it and runs 15 days. A food preservation page giving the
      // northern Utah season, June 10 to the 25
      harvest: {
        afterFreezeDays: 63,
        citations: ['usu-extension-preserve-cherries', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 15,
    },
  ],
  [
    'cherry-sour',
    'Prunus cerasus',
    'Rosaceae',
    'sour cherry|tart cherry',
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    15,
    20,
    30,
    'C',
    0,
    1460,
    400,
    4,
    3.5,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 5,
      chillHours: 1100,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 and 2 in the publication's own map: Table 5, sour varieties: July for
      // Balaton, Montmorency and North Star. The median last spring freeze there is Apr 3 at Salem
      // AP (McNary Field), OR, so picking starts 89 days after it and runs 30 days
      harvest: {
        afterFreezeDays: 89,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 30,
    },
  ],
  [
    'apricot',
    'Prunus armeniaca',
    'Rosaceae',
    'apricot',
    'fruits',
    'cane-bush-berries',
    'vase-tree',
    'temperate-tree',
    15,
    20,
    30,
    'C',
    0,
    1460,
    400,
    4,
    3.5,
    {
      life: 'woody-perennial',
      coldC: -26,
      yearsToMature: 4,
      chillHours: 700,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 and 2 in the publication's own map: Table 4, "Approximate time of maturity":
      // July for Puget Gold, Rival, Royal (Blenheim) and the rest. The median last spring freeze
      // there is Apr 3 at Salem AP (McNary Field), OR, so picking starts 89 days after it and runs
      // 30 days
      harvest: {
        afterFreezeDays: 89,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 30,
    },
  ],
  [
    'fig',
    'Ficus carica',
    'Moraceae',
    'fig',
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    0,
    1095,
    400,
    4,
    4,
    {
      life: 'woody-perennial',
      coldC: -12,
      yearsToMature: 4,
      deciduous: true,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Western Oregon valleys (Willamette Valley),
      // Oregon, Area 1 in the publication's own map: Table 6, "Approximate time of maturity":
      // August for Brown Turkey, Desert King and Lattarula. The median last spring freeze there is
      // Apr 3 at Salem AP (McNary Field), OR, so picking starts 120 days after it and runs 30 days
      harvest: {
        afterFreezeDays: 120,
        citations: [
          'osu-extension-2025-tree-fruits-nuts-home',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 30,
    },
  ],
  [
    'pomegranate',
    'Punica granatum',
    'Lythraceae',
    'pomegranate',
    // laubGroup, dliClass, habit, archetype, DLI figures and tier as fig
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    // UGA Circular 997: "require at least six hours of direct sunlight a day", Clemson HGIC 1359:
    // "partial shade reduces fruit set"
    0,
    // ECOCROP sheet 1829 cycle 180 to 365 days, a fruit cycle of the full year, as lemon and
    // mango
    365,
    // UGA Circular 997: "Traditional spacing for an orchard is 18' x 18'"
    549,
    // Clemson HGIC 1359: "typically grows from 12 to 20 feet tall and nearly the same in
    // spread", the 16 ft midpoint
    4.88,
    // same sentence: "nearly the same in spread"
    4.88,
    {
      life: 'woody-perennial',
      yearsToMature: 3,
      // UGA Circular 997: "Most pomegranate cultivars are hardy down to 12 degrees F, with the
      // hardier types surviving... down to 7 degrees F", the warmer, more typical end
      coldC: -12.5,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // UGA Circular 997, for Tifton, GA (Ponder Farm, USC00098703, Mar 11 median last spring
      // freeze): "Early cultivars will begin to ripen near the end of August, and will continue
      // through to October or early November for the late-maturing cultivars", picking starts
      // 167 days after the freeze and runs 72 days
      harvest: {
        afterFreezeDays: 167,
        citations: ['uga-2022-pomegranate-production', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 72,
    },
  ],
  [
    'hazelnut',
    'Corylus avellana',
    'Betulaceae',
    'hazelnut|filbert',
    'fruits',
    'cane-bush-berries',
    'bush',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    1,
    1825,
    400,
    4,
    4,
    {
      life: 'woody-perennial',
      coldC: -29,
      yearsToMature: 6,
      chillHours: 800,
      deciduous: true,
      maxRsr: 0.3,
      maxRsrTier: 'C',
      // Oregon State University Extension Service, for Oregon (Willamette Valley hazelnut
      // industry): "Blank nuts fall before good nuts. After blanks have fallen and just before good
      // nuts begin to drop (usually at the end of August), it might be desirable to do a final
      // flailing and floating to fill small depressions in the ground. ... In most years, it's
      // October before all of the nuts have fallen naturally". The median last spring freeze there
      // is Apr 3 at Salem AP (McNary Field), OR, so picking starts 144 days after it and runs 67
      // days. Nut drop stands in for harvest: nuts start falling at the end of August and have
      // mostly fallen by October
      harvest: {
        afterFreezeDays: 144,
        citations: [
          'osu-extension-2013-hazelnuts-orchard-floor',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 67,
    },
  ],
  [
    'walnut',
    'Juglans regia',
    'Juglandaceae',
    'walnut|english walnut|persian walnut',
    // laubGroup, dliClass, archetype, DLI figures and tier as hazelnut. A canopy tree in full sun, so
    // the habit and the 0.1 shade ceiling are the tree fruit's, as apple and pear, where hazelnut's
    // bush and 0.3 belong to an understory shrub
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    // OSU EM 8907: "Walnuts grow best in full sun"
    0,
    1825,
    // OSU EM 8907: "Walnut trees usually are planted about 30 feet apart"
    914,
    // NC State Extension Plant Toolbox: "Height: 40 ft. 0 in. - 60 ft. 0 in.", the 50 ft midpoint
    15.24,
    // same page: "Width: 40 ft. 0 in. - 60 ft. 0 in."
    15.24,
    {
      life: 'woody-perennial',
      yearsToMature: 6,
      chillHours: 800,
      deciduous: true,
      // NC State's own zone list, 3a-7b, names 'Carpathian' as its one cold-hardy cultivar
      // ("Cold-hardy English strain") among four, the other three (Chandler, Franquette,
      // Hartley) are ordinary commercial walnut and wouldn't reach the 3a end. As this row isn't
      // the Carpathian selection specifically, coldC follows hazelnut's own figure instead
      coldC: -29,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // OSU EM 8907, for the Willamette Valley, western Oregon (Salem AP (McNary Field), OR,
      // USW00024232, Apr 3 median last spring freeze): "This usually happens in October",
      // picking starts 181 days after the freeze and runs 30 days
      harvest: {
        afterFreezeDays: 181,
        citations: [
          'osu-extension-2006-growing-walnuts-oregon',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 30,
    },
  ],
  [
    'black-walnut',
    'Juglans nigra',
    'Juglandaceae',
    'black walnut',
    // laubGroup, dliClass, archetype, DLI figures and tier as hazelnut. A canopy tree in full sun, so
    // the habit and the 0.1 shade ceiling are the tree fruit's, as apple and pear, where hazelnut's
    // bush and 0.3 belong to an understory shrub
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    // USDA NRCS Plant Guide: "Black walnut prefers full sun", NDSU Extension separately notes it
    // "tolerates partial shade"
    1,
    1825,
    // University of Missouri Center for Agroforestry AF1011: "Minimum tree spacing should be 25
    // to 30 feet", the 27.5 ft midpoint
    838,
    // USDA NRCS Plant Guide: "usually a medium sized tree ranging from 70-90 feet tall", the 80
    // ft midpoint (150 ft is this source's stated maximum)
    24.38,
    // NDSU Extension F2209's only explicit spread figure, "the largest tree in North Dakota... a
    // canopy spread of 50 feet", is a state-champion outlier at this species' cold margin, so
    // it's not used here. No other source gives one, so this row's
    // own spacing stands in instead, as chayote's hill spacing stands in for its own width
    8.38,
    {
      life: 'woody-perennial',
      yearsToMature: 5,
      chillHours: 800,
      deciduous: true,
      // NDSU Extension F2209: "Hardiness: Zone 4"
      coldC: -34.4,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // University of Missouri Center for Agroforestry AF1011, for central Missouri (Columbia
      // Regional AP, MO, USW00003945, Apr 7 median last spring freeze): "early-ripening
      // cultivars mature Sept. 1-14... Mid-season cultivars ripen Sept. 15-28 and late-ripening
      // cultivars become harvestable after Sept. 28", read as Sept 1 to early October across the
      // three groups. Picking starts 147 days after the freeze and runs 34 days
      harvest: {
        afterFreezeDays: 147,
        citations: [
          'mu-agroforestry-2009-black-walnut-nut-production',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 34,
    },
  ],
  [
    'chestnut',
    'Castanea mollissima',
    'Fagaceae',
    'chestnut|chinese chestnut',
    // laubGroup, dliClass, archetype, DLI figures and tier as hazelnut. A canopy tree in full sun, so
    // the habit and the 0.1 shade ceiling are the tree fruit's, as apple and pear, where hazelnut's
    // bush and 0.3 belong to an understory shrub
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    // University of Missouri Center for Agroforestry AF1007: "Chestnuts require full sun for
    // best nut production so they should not be planted adjacent to large shade trees"
    0,
    1825,
    // AF1007: "Spacing your trees at least 40 to 50 feet apart", the 45 ft midpoint
    1372,
    // Iowa State University Extension: "Eventually after several decades the trees can reach a
    // height of 40-60'", the 50 ft midpoint
    15.24,
    // same sentence: "a spread of 30'"
    9.14,
    {
      life: 'woody-perennial',
      yearsToMature: 3,
      deciduous: true,
      // AF1007: "Chinese chestnuts can tolerate -20 F temperatures when fully dormant"
      coldC: -28.9,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // University of Missouri Center for Agroforestry AF1007, for central Missouri (Columbia
      // Regional AP, MO, USW00003945, Apr 7 median last spring freeze): "stretching from
      // September into October in Missouri", picking starts 147 days after the freeze and runs
      // 60 days
      harvest: {
        afterFreezeDays: 147,
        citations: [
          'mu-agroforestry-2022-chinese-chestnut',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 60,
    },
  ],
  [
    'pecan',
    'Carya illinoinensis',
    'Juglandaceae',
    'pecan',
    // laubGroup, dliClass, archetype, DLI figures and tier as hazelnut. A canopy tree in full sun, so
    // the habit and the 0.1 shade ceiling are the tree fruit's, as apple and pear, where hazelnut's
    // bush and 0.3 belong to an understory shrub
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    // NC State Extension Gardener Handbook ch. 15: "Fruit and nut trees need at least 6 hours of
    // sunlight during the growing season"
    0,
    1825,
    // UGA Bulletin 1348: "Yard and home orchard trees should be spaced at least 60 to 80 feet
    // apart", the 70 ft midpoint
    2134,
    // University of Missouri Center for Agroforestry AF1002: "pecan trees often grow to a height
    // of over 70 feet", the stated floor
    21.34,
    // same sentence: "with a spread of greater than 80 feet", the stated floor
    24.38,
    {
      life: 'woody-perennial',
      yearsToMature: 6,
      deciduous: true,
      // as black-walnut: zone 4, the same family (Juglandaceae), and no source gives pecan its
      // own cold floor
      coldC: -34.4,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // UGA Bulletin 1348, for Georgia's pecan belt (Albany SW Georgia Regional AP, GA,
      // USW00013869, Mar 8 median last spring freeze): cultivars 'Carter' and 'McMillian' have
      // "estimated harvest date[s]" of October 18 and October 20, picking starts 221 days after
      // the freeze and runs 10 days
      harvest: {
        afterFreezeDays: 221,
        citations: [
          'uga-extension-2024-pecan-home-backyard',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 10,
    },
  ],
  [
    'pawpaw',
    'Asimina triloba',
    'Annonaceae',
    'pawpaw',
    'fruits',
    'cane-bush-berries',
    'columnar-tree',
    'temperate-tree',
    6,
    14,
    22,
    'C',
    2,
    2190,
    300,
    5,
    3,
    {
      life: 'woody-perennial',
      coldC: -26,
      yearsToMature: 7,
      deciduous: true,
      maxRsr: 0.45,
      maxRsrTier: 'C',
      // Kentucky State University Cooperative Extension Program, for Kentucky (Frankfort, home of
      // the KSU Pawpaw Research Program): "Depending on the variety, fruit ripen in late-August to
      // early-October. Fruit ripen on the same tree over about a 2 week period, which reflects an
      // extended spring flowering period". The median last spring freeze there is Apr 15 at
      // Frankfort Capital City AP, KY, so picking starts 132 days after it and runs 41 days
      harvest: {
        afterFreezeDays: 132,
        citations: [
          'ksu-extension-2010-organic-pawpaw',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 41,
    },
  ],
  [
    'persimmon',
    'Diospyros kaki',
    'Ebenaceae',
    'persimmon|japanese persimmon|kaki',
    // laubGroup, dliClass, habit, archetype, DLI figures and tier as pawpaw
    'fruits',
    'cane-bush-berries',
    'columnar-tree',
    'temperate-tree',
    6,
    14,
    22,
    'C',
    // UF/IFAS ENH388/ST229: "Light requirement: full sun"
    0,
    // ECOCROP sheet 945 cycle 150 to 270 days, the 210 midpoint, this app's own reading with no
    // secondary source dating the species' own cycle more precisely
    210,
    // Texas A&M E-611: "Plant the trees every 15 to 18 feet in rows that are 20 feet apart",
    // in-row mid 16.5 ft x row 20 ft, sqrt(16.5 x 20) = 18.17 ft
    554,
    // UF/IFAS ENH388/ST229: "Height: 20 to 30 feet", the 25 ft midpoint
    7.62,
    // UF/IFAS ENH388/ST229: "Spread: 15 to 25 feet", the 20 ft midpoint
    6.1,
    {
      life: 'woody-perennial',
      // not found for Diospyros kaki specifically, as pawpaw
      yearsToMature: 7,
      // Clemson HGIC 1357's "Survive to about 10 F" doesn't state whether the full text was
      // read (readFullText false), so this row doesn't use it, as pawpaw
      coldC: -26,
      maxRsr: 0.45,
      maxRsrTier: 'C',
      // Texas A&M AgriLife Extension (Bexar County), for San Antonio, TX (USW00012921, Feb 26
      // median last spring freeze): "Oriental persimmons generally start ripening around late
      // October through the early part of December in San Antonio and surrounding areas",
      // picking starts 241 days after the freeze and runs 41 days
      harvest: {
        afterFreezeDays: 241,
        citations: [
          'tamu-2011-rodriguez-harvesting-oriental-persimmons',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 41,
    },
  ],
  [
    'american-persimmon',
    'Diospyros virginiana',
    'Ebenaceae',
    'american persimmon|common persimmon',
    // laubGroup, dliClass, habit, archetype, DLI figures and tier as pawpaw
    'fruits',
    'cane-bush-berries',
    'columnar-tree',
    'temperate-tree',
    6,
    14,
    22,
    'C',
    // University of Kentucky CCD-CP-1: "from partial shade to full sun. However, for best growth
    // and fruit production... sunny sites are best"
    1,
    // ECOCROP sheet 5474 cycle 240 to 270 days, the 255 midpoint
    255,
    // University of Kentucky CCD-CP-1: "A tree spacing of 20 feet between trees in the row and
    // 27 feet between rows", in-row 20 ft x row 27 ft, sqrt(20 x 27) = 23.24 ft
    708,
    // NC State Extension Plant Toolbox: "Height: 30 ft. 0 in. - 80 ft. 0 in.", the 55 ft
    // midpoint
    16.76,
    // NC State Extension Plant Toolbox: "Width: 20 ft. 0 in. - 35 ft. 0 in.", the 27.5 ft
    // midpoint
    8.38,
    {
      life: 'woody-perennial',
      // University of Kentucky CCD-CP-1: "grafted trees can begin fruiting three years after
      // planting"
      yearsToMature: 3,
      // Clemson HGIC 1357's "-20 F to -25 F" doesn't state whether the full text was read
      // (readFullText false), so this row doesn't use it, as pawpaw
      coldC: -26,
      maxRsr: 0.45,
      maxRsrTier: 'C',
      // Purdue Extension (Whitley County), quoting forestry specialist Lenny Farlee, for Indiana
      // (Fort Wayne Intl AP, IN, USW00014827, Apr 24 median last spring freeze): "persimmon
      // fruit normally ripens in September and October", picking starts 130 days after the
      // freeze and runs 60 days
      harvest: {
        afterFreezeDays: 130,
        citations: [
          'purdue-2025-woodmansee-divine-fruit',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 60,
    },
  ],
  [
    'serviceberry',
    'Amelanchier alnifolia',
    'Rosaceae',
    'serviceberry|saskatoon|juneberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'temperate-tree',
    8,
    14,
    22,
    'C',
    1,
    1460,
    250,
    3.5,
    2.5,
    {
      life: 'woody-perennial',
      coldC: -40,
      yearsToMature: 4,
      chillHours: 800,
      deciduous: true,
      // Montana State University Extension (MontGuide MT201821AG), for Montana: "Serviceberry fruit
      // ripens in late June through July". The median last spring freeze there is May 26 at Bozeman
      // Gallatin Fld AP, MT, so picking starts 30 days after it and runs 36 days
      harvest: {
        afterFreezeDays: 30,
        citations: [
          'msu-extension-2018-growing-serviceberries',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 36,
    },
  ],
  [
    'aronia',
    'Aronia melanocarpa',
    'Rosaceae',
    'aronia|black chokeberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    8,
    14,
    22,
    'C',
    1,
    1095,
    180,
    2,
    1.8,
    {
      life: 'woody-perennial',
      coldC: -37,
      yearsToMature: 4,
      deciduous: true,
      // Iowa State University Extension and Outreach, Yard and Garden, for Iowa: "The fruit ripen
      // from late August through mid-September". The median last spring freeze there is Apr 18 at
      // Des Moines Intl AP, IA, so picking starts 129 days after it and runs 21 days
      harvest: {
        afterFreezeDays: 129,
        citations: ['iastate-extension-2015-aronia', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 21,
    },
  ],
  [
    'hardy-kiwi',
    'Actinidia arguta',
    'Actinidiaceae',
    'hardy kiwi|kiwiberry',
    'fruits',
    'cane-bush-berries',
    'vining-trellised',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    1,
    1825,
    300,
    5,
    3,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 5,
      chillHours: 600,
      deciduous: true,
      support: 'arbor',
      // University of Minnesota Extension, for Southern Minnesota (Twin Cities area): "Late August
      // to mid-October". The median last spring freeze there is Apr 23 at Minneapolis-St Paul Intl
      // AP, MN, so picking starts 124 days after it and runs 51 days
      harvest: {
        afterFreezeDays: 124,
        citations: ['umn-extension-2024-kiwiberry', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 51,
    },
  ],
  [
    'kiwifruit',
    'Actinidia deliciosa',
    'Actinidiaceae',
    'kiwifruit|fuzzy kiwi',
    // laubGroup, dliClass, DLI figures, tier and the arbor support as hardy-kiwi, the
    // catalog's other Actinidia vine
    'fruits',
    'cane-bush-berries',
    'vining-trellised',
    'temperate-tree',
    10,
    18,
    25,
    'C',
    // OSU EM 9322: "Ideal environmental conditions... are full sun exposure... While plants can
    // tolerate partial shade, yield and fruit quality may be lower"
    1,
    1825,
    // OSU EM 9322: "One plant needs about 15 feet of space. Plant two vines 15 feet apart"
    457,
    // OSU EM 9322: "Attach a strong cross arm at 6 to 7 feet above ground level on each post",
    // the 6.5 ft midpoint, the T-bar trellis this vine is trained onto
    1.98,
    // OSU EM 9322: the same 15 ft of horizontal space one vine fills
    4.57,
    {
      life: 'woody-perennial',
      yearsToMature: 3,
      chillHours: 600,
      deciduous: true,
      support: 'arbor',
      // OSU EM 9322: fuzzy kiwifruit "is cold hardy to about 0 to 10 F", the warmer, more
      // typical end. Hardy kiwi (Actinidia arguta) is the much hardier species already in the
      // catalog
      coldC: -15,
      // OSU EM 9322, for western Oregon (Corvallis State University, OR, USC00351862, Apr 17
      // median last spring freeze): "pick 'Hayward' and other fuzzy kiwifruit cultivars as late
      // as possible (late October/early November, or before the first hard frost)", picking
      // starts 191 days after the freeze and runs 11 days
      harvest: {
        afterFreezeDays: 191,
        citations: [
          'osu-2021-strik-kiwifruit-home-garden',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 11,
    },
  ],
  [
    'hops',
    'Humulus lupulus',
    'Cannabaceae',
    'hops',
    'fruits',
    'cane-bush-berries',
    'vining-trellised',
    'hardy-perennial',
    14,
    20,
    30,
    'C',
    0,
    730,
    100,
    6,
    1,
    {
      life: 'perennial',
      coldC: -34,
      yearsToMature: 3,
      support: 'trellis',
      // Oregon State University Extension Service (EM 9115), for Western and Central Oregon: "In
      // both Western and Central Oregon, hops typically mature between August 15 and September 15,
      // depending on the cultivar and growing season conditions". The median last spring freeze
      // there is Apr 11 at Eugene-Mahlon Sweet Fld, OR, so picking starts 126 days after it and
      // runs 31 days
      harvest: {
        afterFreezeDays: 126,
        citations: ['osu-extension-2015-hops-em9115', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 31,
    },
  ],
  [
    'crabapple',
    'Malus fusca',
    'Rosaceae',
    'pacific crabapple',
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'temperate-tree',
    12,
    20,
    28,
    'C',
    1,
    1825,
    400,
    6,
    5,
    {
      life: 'woody-perennial',
      coldC: -34,
      yearsToMature: 7,
      chillHours: 800,
      maxRsr: 0.2,
      maxRsrTier: 'C',
      harvestDays: 30,
    },
  ],
  [
    'highbush-cranberry',
    'Viburnum edule',
    'Viburnaceae',
    'highbush cranberry',
    'berries',
    'cane-bush-berries',
    'bush',
    'cool-perennial',
    6,
    12,
    20,
    'C',
    2,
    1095,
    200,
    2.5,
    2,
    {
      life: 'woody-perennial',
      coldC: -40,
      yearsToMature: 4,
      deciduous: true,
      maxRsr: 0.45,
      maxRsrTier: 'C',
      harvestDays: 21,
    },
  ],
  [
    'wild-ginger',
    'Asarum caudatum',
    'Aristolochiaceae',
    'western wild ginger',
    'leafy-vegetables',
    'understory-herbs',
    'groundcover',
    'cool-perennial',
    3,
    6,
    12,
    'C',
    2,
    730,
    30,
    0.15,
    0.4,
    {
      // Kept out of anything to eat: the FDA lists Asarum caudatum among "Botanicals Known or
      // Suspected to Contain Aristolochic Acid" (Import Alert 54-10), which damages the kidneys,
      // so the catalog carries it as a native evergreen groundcover that joins a bed only as a
      // support plant
      role: 'cover',
      life: 'perennial',
      coldC: -29,
      // WCVP records it wild in British Columbia, Washington, Oregon, California, Idaho and
      // Montana only, all cold-winter conifer forest. The envelope alone admitted it to Nairobi
      // and, on the hottest month's edge, to Mumbai
      coldWinterOnly: true,
      maxRsr: 0.75,
      maxRsrTier: 'C',
      // Nelson, Halpern and Antos 2007 tagged Asarum caudatum ramets in old-growth Douglas-fir
      // forest and the clearcut beside it in Washington. Page 2882: growing-season PPFD averaged
      // 36.4 mol/m2/d in the clearcut against 8.6 in the forest, and clearcut ramet survival fell
      // to about 30% of the forest's in year 1, still depressed for this species alone in year 2
      // even as its surviving ramets grew faster. Only two light levels were measured, and
      // mid-summer air and soil were warmer in the clearcut too, so heat and drought ride along
      // with the light in every figure this paper reports
      survivalCeiling: 36.4,
      survivalCeilingTier: 'B',
      survivalCeilingCitations: ['nelson2007-late-seral-herbs'],
      survivalCeilingNote:
        'Nelson et al. 2007 measured growing-season light (PPFD) at 36.4 mol/m2/d in a Washington clearcut. Tagged Asarum caudatum plants (ramets) there survived at about 30% of the rate in the old-growth forest next to it in year 1, and survival was still low in year 2. Only two light levels were compared, one clearcut and one forest stand, and mid-summer heat and drought ran higher in the clearcut too',
    },
  ],
  [
    'ramps',
    'Allium tricoccum',
    'Amaryllidaceae',
    'ramps|wild leek',
    'leafy-vegetables',
    'understory-herbs',
    'rosette',
    'cool-perennial',
    3,
    6,
    12,
    'C',
    2,
    1825,
    15,
    0.3,
    0.15,
    {
      life: 'perennial',
      coldC: -37,
      // A spring ephemeral of eastern North American hardwood forests (Chamberlain 2014), so it
      // grows only where winters are cold. The cool-perennial envelope says nothing about that
      // winter: a highland tropical site sits inside it in every month, and without the cold-winter
      // gate Nairobi would rank ramps first in a shaded bed
      coldWinterOnly: true,
      window: [3, 5],
      maxRsr: 0.75,
      maxRsrTier: 'C',
      // USDA Forest Service, USDA National Agroforestry Center, for Southern Appalachia
      // (represented by Asheville, NC): "The timing of harvest may differ geographically. For
      // example, in southern Appalachia the optimal time to harvest is usually about the third week
      // in April, whereas in cooler northern climates harvesting may be best a bit later". The
      // median last spring freeze there is Apr 9 at Asheville Regional Airport, NC, so picking
      // starts 6 days after it and runs 6 days. The stated best week, since ramps are dug once in
      // spring
      harvest: {
        afterFreezeDays: 6,
        citations: ['usfs-2014-ramps', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 6,
    },
  ],
  [
    'enset',
    'Ensete ventricosum',
    'Musaceae',
    'enset|false banana',
    'fruits',
    'leafy-greens',
    'upright-herb',
    'subtropical',
    10,
    18,
    26,
    'C',
    1,
    1825,
    300,
    6,
    4,
    {
      life: 'perennial',
      coldC: 0,
      yearsToMature: 5,
      laubNote: NO_COMPARABLE_CROP_NOTE,
    },
  ],

  // Tropical and subtropical staples (Decision Record 23). Every envelope below is transcribed
  // from the crop's ECOCROP data sheet, cited by EcoPort id. `coldC` is the sheet's killing
  // temperature during rest and is omitted where the sheet has none. `koppen` is the sheet's
  // climate zones read through the Trewartha table above. The DLI figures are the sun-label
  // class inferences every other Tier C row carries, and each growth figure names its sheet
  [
    'cassava',
    'Manihot esculenta',
    'Euphorbiaceae',
    'cassava|manioc|yuca',
    'tubers-root-crops',
    'root-tuber',
    'bush',
    'hot',
    // ECOCROP sheet 1420 light 'very bright': the root-tuber full-sun band sweet potato carries
    14,
    20,
    28,
    'C',
    // Duke 1983 (Purdue NewCROP): cassava is 'reported to tolerate' shade, and NC State lists
    // partial shade beside full sun
    1,
    // Duke 1983: 'harvested in 10-14 months'. 300 is the ten-month end, inside ECOCROP sheet
    // 1420's 180 to 365 day cycle
    300,
    // Duke 1983: '1 m each way for weak cvs on poor soils'
    100,
    // NC State: 6 to 10 ft. Duke 1983: 1.3 to 5 m. Two meters sits in both
    2,
    // the 1 m planting interval Duke gives. NC State's 6 to 10 ft spread is an unpruned specimen
    1,
    {
      // ECOCROP sheet 1420: perennial, harvested in its first year
      life: 'perennial',
      yearsToMature: 1,
      // ECOCROP sheet 1420 killing temperature during rest
      coldC: 7,
      // ECOCROP sheet 1420: temperature 10 / 20-29 / 35 C, rainfall 500 / 1000-1500 / 5000 mm,
      // pH 4 / 5.5-8 / 9, cycle 180 to 365 days
      temp: [10, 20, 29, 35],
      rain: [500, 1000, 1500, 5000],
      ph: [4, 5.5, 8, 9],
      cycle: [180, 365],
      // ECOCROP sheet 1420 climate zones: Aw, Ar, Bs
      koppen: [...AW, ...AR, ...BS],
      // FAO-56 Table 22, cassava year 1: Zr 0.5-0.8 m, p 0.35
      zr: 0.65,
      p: 0.35,
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'taro',
    'Colocasia esculenta',
    'Araceae',
    'taro|dasheen|eddo',
    'tubers-root-crops',
    'root-tuber',
    'upright-herb',
    'hot',
    // ECOCROP sheet 758 optimum 'clear skies' with an absolute range reaching 'light shade', and
    // NC State lists partial shade: the full/part sun band the root crops carry (carrot, beet)
    8,
    14,
    20,
    'C',
    // ECOCROP's absolute light range reaches 'light shade'. NC State: 'Partial Shade'
    1,
    // CTAHR HGV-18: 'ready for harvest 8-10 months after planting'. 240 is the eight-month end,
    // inside ECOCROP sheet 758's 180 to 300 day cycle
    240,
    // CTAHR HGV-18: '18-24 inches apart within rows 18-24 inches apart', the 24 in end
    60,
    // NC State: 3 to 6 ft high and wide. The 3 ft end is what a corm planting reaches
    1,
    1,
    {
      // ECOCROP sheet 758: perennial herb, harvested in its first year. The sheet has no killing
      // temperature, so no cold floor is claimed
      life: 'perennial',
      yearsToMature: 1,
      // ECOCROP sheet 758: temperature 10 / 21-28 / 35 C, rainfall 1000 / 1800-2700 / 4100 mm,
      // pH 4.3 / 5.5-6.5 / 8.2 (CTAHR: best at 5.5-6.5), cycle 180 to 300 days
      temp: [10, 21, 28, 35],
      rain: [1000, 1800, 2700, 4100],
      ph: [4.3, 5.5, 6.5, 8.2],
      cycle: [180, 300],
      // ECOCROP sheet 758 climate zones: Aw, Ar, Cf
      koppen: [...AW, ...AR, ...CF],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'yam-greater',
    'Dioscorea alata',
    'Dioscoreaceae',
    'greater yam|water yam|winged yam|ube',
    'tubers-root-crops',
    'root-tuber',
    'vining-trellised',
    'hot',
    // ECOCROP sheet 936 optimum 'very bright': the root-tuber full-sun band
    14,
    20,
    28,
    'C',
    // ECOCROP's absolute light range reaches 'light shade'
    1,
    // ECOCROP sheet 936 cycle 220 to 300 days, the 260 midpoint
    260,
    // Wilson 1988 (IRETA): minisetts at 1 x 0.25 m or 1 x 0.5 m, the 0.5 m end in the row
    50,
    // Wilson 1988: 'Stakes 1 to 2 m high are adequate'. The trellised vine stands at the 2 m end
    2,
    // the 0.5 m in-row interval Wilson gives
    0.5,
    {
      // ECOCROP sheet 936: perennial vine, harvested in its first year
      life: 'perennial',
      yearsToMature: 1,
      // ECOCROP sheet 936 killing temperature during rest
      coldC: -2,
      // ECOCROP sheet 936 physiology: deciduous
      deciduous: true,
      // Wilson 1988: 1 m between rows
      betweenCm: 100,
      // ECOCROP sheet 936: temperature 14 / 20-32 / 40 C, rainfall 700 / 1200-4000 / 8000 mm,
      // pH 4.8 / 5.5-6.5 / 8.5, cycle 220 to 300 days
      temp: [14, 20, 32, 40],
      rain: [700, 1200, 4000, 8000],
      ph: [4.8, 5.5, 6.5, 8.5],
      cycle: [220, 300],
      // ECOCROP sheet 936 climate zones: Aw, Ar, Cf, Cs
      koppen: [...AW, ...AR, ...CF, ...CS],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'plantain',
    'Musa x paradisiaca',
    'Musaceae',
    'plantain|cooking banana',
    'fruits',
    'cucurbits',
    'upright-herb',
    'subtropical',
    // ECOCROP sheet 7849 light 'very bright' and NC State full sun: the full-sun fruiting band
    // winter squash carries. The class is the nearest light class this table has for a fruiting
    // herb. Laub's fruits curve is the yield term
    14,
    20,
    28,
    'C',
    0,
    // ECOCROP sheet 7849 cycle 180 to 365 days, the first bunch at the 365 end
    365,
    // NC State: 'available space to plant 12-24 feet', the 12 ft end
    360,
    // NC State: 7 to 25 ft. 10 ft, inside that range, is a fruiting pseudostem
    3,
    // NC State: 6 to 10 ft, the 8 ft midpoint
    2.4,
    {
      // ECOCROP sheet 7849 (Musa acuminata x balbisiana, the parentage WCVP files as Musa x
      // paradisiaca): perennial herb, first bunch within the cycle
      life: 'perennial',
      yearsToMature: 1,
      // ECOCROP sheet 7849 killing temperature during rest
      coldC: 1,
      // ECOCROP sheet 7849: temperature 15 / 25-35 / 40 C, rainfall 1000 / 1400-2400 / 5000 mm,
      // pH 4.5 / 5.5-6.5 / 8, cycle 180 to 365 days
      temp: [15, 25, 35, 40],
      rain: [1000, 1400, 2400, 5000],
      ph: [4.5, 5.5, 6.5, 8],
      cycle: [180, 365],
      // ECOCROP sheet 7849 climate zones: Aw, Ar, Bs, Cf, Cs, Cw
      koppen: [...AW, ...AR, ...BS, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, banana first year: Zr 0.5-0.9 m, p 0.35
      zr: 0.7,
      p: 0.35,
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'rice-upland',
    'Oryza sativa',
    'Poaceae',
    'upland rice|rice',
    'c3-cereals',
    'c3-cereals',
    'clumping-grass',
    'hot',
    // ECOCROP sheet 1574 light 'very bright': the cereal full-sun band spring wheat carries
    14,
    20,
    28,
    'C',
    0,
    // Oikeh et al. (WARDA): medium-maturing upland cultivars take 100 to 120 days, and Duke 1983
    // gives 135 for some US cultivars. 120 is the WARDA class ceiling
    120,
    // Oikeh et al. (WARDA): 'Dibbling at 30 x 30 cm or 20 x 20 cm'. Duke 1983: 10 to 20 cm apart
    // in 20 to 30 cm rows
    20,
    // Duke 1983: 'Erect annual grass, to 1.2 m tall', and 1 m sits inside that
    1,
    // the 20 cm hill interval
    0.2,
    {
      // ECOCROP sheet 1574: temperature 10 / 20-30 / 36 C, rainfall 1000 / 1500-2000 / 4000 mm,
      // pH 4.5 / 5.5-7 / 9, cycle 80 to 180 days. The sheet has no killing temperature
      temp: [10, 20, 30, 36],
      rain: [1000, 1500, 2000, 4000],
      ph: [4.5, 5.5, 7, 9],
      cycle: [80, 180],
      // ECOCROP sheet 1574 climate zones: Aw, Ar, Cf, Cs, Cw
      koppen: [...AW, ...AR, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, rice: Zr 0.5-1.0 m, p 0.20 (the table's saturation value)
      zr: 0.75,
      p: 0.2,
      laubNote: LAUB_EXCLUDED_NOTE,
    },
  ],
  [
    'lemon',
    'Citrus x limon',
    'Rutaceae',
    'lemon',
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    // ECOCROP sheet 714 light 'very bright' and IFAS 'full sun': the class floor and full-sun
    // band the temperate tree fruits carry. No citrus DLI figure exists in the corpus
    15,
    20,
    30,
    'C',
    0,
    // ECOCROP sheet 714 cycle 210 to 365 days, a fruit cycle of the full year
    365,
    // IFAS HS1153: '15 to 25 feet or more' from buildings and other trees, the 15 ft end
    460,
    // IFAS HS1153: 'maintained at 7 to 10 ft high and 10 to 15 ft wide', the 10 ft height and
    // width ends (NC State: 10 to 20 ft high, 10 to 15 ft wide)
    3,
    3,
    {
      // IFAS HS1153: 'Young trees usually begin fruit production in the third year'
      yearsToMature: 3,
      // ECOCROP sheet 714 killing temperature during rest. IFAS puts severe wood damage at 20 F
      // (-6.7 C)
      coldC: -6,
      // ECOCROP sheet 714 physiology: evergreen
      deciduous: false,
      // ECOCROP sheet 714: temperature 12 / 15-28 / 36 C, rainfall 300 / 1000-2300 / 4000 mm,
      // pH 5.5 / 6.5-7 / 8, cycle 210 to 365 days
      temp: [12, 15, 28, 36],
      rain: [300, 1000, 2300, 4000],
      ph: [5.5, 6.5, 7, 8],
      cycle: [210, 365],
      // ECOCROP sheet 714 climate zones: Aw, Bs, Cf, Cs, Cw
      koppen: [...AW, ...BS, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, citrus at 50 percent canopy: Zr 1.1-1.5 m, p 0.50
      zr: 1.3,
      p: 0.5,
      // as apple and grape: the berry class ceiling is Laub's berries, so a tree fruit takes
      // the 0.1 floor as its own Tier C inference
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // University of California Cooperative Extension, for San Joaquin Valley South, California
      // (Tulare and Kern counties): "Typically one-third of the orchard is picked in each of three
      // harvests over the growing season. Lemons are picked and graded by size and normally
      // harvested from mid October through March". The median last spring freeze there is Jan 17 at
      // Bakersfield AP, CA, so picking starts 271 days after it and runs 167 days. A commercial
      // cost study for the southern San Joaquin Valley
      harvest: {
        afterFreezeDays: 271,
        citations: [
          'ucce-2010-lemon-cost-study-sjv-south',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 167,
    },
  ],
  [
    'orange',
    'Citrus sinensis',
    'Rutaceae',
    'orange|sweet orange',
    // laubGroup, dliClass, habit, archetype, DLI figures, tier and maxRsr as lemon
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    // Texas A&M AgriLife (Sauls): "Citrus requires full sunlight for optimum growth and
    // production"
    0,
    // ECOCROP sheet 720 cycle 180 to 365 days, a fruit cycle of the full year, as lemon and mango
    365,
    // UC Cooperative Extension, Sacramento County (GN127): "Space standard trees at least 12
    // feet apart"
    366,
    // UCCE Santa Clara County: "Navel - Standard tree 20 to 25 feet high", the 22.5 ft midpoint
    6.86,
    // no source gives orange a canopy spread distinct from its height or spacing, as lemon
    3,
    {
      life: 'woody-perennial',
      // Clemson HGIC 1364: "Young, grafted oranges, grapefruits, and mandarins must grow for 5
      // years before they will flower and produce fruit"
      yearsToMature: 5,
      // UC Cooperative Extension, Sacramento County (GN127): "Oranges and mandarins ... 21F"
      coldC: -6.1,
      deciduous: false,
      // ECOCROP sheet 720: temperature 13 / 20-30 / 38 C, rainfall 450 / 1200-2000 / 2700 mm,
      // pH 4 / 5-6 / 8.3, cycle 180 to 365 days
      temp: [13, 20, 30, 38],
      rain: [450, 1200, 2000, 2700],
      ph: [4, 5, 6, 8.3],
      cycle: [180, 365],
      // ECOCROP sheet 720 climate zones: Aw, Ar, Bs, Cf, Cs, Cw
      koppen: [...AW, ...AR, ...BS, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, citrus at 50% canopy: Zr 1.1-1.5 m, p 0.50, the 1.3 m midpoint, as
      // lemon
      zr: 1.3,
      p: 0.5,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // UC Cooperative Extension, Santa Clara County, for San Jose, CA (USW00023293, Jan 12
      // median last spring freeze): "Washington Navel - harvest Dec - May", picking starts 323
      // days after the freeze and runs 181 days
      harvest: {
        afterFreezeDays: 323,
        citations: ['ucanr-santaclara-citrus', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 181,
    },
  ],
  [
    'lime',
    'Citrus x latifolia',
    'Rutaceae',
    'lime|persian lime|tahiti lime',
    // laubGroup, dliClass, habit, archetype, DLI figures, tier and maxRsr as lemon
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    // UCCE Santa Clara County: "Limes and most lemons do not need full sun or long periods of
    // heat to ripen fruit", unlike oranges and grapefruit, which "need heat for pigmentation and
    // sweetness"
    1,
    // ECOCROP sheet 4631 cycle fixed at 365 days, a fruit cycle of the full year, as lemon and
    // mango
    365,
    // UC Cooperative Extension, Sacramento County (GN127): "Space standard trees at least 12
    // feet apart"
    366,
    // Texas A&M AgriLife (Galveston County)'s own height figure for lime isn't used
    // (readFullText false), as lemon
    3,
    // no source gives lime a canopy spread, as lemon
    3,
    {
      life: 'woody-perennial',
      // Texas A&M AgriLife (Sauls): general citrus statement, "usually do not produce until the
      // third year", no lime-specific figure exists
      yearsToMature: 3,
      // UC Cooperative Extension, Sacramento County (GN127): "Limes ... 29F"
      coldC: -1.7,
      deciduous: false,
      // ECOCROP sheet 4631: temperature 12 / 20-28 / 32 C, rainfall 750 / 1200-1500 / 2300 mm,
      // pH 5 / 5.5-6.5 / 7.5, cycle a fixed 365 days
      temp: [12, 20, 28, 32],
      rain: [750, 1200, 1500, 2300],
      ph: [5, 5.5, 6.5, 7.5],
      cycle: [365, 365],
      // ECOCROP sheet 4631 climate zones: Aw
      koppen: [...AW],
      // FAO-56 Table 22, citrus at 50% canopy: Zr 1.1-1.5 m, p 0.50, the 1.3 m midpoint, as
      // lemon
      zr: 1.3,
      p: 0.5,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // UCCE Santa Clara County, for San Jose, CA (USW00023293, Jan 12 median last spring
      // freeze): Bearss lime "Harvest Aug-Mar", picking starts 201 days after the freeze and
      // runs 242 days
      harvest: {
        afterFreezeDays: 201,
        citations: ['ucanr-santaclara-citrus', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 242,
    },
  ],
  [
    'mandarin',
    'Citrus reticulata',
    'Rutaceae',
    'mandarin|satsuma|tangerine',
    // laubGroup, dliClass, habit, archetype, DLI figures, tier and maxRsr as lemon
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    // Clemson HGIC 1364: "Citrus trees should be planted in a full-sun location to achieve
    // maximum production"
    0,
    // ECOCROP sheet 718 cycle 60 to 365 days, a fruit cycle of the full year, as lemon and mango
    365,
    // UC Cooperative Extension, Sacramento County (GN127): "Space standard trees at least 12
    // feet apart"
    366,
    // Texas A&M AgriLife (Galveston County)'s own height figure for mandarin isn't used
    // (readFullText false), as lemon
    3,
    // no source gives mandarin a canopy spread, as lemon
    3,
    {
      life: 'woody-perennial',
      // Clemson HGIC 1364: "Young, grafted oranges, grapefruits, and mandarins must grow for 5
      // years before they will flower and produce fruit"
      yearsToMature: 5,
      // Clemson HGIC 1364's cold-hardiness table, Satsuma 'Owari': "19.8-20.7 F", the 20.25 F
      // midpoint, the variety matching this crop's own common-name list
      coldC: -6.5,
      deciduous: false,
      // ECOCROP sheet 718: temperature 12 / 23-34 / 38 C, rainfall 300 / 1200-1800 / 4000 mm,
      // pH 5.5 / 6-6.8 / 8.3, cycle 60 to 365 days
      temp: [12, 23, 34, 38],
      rain: [300, 1200, 1800, 4000],
      ph: [5.5, 6, 6.8, 8.3],
      cycle: [60, 365],
      // ECOCROP sheet 718 climate zones: Aw, Bs, Cf, Cs, Cw
      koppen: [...AW, ...BS, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, citrus at 50% canopy: Zr 1.1-1.5 m, p 0.50, the 1.3 m midpoint, as
      // lemon
      zr: 1.3,
      p: 0.5,
      maxRsr: 0.1,
      maxRsrTier: 'C',
      // UCCE Santa Clara County, for San Jose, CA (USW00023293, Jan 12 median last spring
      // freeze): Satsuma, "a group of varieties including Owari... Harvest Dec - Apr, depending
      // on variety", picking starts 323 days after the freeze and runs 150 days
      harvest: {
        afterFreezeDays: 323,
        citations: ['ucanr-santaclara-citrus', 'noaa-ncei-2021-climate-normals-1991-2020'],
      },
      harvestDays: 150,
    },
  ],
  [
    'mango',
    'Mangifera indica',
    'Anacardiaceae',
    'mango',
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    // ECOCROP sheet 1416 light 'very bright' and IFAS 'full sun': the class floor and full-sun
    // band the temperate tree fruits carry. No mango DLI figure exists in the corpus
    15,
    20,
    30,
    'C',
    0,
    // ECOCROP sheet 1416 cycle 150 to 365 days, a fruit cycle of the full year
    365,
    // IFAS HS2: less vigorous varieties kept pruned 'may be planted 12 to 15 feet apart', the
    // 12 ft end
    370,
    // IFAS HS2: 'Left unpruned many mango varieties become medium to large (30 to 100 ft) trees',
    // the 30 ft end
    9,
    // the 15 ft top of the pruned spacing IFAS gives
    4.6,
    {
      // IFAS HS2: 'Grafted trees will begin to bear 3 to 5 years after planting', the midpoint
      yearsToMature: 4,
      // ECOCROP sheet 1416 killing temperature during rest. IFAS: mature trees are injured at
      // 25 F (-3.9 C) and young trees killed at 29 to 30 F
      coldC: -1,
      // ECOCROP sheet 1416: evergreen tree
      deciduous: false,
      // ECOCROP sheet 1416: temperature 8 / 24-30 / 48 C, rainfall 300 / 600-1500 / 2600 mm,
      // pH 4.3 / 5.5-7.5 / 8.5, cycle 150 to 365 days
      temp: [8, 24, 30, 48],
      rain: [300, 600, 1500, 2600],
      ph: [4.3, 5.5, 7.5, 8.5],
      cycle: [150, 365],
      // ECOCROP sheet 1416 climate zones: Aw, Ar, Bw, Bs, Cs
      koppen: [...AW, ...AR, ...BW, ...BS, ...CS],
      // as apple and grape: the 0.1 floor as the tree fruit's own Tier C inference
      maxRsr: 0.1,
      maxRsrTier: 'C',
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'papaya',
    'Carica papaya',
    'Caricaceae',
    'papaya|papaw',
    'fruits',
    'cucurbits',
    'upright-herb',
    'subtropical',
    // ECOCROP sheet 630 light 'very bright' and IFAS 'full sun': the full-sun fruiting band
    14,
    20,
    28,
    'C',
    0,
    // ECOCROP sheet 630 cycle 330 to 365 days, the 330 end (IFAS: fruit 7 to 11 months after
    // planting)
    330,
    // IFAS HS11: 'at least 7 to 10 ft away from other plants', the 7 ft end
    210,
    // IFAS HS11: 'Giant arborescent plant to 33 ft (10 m) tall'. 10 ft is this app's own figure
    // for a plant kept within picking reach, a third of the way to that limit
    3,
    // the 7 ft interval IFAS gives
    2.1,
    {
      // ECOCROP sheet 630: perennial herb. IFAS: fruit within the first year
      life: 'perennial',
      yearsToMature: 1,
      // ECOCROP sheet 630 killing temperature during rest. IFAS: damaged or killed below 31 F
      coldC: -1,
      // ECOCROP sheet 630: temperature 12 / 21-30 / 44 C, rainfall 1000 / 1500-2500 / 3000 mm,
      // pH 4.5 / 5.5-7 / 8, cycle 330 to 365 days
      temp: [12, 21, 30, 44],
      rain: [1000, 1500, 2500, 3000],
      ph: [4.5, 5.5, 7, 8],
      cycle: [330, 365],
      // ECOCROP sheet 630 climate zones: Aw, Ar
      koppen: [...AW, ...AR],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'pigeon-pea',
    'Cajanus cajan',
    'Fabaceae',
    'pigeon pea|red gram|gandule',
    'grain-legumes',
    'grain-legumes',
    'bush',
    'hot',
    // ECOCROP sheet 576 light 'very bright': the grain-legume full-sun band cowpea carries
    14,
    20,
    28,
    'C',
    0,
    // USDA NRCS plant guide: '65-80 days to flower and 50-75 additional days to create mature
    // seeds', 115 to 155 in all, the 135 midpoint. Grown here as the seed-to-seed annual the
    // guide describes, though the plant can live five years
    135,
    // USDA NRCS plant guide: rows 1 to 3 ft apart with no in-row interval given, the 2 ft
    // midpoint each way
    60,
    // USDA NRCS plant guide: 'usually only reaches 3 to 6 ft', the 4.5 ft midpoint
    1.4,
    // the guide gives no spread. The 2 ft row midpoint stands in
    0.6,
    {
      // as cowpea: pods are picked over weeks
      harvestDays: 30,
      nfix: true,
      // ECOCROP sheet 576: temperature 10 / 18-38 / 45 C, rainfall 400 / 600-1500 / 4000 mm,
      // pH 4.5 / 5-7 / 8.4, cycle 90 to 365 days. The sheet has no killing temperature, and the
      // USDA guide says frost defoliates the plant
      temp: [10, 18, 38, 45],
      rain: [400, 600, 1500, 4000],
      ph: [4.5, 5, 7, 8.4],
      cycle: [90, 365],
      // ECOCROP sheet 576 climate zones: Aw, Ar, Bs, Cf, Cs, Cw
      koppen: [...AW, ...AR, ...BS, ...CF, ...CS, ...CW],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'sesame',
    'Sesamum indicum',
    'Pedaliaceae',
    'sesame|benne',
    // an oilseed with no Laub group of its own, so the C3 seed-crop curve, as sunflower
    'c3-cereals',
    'c3-cereals',
    'upright-herb',
    'hot',
    // ECOCROP sheet 1937 light 'very bright': the cereal full-sun band spring wheat carries
    14,
    20,
    28,
    'C',
    0,
    // Oplinger et al. 1990 (AFCM): 'ready for harvesting 90 to 150 days after planting', the
    // 120 midpoint
    120,
    // Oplinger et al. 1990: 250,000 to 300,000 plants per acre. 275,000 on 4,047 m2 is 0.0147 m2
    // a plant, a 12 cm square
    12,
    // Oplinger et al. 1990: 'a height of 20 to 60 in.', the 40 in midpoint
    1,
    // no sheet states a spread. Sesame is an erect single-stem annual and 0.3 m is this app's
    // own figure for one
    0.3,
    {
      // Oplinger et al. 1990: '18 to 30 in. rows', the 24 in midpoint
      betweenCm: 60,
      // ECOCROP sheet 1937: temperature 10 / 20-30 / 40 C, rainfall 300 / 500-1000 / 1500 mm,
      // pH 4.5 / 5.5-7.5 / 8, cycle 40 to 180 days. The sheet has no killing temperature
      temp: [10, 20, 30, 40],
      rain: [300, 500, 1000, 1500],
      ph: [4.5, 5.5, 7.5, 8],
      cycle: [40, 180],
      // ECOCROP sheet 1937 climate zones: Aw, Bs, Cf, Cs, Cw
      koppen: [...AW, ...BS, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, sesame: Zr 1.0-1.5 m, p 0.60
      zr: 1.25,
      p: 0.6,
      laubNote: OILSEED_NOTE,
    },
  ],
  [
    'moringa',
    'Moringa oleifera',
    'Moringaceae',
    'moringa|drumstick tree|horseradish tree',
    'leafy-vegetables',
    'leafy-greens',
    'vase-tree',
    'subtropical',
    // ECOCROP sheet 2348 light 'very bright': the full-sun herb band oregano carries, since the
    // crop is the leaf
    12,
    18,
    25,
    'C',
    0,
    // ECOCROP sheet 2348 cycle 210 to 330 days, the 210 end (Zimmerman 2020: 9 to 16 ft of growth
    // in a year)
    210,
    // Singh 2025 (UC ANR): 'spaced 3 to 6 feet apart', the 3 ft end, for leaves
    90,
    // Zimmerman 2020: a mature tree reaches 35 ft and is cut back to 3 to 4 ft for harvest. 3 m is
    // this app's own figure for a tree kept pruned between those
    3,
    // the 6 ft top of the spacing Singh gives
    1.8,
    {
      // ECOCROP sheet 2348: perennial, leaves within the first cycle
      yearsToMature: 1,
      // ECOCROP sheet 2348: temperature 7 / 20-35 / 48 C, rainfall 400 / 700-2200 / 2600 mm,
      // pH 5 / 5.5-7 / 8.5, cycle 210 to 330 days. The sheet has no killing temperature, and
      // Zimmerman says the tree dies if it freezes completely
      temp: [7, 20, 35, 48],
      rain: [400, 700, 2200, 2600],
      ph: [5, 5.5, 7, 8.5],
      cycle: [210, 330],
      // ECOCROP sheet 2348 climate zones: Aw, Bs, Cs
      koppen: [...AW, ...BS, ...CS],
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'pearl-millet',
    'Pennisetum glaucum',
    'Poaceae',
    'pearl millet|bajra|bulrush millet',
    // dliClass, habit and DLI figures as sorghum-sudangrass, grown here for grain, so no cover
    // role. Laub's forages in Table S1 are fescue, perennial grass, clovers, alfalfa and cover
    // crops, all C3 and all cut as biomass, and corn is the only C4 grain group, so a C4 grain
    // crop reads that curve
    'corn-c4',
    'forages-c3-pasture',
    'clumping-grass',
    'hot',
    12,
    20,
    30,
    'C',
    // ECOCROP sheet 8418 light 'very bright' to clear skies
    0,
    // ECOCROP sheet 8418 cycle 60 to 120 days, and 90 sits inside it
    90,
    // spacing, height and width as sorghum-sudangrass: a sheet-independent convention
    15,
    2.5,
    0.4,
    {
      // ECOCROP sheet 8418: temperature 12 / 25-35 / 40 C, rainfall 200 / 400-900 / 1700 mm,
      // pH 4.5 / 5-6.5 / 8.3, cycle 60 to 120 days
      temp: [12, 25, 35, 40],
      rain: [200, 400, 900, 1700],
      ph: [4.5, 5, 6.5, 8.3],
      cycle: [60, 120],
      // ECOCROP sheet 8418 climate zones: Aw, Ar, Bw, Bs, Cf, Cs, Cw
      koppen: [...AW, ...AR, ...BW, ...BS, ...CF, ...CS, ...CW],
    },
  ],
  [
    'finger-millet',
    'Eleusine coracana',
    'Poaceae',
    'finger millet|ragi',
    // dliClass, habit, archetype and DLI figures as pearl-millet
    'corn-c4',
    'forages-c3-pasture',
    'clumping-grass',
    'hot',
    12,
    20,
    30,
    'C',
    // no source states a full-sun requirement for finger millet specifically, as pearl-millet
    0,
    // Tamil Nadu Agricultural University, "Particulars of Ragi Strains" table, varieties CO 9,
    // CO 13 and CO (Ra) 14: duration 100-105, 95-100 and 105-110 days, the mean of the three
    // midpoints is 103
    103,
    // ICAR-IIMR package of practices: direct-sown rows 22.5-30 cm apart, plants 7.5-10 cm apart,
    // row mid 26.25 cm x in-row mid 8.75 cm, sqrt(26.25 x 8.75) = 15.2 cm
    15,
    // TNAU's same three-variety table: height 75-80, 85-90 and 115-120 cm, the mean of the three
    // midpoints is 94 cm
    0.94,
    // no source gives finger millet a spread, as pearl-millet
    0.4,
    {
      // ECOCROP sheet 5657: temperature 8 / 18-30 / 35 C, rainfall 300 / 500-1100 / 4300 mm,
      // pH 5.5 / 6-7 / 8.2, cycle 75 to 180 days
      temp: [8, 18, 30, 35],
      rain: [300, 500, 1100, 4300],
      ph: [5.5, 6, 7, 8.2],
      cycle: [75, 180],
      // ECOCROP sheet 5657 climate zones: Aw, Bw, Bs, Cf, Cs, Cw
      koppen: [...AW, ...BW, ...BS, ...CF, ...CS, ...CW],
      // FAO-56 Table 22, "Millet": Zr 1.0-2.0 m, p 0.55, the 1.5 m midpoint
      zr: 1.5,
      p: 0.55,
    },
  ],
  [
    'sorghum-grain',
    'Sorghum bicolor',
    'Poaceae',
    'grain sorghum|milo|jowar|durra|great millet',
    // dliClass, habit, DLI figures, spacing, height and width as pearl-millet above (from
    // sorghum-sudangrass), which is itself the Sorghum x drummondii cover-crop hybrid, where
    // this row is the grain species. It reads the corn curve for the same reason pearl millet
    // does: a C4 grain crop, and Laub's forages are C3 biomass
    'corn-c4',
    'forages-c3-pasture',
    'clumping-grass',
    'hot',
    12,
    20,
    30,
    'C',
    // ECOCROP sheet 48747 light 'clear skies' to 'very bright'
    0,
    // ECOCROP sheet 48747 cycle 90 to 300 days, and 110 sits inside it
    110,
    15,
    2.5,
    0.4,
    {
      // ECOCROP sheet 48747: temperature 8 / 22-35 / 40 C, rainfall 300 / 400-600 / 700 mm,
      // pH 5 / 5.5-7.5 / 8, cycle 90 to 300 days
      temp: [8, 22, 35, 40],
      rain: [300, 400, 600, 700],
      ph: [5, 5.5, 7.5, 8],
      cycle: [90, 300],
      // ECOCROP sheet 48747 climate zones: Aw, Bs, Cs
      koppen: [...AW, ...BS, ...CS],
    },
  ],
  [
    'mung-bean',
    'Vigna radiata',
    'Fabaceae',
    'mung bean|green gram|moong',
    // ECOCROP sheet 2150 lists the species life span as perennial, but mung bean is grown as a
    // seed-to-seed annual everywhere it is cultivated, so life stays 'annual' through the 'hot'
    // archetype default: no yearsToMature, no coldC. laubGroup, dliClass, habit, DLI figures,
    // harvestDays, spacing, height and width as cowpea
    'grain-legumes',
    'grain-legumes',
    'bush',
    'hot',
    14,
    20,
    28,
    'C',
    // ECOCROP sheet 2150 light 'very bright' to 'cloudy skies'
    0,
    // ECOCROP sheet 2150 cycle 50 to 120 days, and 75 sits inside it
    75,
    20,
    0.6,
    0.4,
    {
      // ECOCROP sheet 2150: temperature 8 / 21-36 / 40 C, rainfall 500 / 650-900 / 1250 mm,
      // pH 4.3 / 5.5-6.2 / 8.3, cycle 50 to 120 days
      temp: [8, 21, 36, 40],
      rain: [500, 650, 900, 1250],
      ph: [4.3, 5.5, 6.2, 8.3],
      cycle: [50, 120],
      // ECOCROP sheet 2150 climate zones: Aw, Cf
      koppen: [...AW, ...CF],
      harvestDays: 30,
      nfix: true,
      laubNote: LAUB_EXCLUDED_NOTE,
    },
  ],
  [
    'teff',
    'Eragrostis tef',
    'Poaceae',
    'teff|tef',
    // laubGroup, dliClass, habit, DLI figures, spacing, height and width as pearl-millet and
    // sorghum-grain above (from sorghum-sudangrass)
    'forages',
    'forages-c3-pasture',
    'clumping-grass',
    // ECOCROP sheet 5746's 2 C floor and 30 C ceiling sit in the temp override below. 'warm' is
    // only the nearest archetype
    'warm',
    12,
    20,
    30,
    'C',
    // ECOCROP sheet 5746 light 'very bright' to clear skies
    0,
    // ECOCROP sheet 5746 cycle 65 to 150 days, and 90 sits inside it
    90,
    15,
    2.5,
    0.4,
    {
      // ECOCROP sheet 5746: temperature 2 / 22-28 / 30 C, rainfall 300 / 600-1200 / 2500 mm,
      // pH 5 / 5.5-6.5 / 8.2, cycle 65 to 150 days
      temp: [2, 22, 28, 30],
      rain: [300, 600, 1200, 2500],
      ph: [5, 5.5, 6.5, 8.2],
      cycle: [65, 150],
      // ECOCROP sheet 5746 climate zones: Aw, Bs, Cf, Cs, Cw, Do, Dc, Df, Dw. Do and Cf both
      // read onto Cfb, and Dc and Df both read onto Dfb, so the list is deduped
      koppen: [...new Set([...AW, ...BS, ...CF, ...CS, ...CW, ...DO, ...DC, ...DF, ...DW])],
    },
  ],
  [
    'olive',
    'Olea europaea',
    'Oleaceae',
    'olive',
    // laubGroup, dliClass, habit and DLI figures as the fig row
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    // ECOCROP sheet 1553 light 'clear skies' to 'very bright'
    0,
    // ECOCROP sheet 1553 cycle 365 days, a fruit cycle of the full year, as lemon and mango
    365,
    // spacing, height and width as the fig row's garden-pruned tree: this app's own garden-scale
    // figures
    400,
    4,
    4,
    {
      life: 'woody-perennial',
      yearsToMature: 4,
      // ECOCROP sheet 1553 killing temperature during rest
      coldC: -10,
      // the spreading-tree habit defaults to deciduous. ECOCROP sheet 1553 gives an evergreen
      // tree, so this row sets it false, as lemon and mango do for their own citrus and mango
      // sheets. The sheet carries no chill figure. De Melo-Abreu et al. 2004
      // (de-melo-abreu2004-olive-chilling) put the cultivars they modeled at 150 to 300 hours
      // below 7 C, as summarized by Sahli et al. 2012 (sahli2012-chemlali-olive-chilling). This
      // app counts hours at 0 to 7.2 C, close enough to compare like with like, and the row
      // carries the least demanding cultivar's 150 so only a site with almost no winter chill
      // refuses it
      deciduous: false,
      chillHours: 150,
      // ECOCROP sheet 1553: temperature 5 / 20-34 / 40 C, rainfall 200 / 400-700 / 1200 mm,
      // pH 5.3 / 6-7 / 8.5, cycle a fixed 365 days
      temp: [5, 20, 34, 40],
      rain: [200, 400, 700, 1200],
      ph: [5.3, 6, 7, 8.5],
      cycle: [365, 365],
      // ECOCROP sheet 1553 climate zones: Ar, Bs, Cs
      koppen: [...AR, ...BS, ...CS],
      laubNote: OUTSIDE_SCOPE_NOTE,
      // California Olive Committee / California Minor Crops Council, for San Joaquin and Sacramento
      // Valleys, California (table-cultivar production areas): "Table olive harvest usually begins
      // in mid-September and can extend through November. Cultivars grown for oil, however, are
      // harvested much later so that the maximum amount of oil can accumulate in the fruit". The
      // median last spring freeze there is Jan 17 at Bakersfield AP, CA, so picking starts 241 days
      // after it and runs 76 days. A pest management strategic plan from the California Olive
      // Committee and the California Minor Crops Council, for table olives in the Central Valley
      harvest: {
        afterFreezeDays: 241,
        citations: [
          'ca-olive-committee-2003-olive-pmsp',
          'noaa-ncei-2021-climate-normals-1991-2020',
        ],
      },
      harvestDays: 76,
    },
  ],
  [
    'avocado',
    'Persea americana',
    'Lauraceae',
    'avocado',
    // tree conventions (laubGroup, dliClass, habit, DLI figures, deciduous, maxRsr, spacing,
    // height, width, daysToMaturity) as the mango row, an evergreen subtropical fruit tree
    'fruits',
    'cane-bush-berries',
    'spreading-tree',
    'subtropical',
    15,
    20,
    30,
    'C',
    // ECOCROP sheet 1659 (the species sheet) light 'clear skies' to 'very bright'
    0,
    365,
    370,
    9,
    4.6,
    {
      life: 'woody-perennial',
      yearsToMature: 4,
      // ECOCROP sheet 1659 killing temperature during rest
      coldC: -4,
      deciduous: false,
      // ECOCROP sheet 1659: temperature 10 / 14-40 / 45 C, rainfall 300 / 500-2000 / 2500 mm,
      // pH 4.5 / 5-5.8 / 7
      temp: [10, 14, 40, 45],
      rain: [300, 500, 2000, 2500],
      ph: [4.5, 5, 5.8, 7],
      // the species sheet gives no cycle (0 to 0). 300 to 365 days is transcribed from the
      // Guatemalan race instead, ECOCROP sheet 17645
      cycle: [300, 365],
      // ECOCROP sheet 1659 climate zones: Aw, Ar
      koppen: [...AW, ...AR],
      maxRsr: 0.1,
      maxRsrTier: 'C',
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'coffee',
    'Coffea arabica',
    'Rubiaceae',
    'arabica coffee|coffee',
    'berries',
    'cane-bush-berries',
    'bush',
    'subtropical',
    // DLI figures as currant-black: a class-level figure taken directly, with no per-crop trial
    6,
    12,
    18,
    'C',
    // ECOCROP sheet 749 light 'very bright' to 'light shade': light shade is tolerated
    1,
    // ECOCROP sheet 749 cycle 210 to 330 days, and 270 is this app's own midpoint, with no
    // secondary source dating first harvest more precisely
    270,
    // spacing, height and width as a garden-pruned shrub: this app's own garden-scale figures
    150,
    2,
    1.5,
    {
      life: 'woody-perennial',
      yearsToMature: 3,
      // ECOCROP sheet 749 carries no killing temperature. Frost kills arabica, so this app sets its
      // own freezing-point floor
      coldC: 0,
      // ECOCROP sheet 749: temperature 10 / 14-28 / 34 C, rainfall 750 / 1400-2300 / 4200 mm,
      // pH 4.3 / 5.5-7 / 8.4, cycle 210 to 330 days
      temp: [10, 14, 28, 34],
      rain: [750, 1400, 2300, 4200],
      ph: [4.3, 5.5, 7, 8.4],
      cycle: [210, 330],
      // ECOCROP sheet 749 climate zones: Aw, Cf, Cw
      koppen: [...AW, ...CF, ...CW],
      laubNote: LAUB_EXCLUDED_NOTE,
    },
  ],
  [
    'tea',
    'Camellia sinensis',
    'Theaceae',
    'tea|tea plant',
    // laubGroup, dliClass, habit and archetype as coffee, the catalog's other shade-grown
    // shrub crop. No crop in the nine Laub groups is harvested as a picked leaf flush, so the
    // group is an analogy this app chose
    'berries',
    'cane-bush-berries',
    'bush',
    'subtropical',
    6,
    12,
    18,
    'C',
    // University of Arkansas Division of Agriculture: "Plants are understory shrubs in nature
    // and grow in moderate to heavy shade, but tea plantations are almost always in open fields
    // in full sun", a stronger shade affinity than coffee's own "light shade"
    2,
    // ECOCROP sheet 599 cycle 240 to 365 days, a fruit cycle of the full year, as lemon and mango
    365,
    // Zhang et al. 2022, Mississippi State field trial: "0.76 m between plants within a row,
    // 0.91 m between inner rows", sqrt(76 x 91 cm) = 83.2 cm
    83,
    // NC State Extension Plant Toolbox: "Height: 6 ft. 0 in. - 15 ft. 0 in.", the 10.5 ft
    // midpoint
    3.2,
    // NC State Extension Plant Toolbox: "Width: 4 ft. 0 in. - 8 ft. 0 in.", the 6 ft midpoint
    1.83,
    {
      life: 'woody-perennial',
      // not found, the catalog keeps the perennial default of 3 years
      // NC State Extension Plant Toolbox: the Chinese type (var. sinensis) is "hardy into USDA
      // Zone 6" and the Assam type (var. assamica) only to "zone 7 and south". Zone 7a, the
      // warmer of the two, so a site this row admits is always warm enough for either type
      coldC: -17.8,
      // ECOCROP sheet 599: temperature 8 / 20-30 / 35 C, rainfall 1000 / 1400-2000 / 5000 mm,
      // pH 4 / 4.5-5.5 / 6, cycle 240 to 365 days
      temp: [8, 20, 30, 35],
      rain: [1000, 1400, 2000, 5000],
      ph: [4, 4.5, 5.5, 6],
      cycle: [240, 365],
      // ECOCROP sheet 599 climate zones: Aw, Ar, Cf
      koppen: [...AW, ...AR, ...CF],
      // FAO-56 Table 22, "Tea - non-shaded": Zr 0.9-1.5 m, p 0.40, the 1.2 m midpoint
      zr: 1.2,
      p: 0.4,
      // Zhang et al. 2022, sampling fresh leaf at the Mississippi State field trial "in spring,
      // summer, and fall... on April 10, July 12, and October 18": their picking schedule
      // for the trial
      harvest: { wholeSeason: true, citations: ['zhang-2022-tea-shade-nets-mississippi'] },
      laubNote: NO_COMPARABLE_CROP_NOTE,
    },
  ],
  [
    'cacao',
    'Theobroma cacao',
    'Malvaceae',
    'cacao|cocoa',
    // laubGroup, dliClass, habit and archetype as coffee
    'berries',
    'cane-bush-berries',
    'bush',
    'subtropical',
    6,
    12,
    18,
    'C',
    // Duke 1983: "Plants are shade-tolerant... Seedling cacao does best with only 25% full
    // sunlight, saplings with closer to 50%", a stronger shade need than coffee's own
    2,
    // ECOCROP sheet 2074 cycle 180 to 365 days, a fruit cycle of the full year, as lemon and
    // mango
    365,
    // CTAHR AB-17 (Kona, Hawaii economic case study): "The example farm's tree spacing is 6 ft
    // by 7 ft", sqrt(6 x 7) = 6.48 ft
    198,
    // Duke 1983: "Small tree usually 4-8 m tall, rarely up to 20 m", the 6 m midpoint
    6,
    // no source gives cacao a canopy spread distinct from its own tree spacing, the spacing
    // above stands in, as chayote's and black-walnut's do
    1.98,
    {
      life: 'woody-perennial',
      // Duke 1983: "Remove floral buds until trees are 5 years old"
      yearsToMature: 5,
      // ECOCROP sheet 2074 killing temperature during rest, as mango's own sheet gives its own
      coldC: 0,
      // ECOCROP sheet 2074: temperature 10 / 21-32 / 38 C, rainfall 900 / 1200-3000 / 7600 mm,
      // pH 4 / 5-6.5 / 8, cycle 180 to 365 days
      temp: [10, 21, 32, 38],
      rain: [900, 1200, 3000, 7600],
      ph: [4, 5, 6.5, 8],
      cycle: [180, 365],
      // ECOCROP sheet 2074 climate zones: Aw, Ar
      koppen: [...AW, ...AR],
      // FAO-56 Table 22, "Cacao": Zr 0.7-1.0 m, p 0.30, the 0.85 m midpoint
      zr: 0.85,
      p: 0.3,
      // Duke 1983: "fruits mature throughout the year"
      harvest: { wholeSeason: true, citations: ['duke-1983-cacao-energy-crops'] },
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],
  [
    'banana',
    'Musa acuminata',
    'Musaceae',
    'banana|dessert banana|Cavendish',
    // every other column and override (laubGroup, dliClass, habit, DLI figures, daysToMaturity,
    // spacing, height, width, zr, p, life, yearsToMature) copied from the plantain row above,
    // the same genus
    'fruits',
    'cucurbits',
    'upright-herb',
    'subtropical',
    14,
    20,
    28,
    'C',
    // ECOCROP sheet 7848 light 'very bright' to 'light shade': light shade is tolerated
    1,
    365,
    360,
    3,
    2.4,
    {
      life: 'perennial',
      yearsToMature: 1,
      // ECOCROP sheet 7848 killing temperature during rest
      coldC: 1,
      // ECOCROP sheet 7848: temperature 12 / 23-33 / 42 C, rainfall 650 / 1200-3600 / 5000 mm,
      // pH 4 / 5.5-7.5 / 8.4, cycle 180 to 365 days
      temp: [12, 23, 33, 42],
      rain: [650, 1200, 3600, 5000],
      ph: [4, 5.5, 7.5, 8.4],
      cycle: [180, 365],
      // ECOCROP sheet 7848 climate zones: Aw, Ar, Bs, Cf, Cs, Cw
      koppen: [...AW, ...AR, ...BS, ...CF, ...CS, ...CW],
      zr: 0.7,
      p: 0.35,
      laubNote: OUTSIDE_SCOPE_NOTE,
    },
  ],

  // Companion, insectary, cover and support species
  [
    'marigold-french',
    'Tagetes patula',
    'Asteraceae',
    'french marigold',
    'leafy-vegetables',
    'leafy-greens',
    'bush',
    'warm',
    10,
    16,
    24,
    'C',
    1,
    60,
    25,
    0.4,
    0.3,
    { role: 'insectary' },
  ],
  [
    'marigold-african',
    'Tagetes erecta',
    'Asteraceae',
    'african marigold|american marigold',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'warm',
    10,
    16,
    24,
    'C',
    1,
    75,
    35,
    0.9,
    0.4,
    { role: 'insectary' },
  ],
  [
    'nasturtium',
    'Tropaeolum majus',
    'Tropaeolaceae',
    'nasturtium',
    'leafy-vegetables',
    'leafy-greens',
    'vining-ground',
    'warm',
    6,
    12,
    20,
    'C',
    2,
    55,
    35,
    0.3,
    0.9,
    { role: 'trap' },
  ],
  [
    'borage',
    'Borago officinalis',
    'Boraginaceae',
    'borage',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'warm',
    10,
    16,
    24,
    'C',
    1,
    60,
    45,
    0.8,
    0.6,
    { role: 'insectary' },
  ],
  [
    'calendula',
    'Calendula officinalis',
    'Asteraceae',
    'calendula|pot marigold',
    'leafy-vegetables',
    'leafy-greens',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    55,
    30,
    0.5,
    0.4,
    { role: 'insectary' },
  ],
  [
    'sunflower',
    'Helianthus annuus',
    'Asteraceae',
    'sunflower',
    'c3-cereals',
    'c3-cereals',
    'upright-herb',
    'warm',
    18,
    25,
    35,
    'C',
    0,
    90,
    45,
    2.5,
    0.6,
    {
      laubNote: OILSEED_NOTE,
    },
  ],
  [
    'buckwheat',
    'Fagopyrum esculentum',
    'Polygonaceae',
    'buckwheat',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'warm',
    10,
    16,
    24,
    'C',
    1,
    45,
    10,
    0.9,
    0.3,
    { role: 'cover' },
  ],
  [
    'clover-crimson',
    'Trifolium incarnatum',
    'Fabaceae',
    'crimson clover',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    90,
    8,
    0.5,
    0.2,
    { role: 'cover', nfix: true },
  ],
  [
    'clover-white',
    'Trifolium repens',
    'Fabaceae',
    'white clover|dutch clover',
    'forages',
    'forages-c3-pasture',
    'groundcover',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    2,
    365,
    8,
    0.2,
    0.4,
    {
      role: 'cover',
      life: 'perennial',
      coldC: -34,
      nfix: true,
    },
  ],
  [
    'clover-red',
    'Trifolium pratense',
    'Fabaceae',
    'red clover',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'cool-perennial',
    8,
    14,
    20,
    'C',
    1,
    365,
    15,
    0.5,
    0.3,
    { role: 'cover', life: 'perennial', coldC: -29, nfix: true },
  ],
  [
    'phacelia',
    'Phacelia tanacetifolia',
    'Boraginaceae',
    'phacelia|lacy phacelia',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'cool',
    10,
    16,
    24,
    'C',
    1,
    60,
    15,
    0.8,
    0.3,
    {
      role: 'insectary',
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'sweet-alyssum',
    'Lobularia maritima',
    'Brassicaceae',
    'sweet alyssum',
    'leafy-vegetables',
    'leafy-greens',
    'groundcover',
    'cool',
    6,
    12,
    18,
    'C',
    2,
    60,
    20,
    0.15,
    0.3,
    { role: 'insectary' },
  ],
  [
    'yarrow',
    'Achillea millefolium',
    'Asteraceae',
    'yarrow',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'hardy-perennial',
    10,
    16,
    24,
    'C',
    1,
    365,
    40,
    0.7,
    0.5,
    {
      role: 'insectary',
      life: 'perennial',
      coldC: -40,
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'ryegrass-perennial',
    'Lolium perenne',
    'Poaceae',
    'perennial ryegrass',
    'forages',
    'forages-c3-pasture',
    'clumping-grass',
    'cool-perennial',
    6,
    12,
    20,
    'C',
    2,
    365,
    5,
    0.4,
    0.15,
    { role: 'cover', life: 'perennial', coldC: -23 },
  ],
  [
    'vetch-hairy',
    'Vicia villosa',
    'Fabaceae',
    'hairy vetch',
    'forages',
    'forages-c3-pasture',
    'vining-ground',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    150,
    10,
    0.4,
    1,
    { role: 'cover', nfix: true },
  ],
  [
    'field-pea',
    'Pisum sativum',
    'Fabaceae',
    'field pea|austrian winter pea',
    'forages',
    'forages-c3-pasture',
    'vining-ground',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    120,
    10,
    0.6,
    0.4,
    { role: 'cover', nfix: true },
  ],
  [
    'mustard-cover',
    'Sinapis alba',
    'Brassicaceae',
    'white mustard',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'cool',
    8,
    14,
    20,
    'C',
    1,
    60,
    15,
    0.9,
    0.3,
    { role: 'cover' },
  ],
  [
    'sorghum-sudangrass',
    'Sorghum x drummondii',
    'Poaceae',
    'sorghum-sudangrass',
    'forages',
    'forages-c3-pasture',
    'clumping-grass',
    'hot',
    12,
    20,
    30,
    'C',
    0,
    75,
    15,
    2.5,
    0.4,
    { role: 'cover' },
  ],
  [
    'desmodium',
    'Desmodium intortum',
    'Fabaceae',
    'greenleaf desmodium',
    'forages',
    'forages-c3-pasture',
    'groundcover',
    'subtropical',
    6,
    12,
    20,
    'C',
    2,
    365,
    40,
    0.5,
    1,
    {
      role: 'cover',
      life: 'perennial',
      coldC: 2,
      nfix: true,
    },
  ],
  [
    'napier-grass',
    'Cenchrus purpureus',
    'Poaceae',
    'napier grass|elephant grass',
    'forages',
    'forages-c3-pasture',
    'clumping-grass',
    'subtropical',
    14,
    20,
    30,
    'C',
    0,
    365,
    100,
    3,
    1,
    { role: 'trap', life: 'perennial', coldC: 4 },
  ],
  [
    'comfrey',
    'Symphytum x uplandicum',
    'Boraginaceae',
    'comfrey|russian comfrey',
    'forages',
    'forages-c3-pasture',
    'rosette',
    'cool-perennial',
    6,
    12,
    18,
    'C',
    2,
    365,
    90,
    1,
    1,
    {
      life: 'perennial',
      coldC: -34,
      zr: 1.8,
      // Utah State University Extension: "Once established, harvest leaves every 2 weeks throughout
      // the growing season"
      harvest: { wholeSeason: true, citations: ['usu-extension-2023-comfrey'] },
    },
  ],
  [
    'fenugreek',
    'Trigonella foenum-graecum',
    'Fabaceae',
    'fenugreek',
    'grain-legumes',
    'grain-legumes',
    'upright-herb',
    'warm',
    12,
    18,
    25,
    'C',
    1,
    90,
    15,
    0.5,
    0.25,
    { nfix: true },
  ],
  [
    'bergamot-wild',
    'Monarda fistulosa',
    'Lamiaceae',
    'wild bergamot|bee balm',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'hardy-perennial',
    10,
    16,
    24,
    'C',
    1,
    365,
    45,
    1.2,
    0.6,
    {
      role: 'insectary',
      life: 'perennial',
      coldC: -37,
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'cup-plant',
    'Silphium perfoliatum',
    'Asteraceae',
    'cup plant',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'hardy-perennial',
    10,
    16,
    24,
    'C',
    1,
    365,
    90,
    2.5,
    1,
    {
      role: 'insectary',
      life: 'perennial',
      coldC: -40,
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'boneset',
    'Eupatorium perfoliatum',
    'Asteraceae',
    'boneset',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'hardy-perennial',
    8,
    14,
    22,
    'C',
    1,
    365,
    60,
    1.5,
    0.8,
    {
      role: 'insectary',
      life: 'perennial',
      coldC: -37,
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'lanceleaf-coreopsis',
    'Coreopsis lanceolata',
    'Asteraceae',
    'lanceleaf coreopsis',
    'forages',
    'forages-c3-pasture',
    'upright-herb',
    'hardy-perennial',
    10,
    16,
    24,
    'C',
    1,
    365,
    40,
    0.6,
    0.4,
    {
      role: 'insectary',
      life: 'perennial',
      coldC: -37,
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'canada-anemone',
    'Anemonastrum canadense',
    'Ranunculaceae',
    'canada anemone',
    'forages',
    'forages-c3-pasture',
    'groundcover',
    'hardy-perennial',
    6,
    12,
    18,
    'C',
    2,
    365,
    40,
    0.4,
    0.5,
    {
      role: 'insectary',
      life: 'perennial',
      coldC: -40,
      laubNote: NO_HARVEST_NOTE,
    },
  ],
  [
    'murnong',
    'Microseris walteri',
    'Asteraceae',
    'murnong|yam daisy',
    'tubers-root-crops',
    'root-tuber',
    'rosette',
    'cool-perennial',
    8,
    14,
    20,
    'C',
    1,
    365,
    20,
    0.3,
    0.2,
    { life: 'perennial', coldC: -7 },
  ],
]
