import { banded, interval } from '../types/band'
import type {
  CompanionRule,
  EffectMetric,
  ExperimentalCompanionRule,
  FolkloreCompanionRule,
  InteractionDirection,
  InteractionKind,
  PartitionedCompanionRules,
  RefType,
  RotationConstraint,
  RuleScope,
  ScoreableCompanionRule,
  Valence,
} from '../types/companion'
import type { FolkloreGrade, ScoreableGrade } from '../types/evidence'
import type { NonEmpty } from '../types/cited'
import type { CitationId } from '../types/citation-ids.generated'
import type { CropId, RuleId } from '../types/ids'
import type { Days, Fraction, Ratio, SquareMeters } from '../types/units'

const scope = (overrides: Partial<RuleScope> = {}): RuleScope => ({
  validScales: overrides.validScales ?? ['bed', 'plot', 'field'],
  validKoppenCodes: overrides.validKoppenCodes ?? null,
  validRegions: overrides.validRegions ?? null,
  validPestTargets: overrides.validPestTargets ?? null,
  requiresManagement: overrides.requiresManagement ?? [],
  minAreaFraction: overrides.minAreaFraction ?? null,
  minStandAreaM2: overrides.minStandAreaM2 ?? null,
  minDurationDays: overrides.minDurationDays ?? null,
  seasonOffsetDays: overrides.seasonOffsetDays ?? (0 as Days),
})

interface Endpoint {
  readonly ref: string
  readonly refType: RefType
}

const taxon = (ref: string): Endpoint => ({ ref, refType: 'taxon' })
const family = (ref: string): Endpoint => ({ ref, refType: 'family' })
const group = (ref: string): Endpoint => ({ ref, refType: 'group' })

interface ScoreableInput {
  readonly id: string
  readonly subject: Endpoint
  readonly object: Endpoint
  readonly kind: InteractionKind
  readonly grade: ScoreableGrade
  readonly mechanism: string
  readonly effectMetric: EffectMetric
  readonly effectLow: number
  readonly effectHigh: number
  readonly studyCount: number
  readonly competitionPenalty: number
  readonly valence?: Valence
  readonly direction?: InteractionDirection
  readonly scope?: Partial<RuleScope>
  readonly citations: NonEmpty<CitationId>
  readonly notes?: string
}

const scoreable = (input: ScoreableInput): ScoreableCompanionRule => ({
  id: input.id as RuleId,
  subjectRef: input.subject.ref,
  subjectRefType: input.subject.refType,
  objectRef: input.object.ref,
  objectRefType: input.object.refType,
  kind: input.kind,
  direction: input.direction ?? 'subject-affects-object',
  valence: input.valence ?? 1,
  scope: scope(input.scope),
  citations: input.citations,
  notes: input.notes ?? null,
  grade: input.grade,
  mechanism: input.mechanism,
  effectMetric: input.effectMetric,
  effect: banded(
    interval(input.effectLow as Ratio, input.effectHigh as Ratio),
    0.95,
    'confidence',
    'crop-response',
    [],
  ),
  studyCount: input.studyCount,
  competitionPenalty: input.competitionPenalty as Fraction,
})

interface ExperimentalInput {
  readonly id: string
  readonly subject: Endpoint
  readonly object: Endpoint
  readonly kind: InteractionKind
  readonly mechanism: string
  readonly valence?: Valence
  readonly scope?: Partial<RuleScope>
  readonly citations: readonly CitationId[]
  readonly notes?: string
}

const experimental = (input: ExperimentalInput): ExperimentalCompanionRule => ({
  id: input.id as RuleId,
  subjectRef: input.subject.ref,
  subjectRefType: input.subject.refType,
  objectRef: input.object.ref,
  objectRefType: input.object.refType,
  kind: input.kind,
  direction: 'subject-affects-object',
  valence: input.valence ?? 1,
  scope: scope(input.scope),
  citations: input.citations,
  notes: input.notes ?? null,
  grade: 'C',
  mechanism: input.mechanism,
  display: 'experimental',
})

