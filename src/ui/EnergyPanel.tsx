import type { ReactElement } from 'react'
import { approxKwh } from '../simulation/coach'
import { useAppStore } from '../state/store'
import type { Banded } from '../types/band'
import type { PvEnergyReport } from '../types/energy'
import { Action } from './controls'
import {
  assertBanded,
  attributionLabel,
  bandBasisLabel,
  formatBandRange,
  formatDegrees,
} from './format'
import { AsyncNotice, Panel, Readout } from './Panel'

const percent = (value: number): string => `${(value * 100).toFixed(1)}%`

const kwh = (value: number): string => `${Math.round(value).toLocaleString('en-US')} kWh`

const Band = ({
  id,
  label,
  band,
}: {
  readonly id: string
  readonly label: string
  readonly band: Banded<number>
}): ReactElement => {
  const checked = assertBanded(band)
  return (
    <div
      className="readout readout-band"
      data-testid={`readout-energy-band-${id}`}
      data-kind={checked.intervalKind}
    >
      <span className="readout-label">{label}</span>
      <span className="readout-value" data-testid={`readout-energy-${id}`}>
        {formatBandRange(checked, '')}
      </span>
      <span className="readout-note" data-testid={`readout-energy-basis-${id}`}>
        {bandBasisLabel(checked)}, dominated by {attributionLabel(checked.dominantSource)}
      </span>
    </div>
  )
}

const Reference = ({ report }: { readonly report: PvEnergyReport }): ReactElement => (
  <>
    <h3>Reference system</h3>
    <p data-testid="readout-energy-reference-definition">{report.reference.definition}</p>
    <div className="readouts">
      <Readout
        id="energy-reference-gcr"
        label="Reference ground cover ratio"
        value={percent(report.reference.groundCoverRatio)}
      />
      <Readout
        id="energy-reference-tilt"
        label="Tilt of the reference layout"
        value={formatDegrees(report.reference.tiltDeg)}
      />
      <Readout
        id="energy-reference-azimuth"
        label="Direction the reference layout faces"
        value={formatDegrees(report.reference.surfaceAzimuthDeg)}
      />
      <Readout
        id="energy-reference-yield"
        label="Electricity the reference layout would make"
        value={`${report.reference.annualAcKwhPerM2Land.toFixed(1)} kWh/m² land`}
      />
    </div>
  </>
)

const LossStack = ({ report }: { readonly report: PvEnergyReport }): ReactElement => (
  <>
    <h3>Loss stack</h3>
    <ul className="list" data-testid="list-energy-losses">
      {report.losses.map((entry) => (
        <li key={entry.component} data-testid={`readout-energy-loss-${entry.component}`}>
          {entry.label}: {percent(entry.fraction)}
        </li>
      ))}
      <li data-testid="readout-energy-loss-row-shading">
        Row-to-row shading, modelled from pitch, tilt and profile angle:{' '}
        {percent(report.rowShadingLossFraction)}
      </li>
      <li data-testid="readout-energy-loss-clipping">
        Inverter clipping at a {report.dcAcRatio.toFixed(2)} DC:AC ratio:{' '}
        {percent(report.clippingLossFraction)}, {kwh(report.clippingLossKwh)}
      </li>
      <li data-testid="readout-energy-gain-bifacial">
        Rear-side gain, added to the total: {percent(report.bifacialGainFraction)}
      </li>
    </ul>
  </>
)

/*
  The electricity term on its own. The crop half of the ratio is a fact about a planting, and it
  is printed on each combination's card on the plants step, beside the crops it counts
*/
const Ler = ({ report }: { readonly report: PvEnergyReport }): ReactElement => (
  <>
    <h3>Land equivalent ratio</h3>
    <div className="readouts">
      <Band id="ler-electricity" label="Electricity part of the ratio" band={report.energyRatio} />
    </div>
    <p data-testid="readout-energy-ler-crops-unavailable">
      The crop part of the ratio belongs to a planting, so each combination on the plants step
      carries its own. This is the electricity term on its own
    </p>
    <ul className="list" data-testid="list-energy-contributions">
      {report.energyRatio.contributions.map((contribution) => (
        <li key={contribution.note}>
          {attributionLabel(contribution.source)}: +/-
          {(contribution.halfWidthFraction * 100).toFixed(1)}% ({contribution.note})
        </li>
      ))}
    </ul>
  </>
)

const Provenance = ({ report }: { readonly report: PvEnergyReport }): ReactElement => (
  <>
    <h3>Model provenance</h3>
    <ul className="list" data-testid="list-energy-provenance">
      {report.provenance.map((entry) => (
        <li key={entry.value}>
          {entry.value}
          {entry.caveat === null ? null : <em> {entry.caveat}</em>}
        </li>
      ))}
    </ul>
  </>
)

export const EnergyPanel = (): ReactElement => {
  const energy = useAppStore((s) => s.energy)
  const runEnergy = useAppStore((s) => s.runEnergy)
  const report = energy.status === 'ready' ? energy.value : null

  return (
    <Panel
      id="energy"
      title="Annual energy"
      subtitle="One year of electricity, hour by hour, against a typical weather year for this site. The whole array is modelled as one electrical unit, a single-node chain. Every figure below is the array's total. Until the chain runs there is no electricity term"
      actions={
        <Action testId="control-energy-run" tone="primary" onClick={runEnergy}>
          Compute annual energy
        </Action>
      }
    >
      <AsyncNotice
        state={energy}
        testId="status-energy"
        idleLabel="The PV chain hasn't run for this design yet"
      />
      {report === null ? null : (
        <>
          <div className="readouts">
            <Readout
              id="energy-annual-ac"
              label="Electricity made in a year"
              // the exact figure rides on the attribute for a check that divides by it; the
              // text is two figures, the same as the money, since a year's model run is not a
              // meter reading
              value={
                <span data-kwh={String(report.annualAcKwh)}>{approxKwh(report.annualAcKwh)}</span>
              }
            />
            <Readout
              id="energy-specific-yield"
              label="Electricity per kilowatt of panel"
              value={`${Math.round(report.specificYieldKwhPerKwp)} kWh/kWp`}
            />
            <Readout
              id="energy-nameplate-dc"
              label="Power the panels are rated at"
              value={`${report.nameplateDcKw.toFixed(1)} kW DC`}
            />
            <Readout
              id="energy-nameplate-ac"
              label="Power the inverter can pass"
              value={`${report.nameplateAcKw.toFixed(1)} kW AC`}
            />
            <Readout
              id="energy-dc-ac-ratio"
              label="Panel power against inverter power"
              value={`${report.dcAcRatio.toFixed(2)}:1`}
            />
            <Readout
              id="energy-clipping"
              label="Lost because the inverter was full"
              value={`${percent(report.clippingLossFraction)}, ${kwh(report.clippingLossKwh)}`}
            />
            <Readout
              id="energy-system-loss"
              label="System losses"
              value={percent(report.systemLossFraction)}
            />
            <Readout
              id="energy-land"
              label="Output per land area"
              value={`${report.annualAcKwhPerM2Land.toFixed(1)} kWh/m²`}
            />
          </div>
          <LossStack report={report} />
          <Ler report={report} />
          <Reference report={report} />
          <Provenance report={report} />
        </>
      )}
    </Panel>
  )
}
