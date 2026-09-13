import type { Crop } from '../types/crop'
import type { EvidenceGrade } from '../types/evidence'
import type { CropId } from '../types/ids'
import type { LimitingFactorKind } from '../types/recommend'
import type {
  CompatibilityTerm,
  CompatibilityTermKind,
  CompatibilityVerdict,
  PairCompatibility,
  PolycultureSuggestion,
  PreferenceKind,
  SuggestionRefusal,
} from '../types/polyculture'
import { approxCount, cropName } from './format'

export interface PreferenceKindCopy {
  readonly kind: PreferenceKind
  readonly label: string
  readonly help: string
}

/**
 * The whole easy half of this surface is these four sentences. A grower who reads only
 * them can use the panel. Everything else is opt-in
 */
export const PREFERENCE_KINDS: readonly PreferenceKindCopy[] = [
  {
    kind: 'require',
    label: 'Must have',
    help: "Every suggestion is built around it. If this bed can't grow it you are told why, and nothing is put in its place",
  },
  {
    kind: 'prefer',
    label: 'Prefer',
    help: 'Moves it up the ranking by as much as the influence control allows, and no further',
  },
  {
    kind: 'avoid',
    label: 'Avoid',
    help: 'Moves it down the same way. It can still appear where the agronomy is strong enough',
  },
  {
    kind: 'exclude',
    label: 'Never',
    help: 'Removed from every suggestion outright',
  },
]

export const TERM_LABEL: Readonly<Record<CompatibilityTermKind, string>> = {
  'soil-ph': 'Soil pH',
  'water-regime': 'Water regime',
  'root-stratification': 'Root stratification',
  'canopy-tier': 'Canopy tier',
  'light-overtopping': 'Light overtopping',
  'shared-pest-or-pathogen': 'Shared pest or pathogen',
  'documented-companion': 'Documented companion effect',
  allelopathy: 'Allelopathy',
}

export const VERDICT_LABEL: Readonly<Record<CompatibilityVerdict, string>> = {
  conflict: 'Conflict',
  caution: 'Caution',
  neutral: 'Neutral',
  benefit: 'Benefit',
}

export const CONFIDENCE_LABEL: Readonly<Record<string, string>> = {
  high: 'High confidence',
  moderate: 'Moderate confidence',
  low: 'Low confidence',
}

/** Grade D and E may be counted here but never described: the folklore panel is their only home */
export const isFolkloreGrade = (grade: EvidenceGrade | null): boolean =>
  grade === 'D' || grade === 'E'

export const shownTerms = (pair: PairCompatibility): readonly CompatibilityTerm[] =>
  pair.terms.filter((term) => !isFolkloreGrade(term.grade))

/** Claims the engine attached and the panel deliberately won't render, so the count is honest */
export const folkloreClaimCount = (pair: PairCompatibility): number =>
  pair.folklore.length + pair.terms.filter((term) => isFolkloreGrade(term.grade)).length