interface FolkloreInput {
  readonly id: string
  readonly subject: Endpoint
  readonly object: Endpoint
  readonly kind: InteractionKind
  readonly grade: FolkloreGrade
  readonly mechanism: string | null
  readonly contradictedBy?: readonly CitationId[]
  readonly citations?: readonly CitationId[]
  readonly notes: string
}

const folklore = (input: FolkloreInput): FolkloreCompanionRule => ({
  id: input.id as RuleId,
  subjectRef: input.subject.ref,
  subjectRefType: input.subject.refType,
  objectRef: input.object.ref,
  objectRefType: input.object.refType,
  kind: input.kind,
  direction: 'subject-affects-object',
  valence: 0,
  scope: scope(),
  citations: input.citations ?? [],
  notes: input.notes,
  grade: input.grade,
  mechanism: input.mechanism,
  display: 'folklore-panel',
  contradictedBy: input.contradictedBy ?? [],
})

const RULES: readonly CompanionRule[] = [
  scoreable({
    id: 'ler-cereal-legume',
    subject: group('legume'),
    object: group('cereal'),
    kind: 'root-niche-complementarity',
    grade: 'A',
    mechanism:
      'Below-ground niche complementarity plus reduced competition for soil nitrogen: the legume draws its nitrogen from the air, leaving more soil nitrogen for the cereal',
    effectMetric: 'ler',
    effectLow: 1.22,
    effectHigh: 1.32,
    studyCount: 90,
    competitionPenalty: 0.25,
    direction: 'mutual',
    citations: ['martin-guay2018-ler', 'zhang2014-three-sisters-roots'],
    notes:
      'LER is a land-efficiency statement. Each component almost always yields less than in monoculture',
  }),
  scoreable({
    id: 'three-sisters-root-foraging',
    subject: taxon('bean-pole'),
    object: taxon('sweet-corn'),
    kind: 'root-niche-complementarity',
    grade: 'B',
    mechanism:
      'Maize forages steep and deep, bean shallow and lateral, squash intermediate and broad, so total soil exploration increases',
    effectMetric: 'ler',
    effectLow: 1.1,
    effectHigh: 1.3,
    studyCount: 2,
    competitionPenalty: 0.3,
    direction: 'mutual',
    citations: [
      'zhang2014-three-sisters-roots',
      'mt-pleasant2010-iroquoian',
      'cryan2024-three-sisters-labor',
    ],
    notes:
      'Maize is the most shade-susceptible common crop, so the light gate must run before this bonus can apply. Labour demand is materially higher than monoculture',
  }),
  scoreable({
    id: 'maize-supports-pole-bean',
    subject: taxon('sweet-corn'),
    object: taxon('bean-pole'),
    kind: 'physical-support',
    grade: 'B',
    mechanism:
      'The maize stalk provides the vertical structure a climbing bean needs, replacing a trellis',
    effectMetric: 'yield-pct',
    effectLow: 1,
    effectHigh: 1.05,
    studyCount: 2,
    competitionPenalty: 0.15,
    citations: ['zhang2014-three-sisters-roots', 'mt-pleasant2010-iroquoian'],
  }),
  scoreable({
    id: 'undersown-cover-host-finding',
    subject: group('non-host-green-cover'),
    object: family('Brassicaceae'),
    kind: 'host-finding-disruption',
    grade: 'A',
    mechanism:
      'Appropriate and inappropriate landings: non-host green surface area dilutes the landing sequence so specialist flies leave before ovipositing. The mechanism is green surface area. Smell plays no part',
    effectMetric: 'pest-density-pct',
    effectLow: 0.3,
    effectHigh: 0.7,
    studyCount: 12,
    competitionPenalty: 0.2,
    scope: {
      requiresManagement: [
        'Undersow with a low non-host cover such as white clover',
        'Raise irrigation and fertility to offset cover-crop competition',
      ],
      minAreaFraction: 0.5 as Fraction,
    },
    citations: ['finch-collier2000-landings', 'finch-collier2003'],
    notes:
      'The same cover competes for water and nutrients. Recommending it without an irrigation and fertility adjustment produces clean but stunted brassicas',
  }),
  scoreable({
    id: 'undersown-cover-allium-fly',
    subject: group('non-host-green-cover'),
    object: family('Amaryllidaceae'),
    kind: 'host-finding-disruption',
    grade: 'B',
    mechanism: 'The same landing-sequence mechanism, measured for the onion fly',
    effectMetric: 'pest-density-pct',
    effectLow: 0.4,
    effectHigh: 0.8,
    studyCount: 4,
    competitionPenalty: 0.2,
    scope: {
      requiresManagement: ['Undersow with a low non-host cover'],
      minAreaFraction: 0.5 as Fraction,
    },
    citations: ['finch-collier2003', 'uvah-coaker1984-mixed-cropping'],
  }),
  scoreable({
    id: 'insectary-strip-enemy-abundance',
    subject: group('insectary'),
    object: group('any-crop'),
    kind: 'natural-enemy-provision',
    grade: 'A',
    mechanism:
      'Umbellifer and aster florets are accessible to parasitoids and hoverflies. Of 43 screened native perennials, 26 attracted high numbers of natural enemies with bloom spread across the season',
    effectMetric: 'pest-density-pct',
    effectLow: 1.5,
    effectHigh: 3,
    studyCount: 43,
    competitionPenalty: 0.05,
    scope: {
      validScales: ['plot', 'field'],
      requiresManagement: [
        'Plant as strips or blocks, keeping the plants together',
        'Choose species so something is in flower in every two-week window',
      ],
      minStandAreaM2: 2 as SquareMeters,
    },
    citations: ['fiedler2007-insectary'],
    notes:
      'Grade A for natural-enemy abundance. Translation into measurable pest suppression is a separate grade B claim',
  }),
  scoreable({
    id: 'insectary-pest-suppression',
    subject: group('insectary'),
    object: group('any-crop'),
    kind: 'natural-enemy-provision',
    grade: 'B',
    mechanism:
      'Enhanced natural-enemy abundance translating into measurable pest suppression in the adjacent crop',
    effectMetric: 'pest-density-pct',
    effectLow: 0.7,
    effectHigh: 0.95,
    studyCount: 12,
    competitionPenalty: 0.05,
    scope: { validScales: ['plot', 'field'] },
    citations: ['fiedler2007-insectary'],
  }),
  experimental({
    id: 'marigold-cover-nematode',
    subject: taxon('marigold-french'),
    object: group('any-crop'),
    kind: 'nematode-suppression',
    mechanism:
      'Living Tagetes roots exude alpha-terthienyl, an oxidative-stress inducer that penetrates the nematode hypodermis. Marigold is also a poor host and a dead-end trap crop',
    scope: {
      requiresManagement: [
        'Grow a dense near-monoculture stand occupying the whole bed',
        'Hold the stand for a full 60 to 90 day season before the susceptible crop',
        'Use a cultivar selected for alpha-terthienyl content, some Tagetes cultivars are hosts',
      ],
      minAreaFraction: 0.9 as Fraction,
      minDurationDays: 60 as Days,
      seasonOffsetDays: 365 as Days,
    },
    citations: [],
    notes:
      'Only living root systems are nematicidal, incorporated tissue is not. The competition penalty is total because the bed grows no food crop that season',
  }),
  scoreable({
    id: 'trap-crop-managed',
    subject: group('trap-crop'),
    object: group('any-crop'),
    kind: 'trap-crop',
    grade: 'B',
    mechanism:
      'Pest concentration on a preferred host. Retention is the limiting factor, and an untended trap crop is a pest nursery',
    effectMetric: 'pest-density-pct',
    effectLow: 0.5,
    effectHigh: 0.9,
    studyCount: 100,
    competitionPenalty: 0.15,
    scope: {
      requiresManagement: [
        'Destroy, vacuum or treat the trap crop at a defined pest density',
        'Site the trap crop at the plot edge, away from the main crop',
      ],
    },
    citations: ['shelton2006-trap-cropping', 'holden2012-trap-crop-design'],
    notes:
      'About 10 of roughly 100 reviewed systems succeeded commercially, and four of those applied pesticide directly to the trap crop',
  }),
  scoreable({
    id: 'legume-residual-nitrogen',
    subject: family('Fabaceae'),
    object: group('heavy-feeder'),
    kind: 'nitrogen-residual',
    grade: 'B',
    mechanism:
      'Decomposing nodules and residues release nitrogen to the following crop, so the benefit is rotational with a season of lag',
    effectMetric: 'nitrogen-transfer-pct',
    effectLow: 0.2,
    effectHigh: 0.5,
    studyCount: 20,
    competitionPenalty: 0,
    scope: { seasonOffsetDays: 365 as Days },
    citations: ['thilakarathna2016-n-transfer'],
  }),
  scoreable({
    id: 'legume-same-season-transfer',
    subject: family('Fabaceae'),
    object: group('heavy-feeder'),
    kind: 'nitrogen-fixation-transfer',
    grade: 'B',
    mechanism:
      'Direct root-contact transfer, with no mycorrhizal network involved. Typically under 15 % of the legume nitrogen within the same season',
    effectMetric: 'nitrogen-transfer-pct',
    effectLow: 0.05,
    effectHigh: 0.15,
    studyCount: 15,
    competitionPenalty: 0.1,
    citations: ['thilakarathna2016-n-transfer'],
    notes: "Beans don't meaningfully feed your corn in the same season",
  }),
  experimental({
    id: 'biofumigation-macerated',
    subject: taxon('mustard-cover'),
    object: group('any-crop'),
    kind: 'biofumigation',
    mechanism:
      'Glucosinolates are hydrolysed by myrosinase on cell rupture to isothiocyanates. Simple incorporation converts under 1 %, cell-level disruption raises release efficiency to 14 to 26 %',
    scope: {
      requiresManagement: [
        'Use a high-glucosinolate species, Brassica juncea for preference',
        'Flail-mow and macerate at flowering to rupture cells',
        'Incorporate immediately into moist soil and tarp',
      ],
      minDurationDays: 60 as Days,
      seasonOffsetDays: 365 as Days,
    },
    citations: [],
    notes:
      'The effect needs maceration and immediate incorporation. Growing the plant beside a crop does nothing on its own',
  }),
  experimental({
    id: 'sorghum-residue-weed-suppression',
    subject: taxon('sorghum-sudangrass'),
    object: group('any-crop'),
    kind: 'allelopathy-inhibitory',
    mechanism:
      'Sorgoleone is hydrophobic, adsorbs to soil and persists, giving herbicidal activity for up to seven weeks after incorporation',
    scope: {
      requiresManagement: ['Allow a 3 to 6 week interval before direct-seeding small-seeded crops'],
      seasonOffsetDays: 365 as Days,
    },
    citations: [],
    notes: 'The same allelochemistry is autotoxic and injures small-seeded vegetables',
  }),
  scoreable({
    id: 'desmodium-interception',
    subject: taxon('desmodium'),
    object: taxon('sweet-corn'),
    kind: 'host-finding-disruption',
    grade: 'B',
    mechanism:
      'Mechanism revised: Desmodium intercepts and kills larvae on sticky trichomes. The earlier account, repelling moths with volatiles, is wrong',
    effectMetric: 'pest-density-pct',
    effectLow: 0.2,
    effectHigh: 0.5,
    studyCount: 6,
    competitionPenalty: 0.15,
    scope: {
      validScales: ['field'],
      validRegions: ['KE', 'UG', 'TZ', 'ET'],
      validPestTargets: ['Chilo partellus', 'Busseola fusca', 'Striga hermonthica'],
      requiresManagement: ['Border the plot with a 3 m Napier grass strip'],
    },
    citations: ['khan2008-push-pull-onfarm'],
    notes:
      'The push-pull outcome is grade A but non-transferable. It is scoped to East African maize at field scale and must not fire for a home-garden bed elsewhere',
  }),
  scoreable({
    id: 'nurse-shade-pawpaw',
    subject: group('nurse'),
    object: taxon('pawpaw'),
    kind: 'nurse-shade',
    grade: 'B',
    mechanism: 'Pawpaw seedlings require shade for their first one to two years',
    effectMetric: 'yield-pct',
    effectLow: 1.1,
    effectHigh: 1.5,
    studyCount: 3,
    competitionPenalty: 0.1,
    scope: { minDurationDays: 730 as Days },
    citations: ['fao-ecocrop'],
  }),

  experimental({
    id: 'juglone-inhibition',
    subject: taxon('black-walnut'),
    object: family('Solanaceae'),
    kind: 'allelopathy-inhibitory',
    mechanism:
      'Juglone is toxic to seedlings in controlled laboratory work, but juglone in its toxic form is absent from intact tissue and landscape evidence is weak. Competition for light, water and nutrients is a sufficient and simpler explanation',
    valence: -1,
    citations: ['jose-juglone'],
    notes:
      'Rendered as a warning with stated confidence. There is no defensible juglone kill radius',
  }),
  experimental({
    id: 'nasturtium-aphid-sink',
    subject: taxon('nasturtium'),
    object: family('Brassicaceae'),
    kind: 'trap-crop',
    mechanism: 'Nasturtium attracts aphids. Left standing, an infested plant breeds them',
    scope: { requiresManagement: ['Destroy or treat infested nasturtium before aphids disperse'] },
    citations: ['holden2012-trap-crop-design'],
  }),
  experimental({
    id: 'fennel-allelopathy',
    subject: taxon('fennel-bulb'),
    object: group('any-crop'),
    kind: 'allelopathy-inhibitory',
    mechanism:
      'Widely reported allelopathy toward neighbouring vegetables, with limited controlled support',
    valence: -1,
    citations: [],
    notes: 'Low-confidence caution only',
  }),

  folklore({
    id: 'aromatic-herbs-repel-pests',
    subject: group('aromatic-herb'),
    object: group('any-crop'),
    kind: 'repellent-volatile',
    grade: 'E',
    mechanism: null,
    contradictedBy: ['finch-collier2003', 'uvah-coaker1984-mixed-cropping'],
    notes:
      'Directly contradicted. Aromatic plants were no more effective than non-aromatic plants, and onions selected for pungency failed to deter landing. The mechanism is green surface area. Smell plays no part',
  }),
  folklore({
    id: 'marigold-interplanted-nematode',
    subject: taxon('marigold-french'),
    object: taxon('tomato'),
    kind: 'nematode-suppression',
    grade: 'E',
    mechanism: null,
    contradictedBy: [],
    notes:
      'A few marigolds tucked among tomatoes have no measurable effect: insufficient root density, wrong timing, wrong spatial arrangement. The full-season cover-crop form of the same claim is grade A',
  }),
  folklore({
    id: 'basil-improves-tomato-flavour',
    subject: taxon('basil'),
    object: taxon('tomato'),
    kind: 'allelopathy-stimulatory',
    grade: 'E',
    mechanism: null,
    notes: 'No controlled evidence. The pairing is a culinary and cultural association',
  }),
  folklore({
    id: 'carrots-love-tomatoes',
    subject: taxon('carrot'),
    object: taxon('tomato'),
    kind: 'allelopathy-stimulatory',
    grade: 'D',
    mechanism: null,
    notes: 'Anecdotal, untested, no proposed mechanism',
  }),
  folklore({
    id: 'borage-improves-strawberry',
    subject: taxon('borage'),
    object: taxon('strawberry'),
    kind: 'pollinator-provision',
    grade: 'D',
    mechanism: 'Claimed flavour and growth improvement, untested',
    notes:
      'Borage is a genuine bee forage, which is a separate and better-supported claim. The flavour claim is untested',
  }),
  folklore({
    id: 'onions-stunt-legumes',
    subject: family('Amaryllidaceae'),
    object: family('Fabaceae'),
    kind: 'allelopathy-inhibitory',
    grade: 'D',
    mechanism: null,
    notes: 'Widely repeated, no controlled support located',
  }),
  folklore({
    id: 'root-incompatibility',
    subject: group('any-crop'),
    object: group('any-crop'),
    kind: 'resource-competition',
    grade: 'E',
    mechanism: null,
    notes: 'No mechanism. Usually a restatement of ordinary competition',
  }),
  folklore({
    id: 'moon-phase-planting',
    subject: group('any-crop'),
    object: group('any-crop'),
    kind: 'phenological-complementarity',
    grade: 'E',
    mechanism: null,
    notes: 'No supported mechanism',
  }),
  folklore({
    id: 'chamomile-physician-plant',
    subject: taxon('chamomile'),
    object: group('any-crop'),
    kind: 'allelopathy-stimulatory',
    grade: 'E',
    mechanism: null,
    notes: 'Biodynamic origin, no mechanism, no evidence',
  }),
  folklore({
    id: 'garlic-prevents-black-spot',
    subject: taxon('garlic'),
    object: group('any-crop'),
    kind: 'repellent-volatile',
    grade: 'E',
    mechanism: null,
    contradictedBy: ['finch-collier2003'],
    notes: 'Not supported by controlled trials',
  }),
  folklore({
    id: 'acid-guild-blueberry-lingonberry',
    subject: taxon('lingonberry'),
    object: taxon('blueberry'),
    kind: 'root-niche-complementarity',
    grade: 'D',
    mechanism: null,
    citations: ['tirmenstein1991-lingonberry-feis', 'tirmenstein1991-lowbush-blueberry-feis'],
    notes:
      'The pairing is traditional and no controlled trial of it was located. What is real is only that the two species tolerate the same acid soil, and the sources cited here establish that and nothing more. The overlap is already checked as a pH compatibility term, so this rule adds no second bonus for it',
  }),
  folklore({
    id: 'sweetfern-nitrogen-to-blueberry',
    subject: taxon('sweetfern'),
    object: taxon('blueberry'),
    kind: 'nitrogen-fixation-transfer',
    grade: 'D',
    mechanism:
      'Comptonia peregrina is actinorhizal and its root nodules fix atmospheric nitrogen, which is measured. Whether any of that nitrogen reaches a neighbouring blueberry is not',
    citations: ['ziegler1963-comptonia-nitrogen', 'snyder1993-sweetfern-feis'],
    notes:
      'Graded D deliberately. Ziegler and Huser measure fixation in the nodule and FEIS reports only that sweetfern presence seemed to enhance neighbouring little bluestem growth. Neither measures transfer to a blueberry, and the legume transfer figures in thilakarathna2016-n-transfer are for Fabaceae and do not carry across to an actinorhizal shrub',
  }),
  folklore({
    id: 'dill-harms-tomato',
    subject: taxon('dill'),
    object: taxon('tomato'),
    kind: 'allelopathy-inhibitory',
    grade: 'D',
    mechanism: null,
    notes: 'Dill is a good insectary plant. The harm claim is untested',
  }),
]

