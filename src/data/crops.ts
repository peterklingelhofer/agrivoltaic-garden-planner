import type { DataTier } from '../types/evidence'
import { citedDerived, citedVerbatim } from '../types/cited'
import type { Crop, Cultivar, DliClass, LaubCropGroup, LaubCurve } from '../types/crop'
import type { CropId, CultivarId } from '../types/ids'
import type { GrowingWindow } from '../types/light'
import type { Celsius, Days, DegreeDaysC, Fraction, MolPerM2Day } from '../types/units'
import {
  LAUB_ANOVA,
  LAUB_AUTHOR_CAVEAT,
  LAUB_B2_PER_PERCENT_RSR,
  LAUB_CI_SYMMETRIC_ON_LOG10,
  LAUB_GROUPS,
  LAUB_INTERVAL_KIND,
  LAUB_MODEL_FORM,
  LAUB_PROVENANCE,
  LAUB_RSR_LEVELS_PERCENT,
  LAUB_SOURCE,
} from './catalog/laub.generated'
import { CATALOG_PROVENANCE, DLI_CLASSES, expandRow } from './catalog/schema'

export {
  CATALOG_PROVENANCE,
  LAUB_ANOVA,
  LAUB_AUTHOR_CAVEAT,
  LAUB_B2_PER_PERCENT_RSR,
  LAUB_CI_SYMMETRIC_ON_LOG10,
  LAUB_INTERVAL_KIND,
  LAUB_MODEL_FORM,
  LAUB_PROVENANCE,
  LAUB_RSR_LEVELS_PERCENT,
  LAUB_SOURCE,
}

export interface DliClassLimits {
  readonly dliClass: DliClass
  readonly minMolM2Day: MolPerM2Day | null
  readonly targetLowMolM2Day: MolPerM2Day | null
  readonly targetHighMolM2Day: MolPerM2Day | null
  readonly maxDesignRsr: Fraction
}

let catalog: readonly Crop[] | null = null
let inFlight: Promise<readonly Crop[]> | null = null

/** Lazy-loaded after first paint: the row table is a separate chunk */
export const loadCropCatalog = async (): Promise<readonly Crop[]> => {
  if (catalog !== null) return catalog
  inFlight ??= import('./catalog/rows').then((module) => {
    catalog = module.CROP_ROWS.map(expandRow)
    return catalog
  })
  return inFlight
}

export const cropById = (catalogue: readonly Crop[], id: CropId): Crop | undefined =>
  catalogue.find((crop) => crop.id === id)

/**
 * The name a gardener would use, never the catalogue's own id.
 *
 * Here rather than in the UI because both layers say a crop's name out loud: `recommend` writes
 * it into the prose it hands the wizard, and `ui` prints it beside every picker. There were four
 * copies of this expression, and a picker offering `bean-bush` and `pepper-hot` beside prose
 * saying bush beans and chillies is the failure that costs, not the duplication itself.
 *
 * Both forms fall back to the id, which is a working answer where a blank or an "undefined" is
 * not: the catalogue loads asynchronously, so every one of these call sites has a first paint
 * with nothing to look the name up in
 */
export const cropLabel = (crop: Crop): string => crop.taxonomy.commonNames[0] ?? (crop.id as string)

export const cropName = (catalogue: readonly Crop[], id: CropId): string => {
  const crop = cropById(catalogue, id)
  return crop === undefined ? (id as string) : cropLabel(crop)
}

export const cropsByFamily = (catalogue: readonly Crop[], family: string): readonly Crop[] =>
  catalogue.filter((crop) => crop.taxonomy.family === family)

export const dliClassLimits = (dliClass: DliClass): DliClassLimits => {
  const spec = DLI_CLASSES[dliClass]
  return {
    dliClass,
    minMolM2Day: spec.minMolM2Day === null ? null : (spec.minMolM2Day as MolPerM2Day),
    targetLowMolM2Day:
      spec.targetLowMolM2Day === null ? null : (spec.targetLowMolM2Day as MolPerM2Day),
    targetHighMolM2Day:
      spec.targetHighMolM2Day === null ? null : (spec.targetHighMolM2Day as MolPerM2Day),
    maxDesignRsr: spec.maxDesignRsr as Fraction,
  }
}

export const dliClassTier = (dliClass: DliClass): DataTier => DLI_CLASSES[dliClass].tier

/**
 * The nine Laub et al. 2022 crop-group curves as the published Table S2
 * anchors. Predictions and 95 % confidence bounds are verbatim; the underlying
 * b1 coefficient is a derived algebraic recovery, so no coefficient is
 * evaluated here and the tabulated anchors themselves drive interpolation
 */
