import type { ReactElement } from 'react'
import type { YieldEstimate } from '../types/recommend'
import {
  assertBanded,
  attributionLabel,
  confidenceLabel,
  contributionFigure,
  cropResponseLabel,
  formatBandPercent,
  formatBandRange,
} from './format'

export interface YieldBandProps {
  readonly estimate: YieldEstimate
}

// There is deliberately no midpoint marker: rendering one would reintroduce the point
// estimate that Decision Record 7 forbids
export const YieldBand = ({ estimate }: YieldBandProps): ReactElement => {
  const band = assertBanded(estimate.relativeYield)
  const lower = band.interval.lower
  const upper = band.interval.upper
  const scaleMax = Math.max(1.6, upper * 1.05)
  const left = (lower / scaleMax) * 100
  const width = Math.max(1, ((upper - lower) / scaleMax) * 100)

  return (
    <div
      className="yield-band"
      data-testid={`yield-band-${estimate.cropId}`}
      data-lower={lower}
      data-upper={upper}
      data-dominant-source={band.dominantSource}
    >
      <div className="yield-track">
        <div className="yield-interval" style={{ left: `${left}%`, width: `${width}%` }} />
        <div className="yield-reference" style={{ left: `${(1 / scaleMax) * 100}%` }} />
      </div>
      <p className="yield-value" data-testid={`readout-yield-${estimate.cropId}`}>
        {formatBandPercent(band)} of full yield
      </p>
      <p className="yield-attribution" data-testid={`readout-yield-attribution-${estimate.cropId}`}>
        {confidenceLabel(band.confidence)}, dominated by{' '}
        {band.dominantSource === 'crop-response'
          ? cropResponseLabel(estimate.laubGroup)
          : attributionLabel(band.dominantSource)}
      </p>
      {estimate.absoluteYieldKgPerM2Season ? (
        <p className="yield-absolute" data-testid={`readout-yield-absolute-${estimate.cropId}`}>
          {formatBandRange(estimate.absoluteYieldKgPerM2Season, 'kg/m² season')}
        </p>
      ) : null}
      <ul className="yield-contributions">
        {band.contributions.map((contribution) => (
          <li key={`${contribution.source}-${contribution.note}`}>
            {attributionLabel(contribution.source)}: {contributionFigure(contribution)}
            {contribution.note ? ` (${contribution.note})` : ''}
          </li>
        ))}
      </ul>
      {estimate.caveats.length > 0 ? (
        <ul className="yield-caveats" data-testid={`readout-yield-caveats-${estimate.cropId}`}>
          {estimate.caveats.map((caveat) => (
            <li key={caveat.code}>{caveat.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
