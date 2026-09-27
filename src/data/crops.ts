import { citedDerived, citedVerbatim } from '../types/cited'
import type { Crop, DliClass, LaubCropGroup, LaubCurve } from '../types/crop'
import type { CropId } from '../types/ids'
import type { GrowingWindow } from '../types/light'
import type { Fraction, MolPerM2Day } from '../types/units'
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

export const cropById = (catalog: readonly Crop[], id: CropId): Crop | undefined =>
  catalog.find((crop) => crop.id === id)

/**
 * The name a gardener would use.
 *
 * This helper lives in `src/data` because both layers say a crop's name out loud: `recommend`
 * writes it into the prose it hands the wizard, and `ui` prints it beside every picker. A picker
 * offering `bean-bush` and `pepper-hot` beside prose saying bush beans and chilies is the failure
 * that costs.
 *
 * Both forms fall back to the id, which is a working answer where a blank or an "undefined" isn't:
 * the catalog loads asynchronously, so every one of these call sites has a first paint
 * with nothing to look the name up in
 */
export const cropLabel = (crop: Crop): string => crop.taxonomy.commonNames[0] ?? (crop.id as string)

export const cropName = (catalog: readonly Crop[], id: CropId): string => {
  const crop = cropById(catalog, id)
  return crop === undefined ? (id as string) : cropLabel(crop)
}

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

/**
 * The nine Laub et al. 2022 crop-group curves as the published Table S2 anchors. Predictions and
 * 95 % confidence bounds are verbatim, the underlying b1 coefficient is a derived algebraic
 * recovery, so no coefficient is evaluated here and the tabulated anchors themselves drive
 * interpolation.
 *
 * `groupNote` is the crop's own reason for reading this curve where its group is an analogy: a
 * crop the meta-analysis excluded, a harvested organ its trials didn't measure, or a family no
 * group holds. It travels on the anchors' caveat and reaches the reader as a yield caveat
 */
export const laubCurve = (group: LaubCropGroup, groupNote: string | null = null): LaubCurve => {
  const data = LAUB_GROUPS[group]
  const peak = data.benefitPeakRsrPercent
  return {
    group,
    studyCount: data.studies,
    peakRsr: peak === null ? null : ((peak / 100) as Fraction),
    groupNote,
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
      groupNote === null ? LAUB_AUTHOR_CAVEAT : `${LAUB_AUTHOR_CAVEAT} ${groupNote}`,
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

export const laubStudyCount = (group: LaubCropGroup): number => LAUB_GROUPS[group].studies

/** Catalog growing windows are authored for the northern hemisphere */
export const mirrorGrowingWindow = (window: GrowingWindow): GrowingWindow => {
  const shift = (month: number): number => ((month + 5) % 12) + 1
  return { startMonth: shift(window.startMonth), endMonth: shift(window.endMonth) }
}

export const growingWindowFor = (crop: Crop, latitudeDeg: number): GrowingWindow =>
  latitudeDeg >= 0 ? crop.window : mirrorGrowingWindow(crop.window)