export const laubCurve = (group: LaubCropGroup): LaubCurve => {
  const data = LAUB_GROUPS[group]
  const optimum = data.benefitOptimumRsrPercent
  return {
    group,
    studyCount: data.studies,
    peakRsr: optimum === null ? null : ((optimum / 100) as Fraction),
    intervalKind: 'confidence-95',
    anchors: citedVerbatim(
      LAUB_RSR_LEVELS_PERCENT.map((percent, index) => ({
        rsr: (percent / 100) as Fraction,
        relativeYield: ((data.predicted[index] ?? 0) / 100) as Fraction,
        ciLow: ((data.ciLow[index] ?? 0) / 100) as Fraction,
        ciHigh: ((data.ciHigh[index] ?? 0) / 100) as Fraction,
      })),
      'A',
      ['laub2022-shade-meta'],
      LAUB_AUTHOR_CAVEAT,
    ),
    coefficients: citedDerived(
      { b1PerPercentRsr: data.b1PerPercentRsr, b2PerPercentRsrSquared: LAUB_B2_PER_PERCENT_RSR },
      'A',
      ['laub2022-shade-meta', 'laub2021-shade-dataset'],
      'Recovered algebraically from the 162 published Table S2 points plus the verbatim model specification, reproducing every point to within 0.07 pp',
      'Published nowhere: not in the article, the supplement or the Zenodo dataset. Cite as derived from Laub et al. 2022, never as quoted from it',
    ),
  }
}

/**
 * B benefiting, T tolerant, S sensitive, exactly as tabulated. C3 cereals and
 * tubers flip back from S to T at high RSR because the class follows the local
 * slope; that is published behaviour and is deliberately not smoothed
 */
export const laubResponseClass = (group: LaubCropGroup, rsr: number): 'B' | 'T' | 'S' => {
  const percent = rsr * 100
  const classes = LAUB_GROUPS[group].responseClass
  let best = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < LAUB_RSR_LEVELS_PERCENT.length; index += 1) {
    const distance = Math.abs((LAUB_RSR_LEVELS_PERCENT[index] ?? 0) - percent)
    if (distance < bestDistance) {
      bestDistance = distance
      best = index
    }
  }
  return classes[best] ?? 'T'
}

export const laubStudyCount = (group: LaubCropGroup): number => LAUB_GROUPS[group].studies

/** Thinnest evidence base of the nine groups, surfaced so the UI can flag them */
export const LAUB_WEAK_GROUPS: readonly LaubCropGroup[] = (
  Object.keys(LAUB_GROUPS) as LaubCropGroup[]
).filter((group) => LAUB_GROUPS[group].studies <= 4)

/** Catalogue growing windows are authored for the northern hemisphere */
export const mirrorGrowingWindow = (window: GrowingWindow): GrowingWindow => {
  const shift = (month: number): number => ((month + 5) % 12) + 1
  return { startMonth: shift(window.startMonth), endMonth: shift(window.endMonth) }
}

export const growingWindowFor = (crop: Crop, latitudeDeg: number): GrowingWindow =>
  latitudeDeg >= 0 ? crop.window : mirrorGrowingWindow(crop.window)

const cultivar = (
  id: string,
  cropId: string,
  name: string,
  isLandrace: boolean,
  regionOfAdaptation: string | null,
  gddToMaturity: number,
  daysToMaturity: number,
  note: string | null,
): Cultivar => ({
  id: id as CultivarId,
  cropId: cropId as CropId,
  name,
  isLandrace,
  regionOfAdaptation,
  thermal: {
    gddBaseC: 10 as Celsius,
    gddUpperCutoffC: 30 as Celsius,
    gddToMaturity: gddToMaturity as DegreeDaysC,
    daysToMaturity: daysToMaturity as Days,
    dtmReference: 'transplant',
  },
  chill: null,
  shadeToleranceNote: note,
  provenance: CATALOG_PROVENANCE,
})

/**
 * Only cultivars whose behaviour is documented as cultivar-specific are listed,
 * because that distinction changes a recommendation. Inventing trait rows for a
 * general cultivar table would be worse than shipping none
 */
const CULTIVARS: readonly Cultivar[] = [
  cultivar(
    'marigold-nemagold',
    'marigold-french',
    'Nemagold',
    false,
    null,
    720,
    60,
    'Selected for alpha-terthienyl content. Effective only as a dense full-season stand, some Tagetes cultivars are hosts',
  ),
  cultivar(
    'marigold-single-gold',
    'marigold-french',
    'Single Gold',
    false,
    null,
    720,
    60,
    'Selected for alpha-terthienyl content. Effective only as a dense full-season stand, some Tagetes cultivars are hosts',
  ),
]

export const loadCultivars = (cropId: CropId): Promise<readonly Cultivar[]> =>
  Promise.resolve(CULTIVARS.filter((entry) => entry.cropId === cropId))
