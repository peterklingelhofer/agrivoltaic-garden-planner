import { useMemo } from 'react'
import { EMPTY_LIST } from '../state/slices'
import { useAppStore } from '../state/store'
import type { CitationId } from '../types/citation-ids.generated'
import type { Cited, Provenance } from '../types/cited'
import type { Crop } from '../types/crop'
import type { DataTier } from '../types/evidence'
import type { LimitingFactorKind } from '../types/recommend'
import type { Fraction, MolPerM2Day } from '../types/units'
import { formatDli, formatRsr } from './format'

export type DliThresholdKind = 'minimum' | 'disorder-ceiling' | 'max-design-rsr'

const THRESHOLD_BY_CAUSE: Readonly<Record<string, DliThresholdKind>> = {
  'dli-minimum': 'minimum',
  'dli-disorder-ceiling': 'disorder-ceiling',
  'max-design-rsr': 'max-design-rsr',
}

/** Null for every cause the light gate did not raise, so a caller cannot mislabel one */
export const dliThresholdKind = (cause: LimitingFactorKind): DliThresholdKind | null =>
  THRESHOLD_BY_CAUSE[cause.kind] ?? null

export const THRESHOLD_LABEL: Readonly<Record<DliThresholdKind, string>> = {
  minimum: 'Minimum light',
  'disorder-ceiling': 'Disorder ceiling',
  'max-design-rsr': 'Maximum design shade',
}

export interface DliEvidence {
  readonly kind: DliThresholdKind
  readonly label: string
  readonly tier: DataTier | null
  readonly provenance: Provenance
  /** True when the number is the crop class's figure, never measured on this crop */
  readonly classInference: boolean
  readonly value: string
  readonly citations: readonly CitationId[]
  readonly reason: string
  readonly summary: string
}

const reasonOf = (cited: Cited<number>): string =>
  cited.provenance === 'inferred'
    ? cited.basis
    : cited.provenance === 'unsourced'
      ? cited.justification
      : cited.provenance === 'derived'
        ? cited.derivation
        : cited.provenance === 'computed'
          ? cited.model
          : (cited.caveat ?? '')

/**
 * A Tier C figure is this app's own inference from the crop's sun label, and the citations
 * beside it are the class-range methodology, so the sentence says which is which: a reader
 * took "(Purdue, VCE)" beside the number as the number's source
 */
const summaryOf = (label: string, value: string, cited: Cited<number>): string =>
  cited.provenance === 'inferred'
    ? `${label} ${value} is a class-level inference this app makes from the crop's sun label. The class ranges follow Purdue HO-238-B-W and VCE SPES-720NP, no cited work measured it for this crop`
    : cited.provenance === 'unsourced'
      ? `${label} ${value} has no source in the verified corpus`
      : `${label} ${value} is read from a Tier ${cited.tier} source`

interface Reading {
  readonly cited: Cited<number> | null
  readonly value: string
}

const reading = (crop: Crop, kind: DliThresholdKind): Reading => {
  const light = crop.light
  if (kind === 'max-design-rsr') {
    return { cited: light.maxDesignRsr, value: formatRsr(light.maxDesignRsr.value as Fraction) }
  }
  const cited = kind === 'minimum' ? light.dliMinMolM2Day : light.dliMaxBeforeDisorderMolM2Day
  return {
    cited,
    value: cited === null ? '' : formatDli(cited.value as MolPerM2Day),
  }
}

export const dliEvidence = (crop: Crop, kind: DliThresholdKind): DliEvidence | null => {
  const { cited, value } = reading(crop, kind)
  if (cited === null) return null
  const label = THRESHOLD_LABEL[kind]
  return {
    kind,
    label,
    tier: cited.tier,
    provenance: cited.provenance,
    classInference: cited.provenance === 'inferred',
    value,
    citations: cited.citations,
    reason: reasonOf(cited),
    summary: summaryOf(label, value, cited),
  }
}

export type DliEvidenceLookup = (cropId: string, kind: DliThresholdKind) => DliEvidence | null

/** One catalogue index per panel, shared by every row that had a threshold applied to it */
export const useDliEvidence = (): DliEvidenceLookup => {
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  return useMemo(() => {
    const byId = new Map(catalog.map((crop) => [String(crop.id), crop]))
    return (cropId, kind) => {
      const crop = byId.get(cropId)
      return crop === undefined ? null : dliEvidence(crop, kind)
    }
  }, [catalog])
}

export const DLI_HEADLINE = 'The light each crop is said to need is design guidance'

export const DLI_STANDFIRST =
  'Daily light integral is the primary filter in this app. The ordering of crops by light demand is solid, and the absolute numbers attached to each crop are provisional. Twelve of the eighteen crops checked have no published figure at all.'