/** "a, b and c": the way a person says a list, used wherever crops are named in a sentence */
export const joinWords = (values: readonly string[]): string =>
  values.length < 2
    ? (values[0] ?? '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1] ?? ''}`

/**
 * The default reading of a suggestion, in the order a grower asks: what, how many, does
 * it fit. Never a yield and never a ratio, both of which are bands and are rendered as
 * bands elsewhere in the card
 */
export const suggestionHeadline = (
  catalog: readonly Crop[],
  suggestion: PolycultureSuggestion,
): string => {
  const crops = joinWords(suggestion.cropIds.map((cropId) => cropName(catalog, cropId)))
  // rounded past twenty, and "about" said once for the list rather than before each figure
  const counts = suggestion.space.allocations.map((entry) =>
    approxCount(entry.plantCount).replace('about ', ''),
  )
  const rounded = suggestion.space.allocations.some((entry) => entry.plantCount > 20)
  const area = suggestion.space.bedAreaM2.toFixed(1)
  const fit = suggestion.fits
    ? `fits your ${area} m² bed`
    : `needs ${suggestion.space.shortfallM2.toFixed(1)} m² more than your ${area} m² bed`
  return counts.length === 0
    ? `${crops}, ${fit}`
    : `${crops}, ${rounded ? 'about ' : ''}${joinWords(counts)} plants, ${fit}`
}

/**
 * The case for a combination in one plain paragraph, built from what the terms found.
 * The term-by-term case is written in the register of its evidence
 * ("cutting the 18.8 mol/m2/d this bed gets in crimson clover's season to about 13.1, above
 * the 8.0 mol/m2/d minimum but under the 17.0 it wants", "attributed to Chagga and Javanese
 * communities"), and a sentence a grower can say back in plain words comes before any of it.
 * What speaks for the mix comes from the terms that scored in its favor. What to watch comes
 * from every caution and conflict, scoring or not, because a shade the score wasn't allowed to
 * count is still shade
 */
export const plainWhy = (catalog: readonly Crop[], suggestion: PolycultureSuggestion): string => {
  const name = (id: CropId): string => cropName(catalog, id)
  const heightOf = (id: CropId): number =>
    catalog.find((crop) => crop.id === id)?.footprint.heightM.typicalM ?? 0
  const pairs = suggestion.pairs
  const kinds = (verdicts: readonly CompatibilityVerdict[], scored: boolean | null) =>
    new Set(
      pairs.flatMap((pair) =>
        pair.terms
          .filter(
            (term) =>
              verdicts.includes(term.verdict) &&
              (scored === null || term.scores === scored) &&
              !isFolkloreGrade(term.grade),
          )
          .map((term) => term.kind),
      ),
    )
  const good = kinds(['benefit'], true)
  const speaksFor: string[] = []
  if (good.has('root-stratification')) speaksFor.push('their roots reach different depths')
  if (good.has('canopy-tier'))
    speaksFor.push('they stand at different heights, so they share the light')
  if (good.has('water-regime')) speaksFor.push('one watering suits them all')
  if (good.has('documented-companion')) speaksFor.push("there's documented help between them")
  if (good.has('soil-ph')) speaksFor.push('they like the same soil')

  const watch: string[] = []
  for (const pair of pairs) {
    const [a, b] = pair.cropIds
    for (const term of pair.terms) {
      if (term.verdict !== 'caution' && term.verdict !== 'conflict') continue
      if (isFolkloreGrade(term.grade)) continue
      if (term.kind === 'light-overtopping') {
        const [taller, shorter] = heightOf(a) >= heightOf(b) ? [a, b] : [b, a]
        watch.push(`${name(taller)} will shade ${name(shorter)} some`)
      } else if (term.kind === 'water-regime')
        watch.push(`${name(a)} and ${name(b)} want different watering`)
      else if (term.kind === 'shared-pest-or-pathogen')
        watch.push(`${name(a)} and ${name(b)} share a pest`)
      else if (term.kind === 'allelopathy') watch.push(`${name(a)} holds ${name(b)} back`)
      else if (term.kind === 'soil-ph') watch.push(`${name(a)} and ${name(b)} want different soil`)
    }
  }
  const forSentence =
    speaksFor.length === 0
      ? 'Nothing in the evidence speaks against growing these together'
      : `What speaks for it: ${joinWords(speaksFor)}`
  const watchSentence = watch.length === 0 ? '' : `. To watch: ${joinWords([...new Set(watch)])}`
  return `${forSentence}${watchSentence}.`
}

export type RefusalCause = 'site' | 'soil-ph' | 'light' | 'shared-pest' | 'spacing' | 'other'

export const REFUSAL_CAUSE_LABEL: Readonly<Record<RefusalCause, string>> = {
  site: "This bed can't grow it",
  'soil-ph': 'No soil pH suits both crops',
  light: 'Would be shaded below its own light minimum',
  'shared-pest': 'Shares a pest or pathogen, and a crop rotation rule keeps them out of one bed',
  spacing: 'No usable spacing in the catalog',
  other: 'Incompatible for another reason',
}

export const REFUSAL_CAUSE_ORDER: readonly RefusalCause[] = [
  'site',
  'soil-ph',
  'light',
  'shared-pest',
  'spacing',
  'other',
]

/**
 * `SuggestionRefusal` carries `termKind` now, so the cause is read off the term that refused
 * rather than off the phrasing each term writes
 */
const CAUSE_BY_TERM: Partial<Record<CompatibilityTermKind, RefusalCause>> = {
  'soil-ph': 'soil-ph',
  'light-overtopping': 'light',
  'shared-pest-or-pathogen': 'shared-pest',
}

/**
 * The three limiting factors that are about the bed's LIGHT rather than about the site.
 *
 * Everything else that carries a limiting factor still reads as "this bed cannot grow it at all",
 * which is the harder no and belongs above any pairing. Light is the exception because in this
 * product it is the one a design causes: a crop refused on `max-design-rsr` would grow here
 * perfectly well with nothing over it, and telling a grower the site can't grow lettuce, when what
 * happened is that the panels they just chose would shade it past its own ceiling, describes the
 * wrong problem and hides the one thing they could act on. It matters because the light gate
 * reports the measured refusals an inferred threshold has overridden, which puts dozens of these on
 * any deep-shade bed.
 *
 * Deliberately NOT mapping `soil-ph` or `shared-pest-or-pathogen` onto the pairing buckets that
 * share their names: a site pH that suits no crop and two crops that can't share a pH are
 * different claims, and merging them would lose the distinction the grouping exists to draw
 */
const LIGHT_LIMITS: ReadonlySet<LimitingFactorKind['kind']> = new Set([
  'dli-minimum',
  'dli-disorder-ceiling',
  'max-design-rsr',
])

export const refusalCause = (refusal: SuggestionRefusal): RefusalCause => {
  const limiting = refusal.limiting
  // `cause` is required on the type, so the optional read is for fixtures and for any payload
  // that crossed a storage or worker boundary short of one
  if (limiting !== null) return LIGHT_LIMITS.has(limiting.cause?.kind) ? 'light' : 'site'
  if (refusal.termKind !== null) return CAUSE_BY_TERM[refusal.termKind] ?? 'other'
  return refusal.reason.includes('spacing') ? 'spacing' : 'other'
}

export interface RefusalGroup {
  readonly cause: RefusalCause
  readonly refusals: readonly SuggestionRefusal[]
}

export const groupRefusals = (refused: readonly SuggestionRefusal[]): readonly RefusalGroup[] =>
  REFUSAL_CAUSE_ORDER.map((cause) => ({
    cause,
    refusals: refused.filter((refusal) => refusalCause(refusal) === cause),
  })).filter((group) => group.refusals.length > 0)
