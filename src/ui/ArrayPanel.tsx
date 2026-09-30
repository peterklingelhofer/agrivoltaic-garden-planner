import { useMemo, type ReactElement } from 'react'
import { makeArray } from '../state/defaults'
import { arrayMetrics } from '../state/derive'
import { useAppStore } from '../state/store'
import type { PvArray, TrackingMode } from '../types/pv'
import { degrees, fraction, meters, wattsPeak } from '../types/units'
import { Action, NumberField, SelectField, SliderField } from './controls'
import { formatDegrees, formatLength } from './format'
import { InfoTip } from './InfoTip'
import { lengthStep, showLength, showLimit, toMeters, useLengthUnit } from './length-units'
import { roundTenth } from './onboarding'
import { Panel, Readout } from './Panel'

const TRACKING: readonly (readonly [TrackingMode, string])[] = [
  ['fixed', 'Fixed tilt'],
  ['single-axis-horizontal-ns', 'Single axis, horizontal N-S'],
  ['single-axis-tilted', 'Single axis, tilted'],
  ['dual-axis', 'Dual axis'],
  ['agro-optimized', 'Agro optimized'],
]

const withTracking = (array: PvArray, mode: TrackingMode): PvArray => {
  if (mode === 'fixed') {
    return {
      ...array,
      tracker: { mode, tiltDeg: degrees(25), surfaceAzimuthDeg: degrees(180) },
    }
  }
  if (mode === 'dual-axis') {
    return {
      ...array,
      tracker: { mode, maxRotationDeg: degrees(60), minElevationDeg: degrees(5) },
    }
  }
  if (mode === 'agro-optimized') {
    return {
      ...array,
      tracker: { mode, maxRotationDeg: degrees(55), targetGroundDliMolM2Day: 12 },
    }
  }
  return {
    ...array,
    tracker: {
      mode,
      axisTiltDeg: degrees(mode === 'single-axis-tilted' ? 20 : 0),
      axisAzimuthDeg: array.geometry.rowAzimuthDeg,
      maxRotationDeg: degrees(55),
      backtracking: true,
    },
  }
}

/**
 * Every meter and degree field shows one decimal. A geometry the layout search wrote carries
 * figures like 31.738424175000002, which a number field prints in full. The store keeps the exact
 * value. A tenth of a degree or three centimeters is finer than anyone builds to. The panel's own
 * width and height keep their three decimals, because those are datasheet figures
 */
const TrackerFields = ({
  array,
  onChange,
}: {
  readonly array: PvArray
  onChange(next: PvArray): void
}): ReactElement => {
  const tracker = array.tracker
  if (tracker.mode === 'fixed') {
    return (
      <div className="row">
        <NumberField
          testId="control-array-tilt"
          label="Tilt from flat"
          unit="deg"
          min={0}
          max={90}
          value={roundTenth(tracker.tiltDeg)}
          onChange={(value) =>
            onChange({ ...array, tracker: { ...tracker, tiltDeg: degrees(value) } })
          }
        />
        <NumberField
          testId="control-array-azimuth"
          label="Direction the panels face"
          unit="deg"
          min={0}
          max={360}
          value={roundTenth(tracker.surfaceAzimuthDeg)}
          onChange={(value) =>
            onChange({ ...array, tracker: { ...tracker, surfaceAzimuthDeg: degrees(value) } })
          }
        />
      </div>
    )
  }
  return (
    <NumberField
      testId="control-array-max-rotation"
      label="How far the panels turn"
      unit="deg"
      min={0}
      max={90}
      value={roundTenth(tracker.maxRotationDeg)}
      onChange={(value) =>
        onChange({ ...array, tracker: { ...tracker, maxRotationDeg: degrees(value) } })
      }
    />
  )
}