export interface DisclosurePoint {
  readonly id: string
  readonly heading: string
  readonly body: string
}

export const DLI_DISCLOSURE: readonly DisclosurePoint[] = [
  {
    id: 'ordinal-holds',
    heading: 'The ranking is reliable, the absolutes are provisional',
    body: "Crops are ordered by light demand from one consistent class table, and that ordering is the output worth trusting: lettuce wants less light than a tomato, which wants less than a strawberry. The mol/m²/d numbers attached to individual crops are a weaker claim. Most are Tier C figures inferred from the crop's class, and few were measured on the crop itself, so a threshold is a soft boundary.",
  },
  {
    id: 'no-source',
    heading: 'Twelve of eighteen crops checked have no published figure at all',
    body: 'A systematic source hunt found no mol/m²/d figure anywhere in accessible peer-reviewed or Extension literature for seven temperate tree fruits (apple, pear, plum, sweet cherry, sour cherry, apricot and fig), nor for melon, watermelon, tomatillo, winter squash and pumpkin. Okra has an experimental treatment level and no target. Orchard work reports light as a percentage of full sun or as instantaneous PPFD. No orchard source gives a daily integral. Those rows carry class-level inferences marked Tier C and cite nothing for them, because no per-crop value exists.',
  },
  {
    id: 'transplant-scope',
    heading: 'The one credible Extension source is for the transplant stage',
    body: "Purdue's 10-15 and 15-20 mol/m²/d ranges are written for greenhouse plug production. A mature plant in a garden bed is outside their scope. They are used here because they are the best Extension figures that exist.",
  },
  {
    id: 'contested',
    heading: 'Extension itself disputes that a DLI requirement exists',
    body: "Erik Runkle of Michigan State University, whose vine-crop figure this app cites for tomato, pepper and cucumber, argues that published guidelines are subjective, situational and shift with a crop's shade tolerance.",
  },
  {
    id: 'no-upper-end',
    heading: 'The light gate has a floor and almost no ceiling',
    body: "A crop's light score rises to its target and then stays at the maximum, so a bed that just meets a crop's stated need scores exactly as well as a bed many times brighter. Only lettuce carries a documented upper bound in this corpus, the tipburn threshold of 17 mol/m²/d, and it is applied: a season mean above 17 lowers lettuce's light score, and a whole month above it is flagged. A search for a per-crop maximum or an explicit shade requirement for any other crop found one lead, a greenhouse stress point of 30 mol/m²/d for strawberry, which the gate doesn't apply yet. The tops of the target ranges can't stand in for one, because several were written from open-ended guidance: the vine-crop row reads 15, 20, 30 from a source whose words were \"15, preferably above 20\", so reading 30 as a limit would reverse it.",
  },
  {
    id: 'shade-plants-in-sun',
    heading: 'A shade plant can score well on a bright bed',
    body: 'Ramps are a spring ephemeral, and the USDA National Agroforestry Center\'s own forest-farming note states that they "need lots of sun early in the growing season, and they like shade when the growing season is over to conserve soil moisture and temperature". Their leaves die back as the canopy closes, so the shade in a ramp habitat arrives after their season, and this app scores each crop over its own growing window. What rules a woodland perennial out of a desert garden is the climate envelope, which is a different term with its own evidence.',
  },
  {
    id: 'how-to-read',
    heading: 'How to read a light exclusion',
    body: 'A light exclusion means this bed is dim for this crop. A crop held out a little below its threshold is a candidate for a sunnier bed or a wider row pitch. The gate is at its most trustworthy separating crops far apart in the ranking, and at its least separating two neighbours by a couple of mol.',
  },
]

export const RUNKLE_QUOTE = 'In my opinion, there is no such thing as a DLI requirement'

export const RUNKLE_ATTRIBUTION =
  'Erik Runkle, "DLI Requirements", GPN / Michigan State University Extension'

export const RUNKLE_CITEKEY_GAP =
  'That column carries no citekey in this app\'s corpus, so it is quoted under its own title. The Runkle work the corpus does hold is his GPN column "Lighting Greenhouse Vegetables", the source of the 15 (preferably above 20) mol/m²/d vine-crop figure used for tomato, pepper and cucumber.'

export const RUNKLE_CITED: CitationId = 'runkle2011-vegetable-dli'

/** The ramps statement in `shade-plants-in-sun`, so the quote travels with its record */
export const RAMPS_LIGHT_CITED: CitationId = 'chamberlain2014-forest-farming-ramps'

export const DLI_CALIBRATION =
  "The gate still does useful work. A bed at 8 mol/m²/d and a bed at 28 are different places to garden, this app measures that difference well, and the crop ordering that follows from it is the part the evidence supports. Treat any one crop's number as provisional."
