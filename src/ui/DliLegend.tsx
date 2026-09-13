import { useState, type ReactElement } from 'react'
import { contourStep, contourValues, viridisGradientCss } from '../state/colormap'

export interface DliLegendProps {
  readonly label: string
  readonly unit: string
  readonly min: number
  readonly max: number
  readonly testId: string
  /** The panels or beds have moved since this field was computed, so it describes an old garden */
  readonly stale?: boolean
}

/** As many decimals as the interval has, so a tick reads as the number the line is drawn at */
const formatterFor = (step: number): ((value: number) => string) => {
  const decimals = step % 1 === 0 ? 0 : (step * 10) % 1 === 0 ? 1 : 2
  return (value) => value.toFixed(decimals)
}

// Viridis: perceptually uniform and colour-vision safe, so equal steps in DLI read as equal
// steps in colour, unlike a rainbow ramp. Its monotonic lightness keeps it legible on both
// light and dark chrome. The ticks are the iso-lines drawn on the ground, at the same values
// out of the same `contourStep`: a line in the scene means the number printed here and no other
export const DliLegend = ({
  label,
  unit,
  min,
  max,
  testId,
  stale = false,
}: DliLegendProps): ReactElement => {
  const step = contourStep(min, max)
  const values = contourValues(min, max)
  const format = formatterFor(step)
  /*
    Ephemeral and local, for the same reason the example notice's fold is: it is which way a
    disclosure is facing, and nothing else in the app can ask a useful question about it. Whether
    it means anything is a stylesheet decision, because the answer differs by width and only the
    stylesheet knows the width: above 760px the key is always shown and this control is not on
    screen at all
  */
  const [folded, setFolded] = useState(false)
  return (
    <figure
      className="legend"
      data-testid={testId}
      data-min={min}
      data-max={max}
      data-folded={folded ? 'true' : undefined}
      data-stale={stale ? 'true' : undefined}
    >
      <figcaption>
        {label}
        {unit ? (
          <>
            {' '}
            (<span className="legend-unit">{unit}</span>)
          </>
        ) : (
          ''
        )}
      </figcaption>
      {/*
        The one control on this surface, and it only exists on a phone. Measured at 320x568 the
        unfolded key was 88px of a 471px stage: with the example notice above it, a third of the
        garden was furniture describing the garden. What folds is the ramp, the iso-line ticks and
        the range; the caption stays, so a folded key still says which quantity the ground is
        coloured by, and the staleness warning stays because it is the reason not to trust colours
        that are still on screen. The visible word is short because it shares a line with the
        caption on a 320px screen; the accessible name is the whole sentence
      */}
      <button
        type="button"
        className="legend-fold"
        data-testid="action-legend-fold"
        aria-expanded={!folded}
        aria-label={folded ? 'Show the colour key' : 'Hide the colour key'}
        onClick={() => {
          setFolded((shut) => !shut)
        }}
      >
        {folded ? 'Key' : 'Hide'}
      </button>
      {/*
        Above the ramp, not below the note, because it changes what every colour underneath it
        means. The colours are left on screen rather than blanked: they are still the answer for
        a garden that existed a moment ago, and a visitor dragging a panel needs something to
        drag it against. What they must not do is go on reading as current
      */}
      {stale ? (
        <p className="legend-stale" data-testid={`${testId}-stale`}>
          Computed for the layout before your last change. Re-run the light to update it.
        </p>
      ) : null}
      <div
        className="legend-ramp"
        style={{ background: viridisGradientCss() }}
        role="presentation"
      />
      {values.length > 0 ? (
        <div className="legend-contours" data-testid={`${testId}-contours`} data-step={step}>
          {values.map((value) => (
            <span
              key={value}
              className="legend-tick"
              style={{ left: `${String(((value - min) / (max - min)) * 100)}%` }}
            >
              {format(value)}
            </span>
          ))}
        </div>
      ) : null}
      {/*
        The bare numbers below say where the ramp sits, not which way it runs, and a beginner
        matching a colour on the ground to this legend needs that before the numbers mean
        anything. "Less" and "More" are said instead of "less light" or "more shade" because
        the same ramp reads a shade ratio and a sky view factor too, and both those go the
        opposite way from light: it is always true here, whichever channel is on screen
      */}
      <div className="legend-scale">
        <span>Less {min.toFixed(min >= 10 ? 0 : 1)}</span>
        <span>{((min + max) / 2).toFixed(max >= 10 ? 0 : 1)}</span>
        <span>More {max.toFixed(max >= 10 ? 0 : 1)}</span>
      </div>
      {/* true of every channel this ramp serves: the shade ratio runs the other way from light,
          and "less" and "more" follow the label above, the same way the scale under the ramp
          does */}
      <p className="legend-note">
        Darker is less, brighter is more
        {values.length > 0
          ? `. Lines on the ground every ${format(step)}${unit ? ` ${unit}` : ''}`
          : ''}
      </p>
    </figure>
  )
}