export const ArrayPanel = (): ReactElement => {
  const plot = useAppStore((s) => s.plot)
  const unit = useLengthUnit()
  const selectedArrayId = useAppStore((s) => s.selectedArrayId)
  const selectArray = useAppStore((s) => s.selectArray)
  const upsertArray = useAppStore((s) => s.upsertArray)
  const removeArray = useAppStore((s) => s.removeArray)
  const hoveredTarget = useAppStore((s) => s.hovered)

  const array = useMemo(
    () => plot?.arrays.find((a) => a.id === selectedArrayId) ?? plot?.arrays[0] ?? null,
    [plot, selectedArrayId],
  )
  const derived = useMemo(() => (array ? arrayMetrics(array) : null), [array])

  const patchGeometry = (patch: Partial<PvArray['geometry']>): void => {
    if (!array) return
    upsertArray({ ...array, geometry: { ...array.geometry, ...patch } })
  }

  return (
    <Panel
      id="array"
      // same rule as the bed panel: it lights up only for the array it is actually showing
      className={
        array !== null && hoveredTarget?.kind === 'array' && hoveredTarget.arrayId === array.id
          ? 'panel-hovered'
          : undefined
      }
      title="Solar panels"
      subtitle="The rows of panels on this plot. Ground cover ratio is computed from row width and row spacing as you edit"
      // the layout search is the press at the top of the step this panel sits in, so it's not
      // offered a second time here
      actions={
        <Action
          testId="action-array-add"
          onClick={() => upsertArray(makeArray((plot?.arrays.length ?? 0) + 1))}
        >
          Add array
        </Action>
      }
    >
      {!array ? (
        <p className="notice notice-idle" data-testid="status-array">
          No array in the plot
        </p>
      ) : (
        <>
          <SelectField
            testId="control-array-select"
            label="Array"
            value={array.id}
            options={(plot?.arrays ?? []).map((a) => [a.id, a.label] as const)}
            onChange={(value) => selectArray(value as typeof array.id)}
          />
          <SelectField
            testId="control-array-tracking"
            label="How the panels follow the sun"
            value={array.tracker.mode}
            options={TRACKING}
            onChange={(mode) => upsertArray(withTracking(array, mode))}
          />
          <TrackerFields array={array} onChange={upsertArray} />
          <div className="row">
            <NumberField
              testId="control-array-pitch"
              label="Row spacing, center to center"
              unit={unit}
              min={showLimit(0.5, unit)}
              step={lengthStep(unit, 0.1)}
              value={showLength(array.geometry.pitchM, unit, roundTenth)}
              onChange={(value) =>
                patchGeometry({ pitchM: meters(Math.max(0.5, toMeters(value, unit))) })
              }
            />
            <NumberField
              testId="control-array-collector-width"
              label="Width of one row"
              unit={unit}
              min={showLimit(0.5, unit)}
              step={lengthStep(unit, 0.1)}
              value={showLength(array.geometry.collectorWidthM, unit, roundTenth)}
              onChange={(value) =>
                patchGeometry({ collectorWidthM: meters(Math.max(0.5, toMeters(value, unit))) })
              }
            />
          </div>
          <div className="row">
            <NumberField
              testId="control-array-clearance"
              label="Headroom underneath"
              unit={unit}
              min={0}
              step={lengthStep(unit, 0.1)}
              value={showLength(array.geometry.clearanceHeightM, unit, roundTenth)}
              onChange={(value) =>
                patchGeometry({ clearanceHeightM: meters(toMeters(value, unit)) })
              }
            />
            <NumberField
              testId="control-array-row-azimuth"
              label="Direction the rows run"
              unit="deg"
              min={0}
              max={360}
              value={roundTenth(array.geometry.rowAzimuthDeg)}
              onChange={(value) => patchGeometry({ rowAzimuthDeg: degrees(value) })}
            />
          </div>
          <div className="row">
            <NumberField
              testId="control-array-row-count"
              label="Number of rows"
              min={1}
              value={array.geometry.rowCount}
              onChange={(value) => patchGeometry({ rowCount: Math.max(1, Math.round(value)) })}
            />
            <NumberField
              testId="control-array-modules-per-row"
              label="Panels per row"
              min={1}
              value={array.geometry.modulesPerRow}
              onChange={(value) => patchGeometry({ modulesPerRow: Math.max(1, Math.round(value)) })}
            />
          </div>
          <div className="row">
            <NumberField
              testId="control-array-module-width"
              label="Panel width"
              unit="m"
              min={0.2}
              step={0.001}
              value={array.module.widthM}
              onChange={(value) =>
                upsertArray({ ...array, module: { ...array.module, widthM: meters(value) } })
              }
            />
            <NumberField
              testId="control-array-module-height"
              label="Panel height"
              unit="m"
              min={0.2}
              step={0.001}
              value={array.module.heightM}
              onChange={(value) =>
                upsertArray({ ...array, module: { ...array.module, heightM: meters(value) } })
              }
            />
          </div>
          <NumberField
            testId="control-array-module-power"
            label="Power of one panel"
            unit="Wp"
            min={1}
            value={array.module.nameplateWp}
            onChange={(value) =>
              upsertArray({ ...array, module: { ...array.module, nameplateWp: wattsPeak(value) } })
            }
          />
          {/*
            The rear side, which the energy chain has always modeled (`crates/agv-sim/src/pv/bifacial.rs`
            reads the ground's reflected light through the rear view factor) and nothing let a
            visitor set. Zero is a one-sided panel. The datasheet figure for a bifacial module is
            0.65 to 0.95
          */}
          <SliderField
            testId="control-array-bifaciality"
            label="Rear side output, as a share of the front"
            min={0}
            max={1}
            step={0.05}
            value={array.module.bifacialityFactor}
            display={
              array.module.bifacialityFactor <= 0
                ? 'one-sided panel'
                : `${String(Math.round(array.module.bifacialityFactor * 100))}%`
            }
            onChange={(value) =>
              upsertArray({
                ...array,
                module: {
                  ...array.module,
                  bifacialityFactor: fraction(Math.min(1, Math.max(0, value))),
                },
              })
            }
          />
          <p className="panel-sub" data-testid="readout-array-bifaciality-help">
            The rear side catches light reflected off the ground under the rows. The annual energy
            report below says how much it added, and the ground cover on the ground step sets how
            bright that ground is.
          </p>
          <div className="readouts">
            <Readout
              id="array-gcr"
              label="Ground cover ratio (GCR)"
              value={`${((derived?.groundCoverRatio ?? 0) * 100).toFixed(1)}%`}
            />
            <Readout
              id="array-projected-gcr"
              label="Projected ground cover ratio"
              value={`${((derived?.projectedGroundCoverRatio ?? 0) * 100).toFixed(1)}%`}
            />
            <Readout
              id="array-max-height"
              label="Height at the top of a row"
              value={formatLength(derived?.maxHeightM ?? 0, unit)}
            />
            <Readout
              id="array-nameplate"
              label="Power of all the panels"
              value={`${(derived?.nameplateDcKw ?? 0).toFixed(1)} kW`}
            />
            <Readout
              id="array-row-azimuth"
              label="Direction the rows run"
              value={formatDegrees(array.geometry.rowAzimuthDeg)}
            />
          </div>
          {/*
            The two ratios above are unreadable side by side: both are called GCR, both print a
            percentage, and nothing says which one is which. The difference is worth a sentence. Not
            a longer label: the projected figure is the one that moves when the tilt does and a
            grower changing the tilt is watching it. That sentence defines a term and carries no
            caveat about what the app knows, so it sits behind the InfoTip
          */}
          <InfoTip label="ground cover ratio" testId="info-array-gcr">
            Ground cover ratio (GCR): the panel area divided by the ground the rows stand on. At 40%
            the panels are four tenths the area of their patch of garden. The projected figure
            measures their shadow from straight overhead, so it falls as you tilt the panels up. The
            two are equal only when the panels lie flat. The trade names for the fields above, if
            you have a datasheet to copy from: a panel is a module, the width of one row is the
            collector width, row spacing center to center is the pitch, headroom is the clearance
            height, and a direction in degrees clockwise from north is an azimuth.
          </InfoTip>
          <Action testId="action-array-remove" onClick={() => removeArray(array.id)}>
            Remove array
          </Action>
        </>
      )}
    </Panel>
  )
}