const ROTATION: readonly RotationConstraint[] = [
  {
    id: 'rotation-brassica-clubroot' as RuleId,
    groupRef: 'Brassicaceae',
    pathogen: 'Plasmodiophora brassicae (clubroot)',
    minIntervalYears: 3,
    inoculumPersistenceYearsLow: 10,
    inoculumPersistenceYearsHigh: 20,
    rotationEffective: true,
    alternativeControl: 'Lime to raise pH above 7.2 and use resistant cultivars',
    grade: 'A',
    citations: ['peng2015-clubroot-rotation'],
  },
  {
    id: 'rotation-solanaceae-wilt' as RuleId,
    groupRef: 'Solanaceae',
    pathogen: 'Verticillium and Fusarium wilts, early blight, bacterial canker',
    minIntervalYears: 4,
    inoculumPersistenceYearsLow: 3,
    inoculumPersistenceYearsHigh: 10,
    rotationEffective: true,
    alternativeControl: 'Resistant cultivars and grafted rootstocks',
    grade: 'B',
    citations: ['fao-ecocrop'],
  },
  {
    id: 'rotation-allium-white-rot' as RuleId,
    groupRef: 'Amaryllidaceae',
    pathogen: 'Sclerotium cepivorum (white rot)',
    minIntervalYears: null,
    inoculumPersistenceYearsLow: 20,
    inoculumPersistenceYearsHigh: 40,
    rotationEffective: false,
    alternativeControl:
      'Exclusion only: clean sets, clean tools, no soil movement. Experimentally, diallyl disulfide germination stimulants deplete sclerotia in the absence of a host',
    grade: 'A',
    citations: ['hoanghua2024-white-rot'],
  },
]

