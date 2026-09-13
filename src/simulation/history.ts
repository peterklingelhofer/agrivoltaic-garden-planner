import type { BedId, CropId } from '../types/ids'
import type { SeasonRecord } from '../types/simulation'

/**
 * What the rotation rule reads for one bed: every season before this one, keyed by its number,
 * with the crops that stood in the bed that season.
 *
 * The season being planted is NOT in it. `rotationViolation` takes the most recent key as the
 * last season anything is known about and counts the gap to the season after it, so the current
 * season's own plantings would read as a rotation of one year against themselves. An empty entry
 * for the season just gone anchors that arithmetic when the family last grew long ago
 */
export const historyByYear = (
  records: readonly SeasonRecord[],
  bedId: BedId,
  season: number,
): ReadonlyMap<number, readonly CropId[]> => {
  const byYear = new Map<number, CropId[]>()
  for (const record of records) {
    if (record.bedId !== bedId || record.season >= season) continue
    const crops = byYear.get(record.season) ?? []
    crops.push(record.cropId)
    byYear.set(record.season, crops)
  }
  if (season > 1 && !byYear.has(season - 1)) byYear.set(season - 1, [])
  return byYear
}

/** The seasons a family has been taken off a bed, for the panel to say so */
export const seasonsOnBed = (
  records: readonly SeasonRecord[],
  bedId: BedId,
  familyOf: (cropId: CropId) => string | null,
  family: string,
): number =>
  new Set(
    records
      .filter((record) => record.bedId === bedId && familyOf(record.cropId) === family)
      .map((record) => record.season),
  ).size
