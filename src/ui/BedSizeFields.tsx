import type { ReactElement } from 'react'
import { extentOf, extentSize, isRectangle, metresBetween, resizedRectangle } from '../state/geom'
import { useAppStore } from '../state/store'
import type { Bed } from '../types/garden'
import { NumberField } from './controls'
import { lengthStep, showLength, showLimit, toMetres, useLengthUnit } from './length-units'

/** Narrower than this is a path, and a bed at least this wide is one a hand fits in */
export const MIN_BED_M = 0.3

const hundredth = (value: number): number => Math.round(value * 100) / 100

/**
 * A rectangular bed's two sides, typed in whichever unit is showing. These fields size a bed
 * without a pointer: the corner handles are the plot's, and a bed made by Add bed can be moved in
 * the scene and sized only here. The width is the bed's first edge and the length its second, so a
 * turned bed keeps its turn. A bed drawn by hand is not two numbers, and gets a note where the
 * fields would be
 */
export const BedSizeFields = ({ bed }: { readonly bed: Bed }): ReactElement | null => {
  const upsertBed = useAppStore((s) => s.upsertBed)
  const plotRing = useAppStore((s) => s.plot?.boundary.exterior ?? null)
  const unit = useLengthUnit()
  const ring = bed.footprint.exterior
  const [a, b, c] = ring
  // a bed drawn by hand is whatever shape its corners make. One bed carrying size fields while
  // another carries none needs saying, so the answer prints where the fields would be
  if (!isRectangle(ring) || a === undefined || b === undefined || c === undefined)
    return (
      <p className="panel-sub" data-testid="readout-bed-size-note">
        Width and length fields appear for rectangular beds. This one was drawn by hand, so its
        corners set its size: move them in Move mode.
      </p>
    )
  const widthM = metresBetween(a, b)
  const lengthM = metresBetween(b, c)
  // no bigger than the plot's longest side: a bed is inside a plot, whichever way it is turned
  const maxM =
    plotRing === null ? Number.POSITIVE_INFINITY : Math.max(...extentSize(extentOf([plotRing])))
  const clamp = (value: number): number => Math.min(maxM, Math.max(MIN_BED_M, value))
  const write = (nextWidthM: number, nextLengthM: number): void =>
    upsertBed({
      ...bed,
      footprint: {
        ...bed.footprint,
        exterior: resizedRectangle(ring, clamp(nextWidthM), clamp(nextLengthM)),
      },
    })
  return (
    <div className="row">
      <NumberField
        testId="control-bed-width"
        label="Width"
        unit={unit}
        min={showLimit(MIN_BED_M, unit)}
        max={showLimit(maxM, unit)}
        step={lengthStep(unit, 0.05)}
        value={showLength(widthM, unit, hundredth)}
        onChange={(value) => write(toMetres(value, unit), lengthM)}
      />
      <NumberField
        testId="control-bed-length"
        label="Length"
        unit={unit}
        min={showLimit(MIN_BED_M, unit)}
        max={showLimit(maxM, unit)}
        step={lengthStep(unit, 0.05)}
        value={showLength(lengthM, unit, hundredth)}
        onChange={(value) => write(widthM, toMetres(value, unit))}
      />
    </div>
  )
}