export const loadCompanionRules = (): Promise<readonly CompanionRule[]> => Promise.resolve(RULES)

export const loadRotationConstraints = (): Promise<readonly RotationConstraint[]> =>
  Promise.resolve(ROTATION)

export const partitionCompanionRules = (
  rules: readonly CompanionRule[],
): PartitionedCompanionRules => {
  const scoreableRules: ScoreableCompanionRule[] = []
  const experimentalRules: ExperimentalCompanionRule[] = []
  const folkloreRules: FolkloreCompanionRule[] = []
  for (const rule of rules) {
    switch (rule.grade) {
      case 'A':
      case 'B':
        scoreableRules.push(rule)
        break
      case 'C':
        experimentalRules.push(rule)
        break
      default:
        folkloreRules.push(rule)
    }
  }
  return { scoreable: scoreableRules, experimental: experimentalRules, folklore: folkloreRules }
}

/** Functional groups a crop can stand in for on either end of a rule */
export const FUNCTIONAL_GROUPS: Readonly<Record<string, readonly string[]>> = {
  legume: ['Fabaceae'],
  cereal: ['Poaceae'],
  'heavy-feeder': ['Solanaceae', 'Cucurbitaceae', 'Brassicaceae', 'Poaceae'],
  'aromatic-herb': ['Lamiaceae', 'Apiaceae'],
  insectary: ['Asteraceae', 'Apiaceae', 'Boraginaceae', 'Lamiaceae'],
  'non-host-green-cover': ['Fabaceae', 'Poaceae'],
  'trap-crop': ['Cucurbitaceae', 'Brassicaceae'],
  nurse: ['Fabaceae', 'Poaceae', 'Asteraceae'],
  'any-crop': [],
}

export const ruleEndpointMatches = (
  ref: string,
  refType: RefType,
  cropId: CropId,
  cropFamily: string,
): boolean => {
  if (refType === 'taxon') return ref === (cropId as string)
  if (refType === 'family') return ref === cropFamily
  if (ref === 'any-crop') return true
  return (FUNCTIONAL_GROUPS[ref] ?? []).includes(cropFamily)
}

export const rulesTouching = (
  rules: readonly CompanionRule[],
  cropId: CropId,
  cropFamily: string,
): readonly CompanionRule[] =>
  rules.filter(
    (rule) =>
      ruleEndpointMatches(rule.subjectRef, rule.subjectRefType, cropId, cropFamily) ||
      ruleEndpointMatches(rule.objectRef, rule.objectRefType, cropId, cropFamily),
  )

export const rotationConstraintFor = (
  constraints: readonly RotationConstraint[],
  cropFamily: string,
): RotationConstraint | undefined =>
  constraints.find((constraint) => constraint.groupRef === cropFamily)
