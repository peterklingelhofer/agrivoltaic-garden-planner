import type { ReactElement } from 'react'
import { usStateOf } from '../data/retail-price'
import { useAppStore } from '../state/store'
import type { ComplianceCheck } from '../types/compliance'
import { OUTCOME_LABEL, criterionSummary } from './format'
import { MissingRaster, MISSING_RASTER } from './MissingRaster'
import { AsyncNotice, Panel } from './Panel'

const CheckBlock = ({ check }: { readonly check: ComplianceCheck }): ReactElement => (
  <div className="compliance-check" data-testid={`item-compliance-${check.regime.id}`}>
    <h3>
      {check.regime.label}{' '}
      <span
        className={`badge badge-${check.regime.verifiability}`}
        data-testid={`badge-compliance-${check.regime.id}`}
      >
        estimate only, not a determination
      </span>
    </h3>
    <p data-testid={`readout-compliance-overall-${check.regime.id}`}>
      {OUTCOME_LABEL[check.overall]}
    </p>
    <p className="disclaimer" data-testid={`readout-compliance-barrier-${check.regime.id}`}>
      {check.regime.determinationBarrier}
    </p>
    <p className="disclaimer" data-testid={`readout-compliance-waiver-${check.regime.id}`}>
      {check.waiverNote}
    </p>
    <ul className="list">
      {check.results.map((result) => (
        <li key={result.criterion.key} data-testid={`item-criterion-${result.criterion.key}`}>
          <strong>{result.criterion.label}</strong>: {criterionSummary(result)}
          <em> ({result.criterion.thresholdText})</em>
          {result.outcome === 'misses' || (result.outcome === 'approximate' && result.remedy) ? (
            <span className="remedy"> {result.remedy}</span>
          ) : null}
          {result.outcome === 'approximate' ? (
            <span className="disclaimer"> {result.windowDisclaimer}</span>
          ) : null}
          {result.outcome === 'estimate' ? (
            <span className="disclaimer"> {result.disclaimer}</span>
          ) : null}
        </li>
      ))}
    </ul>
  </div>
)

export const CompliancePanel = (): ReactElement => {
  const compliance = useAppStore((s) => s.compliance)
  const raster = useAppStore((s) => s.raster)
  /**
   * Where the garden is, so that outside Massachusetts the one rule this app can check is
   * introduced as another state's rule. Without it, a grower in New Jersey reads "Measured against
   * the Massachusetts SMART Dual-use expedited design parameters, which this design would need an
   * exception request for" and nothing on the step says the rule is not theirs
   */
  const state = useAppStore((s) =>
    s.site.status === 'ready' ? usStateOf(s.site.value.botanicalArea) : null,
  )
  const place = useAppStore((s) => s.locationLabel)
  const smart = compliance.find((check) => check.regime.id === 'us-ma-smart')
  const others = compliance.filter((check) => check.regime.id !== 'us-ma-smart')

  return (
    <Panel
      id="compliance"
      title="Rules this design has to meet"
      subtitle="Massachusetts SMART is the only regime this app can check from geometry alone"
    >
      <p className="notice notice-warn" data-testid="readout-compliance-determination">
        Not a determination. These checks are informational and carry no regulatory weight.
      </p>
      {state !== null && state !== 'MA' ? (
        <p className="notice notice-idle" data-testid="readout-compliance-elsewhere">
          {place} isn't in Massachusetts, so the rule below doesn't apply to this garden. It's shown
          because it's the one written dual-use standard the app can measure a layout against, and a
          design that would pass it is a design with room to grow under.
        </p>
      ) : null}
      {/* the idle case carries a press now, so it is the one state `AsyncNotice` does not
          render here: loading and error still belong to it, because those are this slice's own
          business rather than a thing the visitor can settle */}
      {raster.status === 'idle' ? (
        <MissingRaster testId="status-compliance" />
      ) : (
        <AsyncNotice state={raster} testId="status-compliance" idleLabel={MISSING_RASTER} />
      )}
      {smart ? <CheckBlock check={smart} /> : null}
      {others.map((check) => (
        <CheckBlock key={check.regime.id} check={check} />
      ))}
    </Panel>
  )
}
