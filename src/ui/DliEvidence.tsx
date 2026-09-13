import { Fragment, type ReactElement } from 'react'
import { useAppStore } from '../state/store'
import { Action } from './controls'
import {
  DLI_CALIBRATION,
  DLI_DISCLOSURE,
  DLI_HEADLINE,
  DLI_STANDFIRST,
  RUNKLE_ATTRIBUTION,
  RAMPS_LIGHT_CITED,
  RUNKLE_CITED,
  RUNKLE_CITEKEY_GAP,
  RUNKLE_QUOTE,
  type DliEvidence,
} from './dli'
import { TierBadge } from './EvidenceBadge'
import { Panel } from './Panel'
import { SourceLink } from './SourcesPanel'

export interface DliEvidenceNoteProps {
  readonly evidence: DliEvidence
  readonly subjectId: string
  readonly prefix: string
}

/**
 * Rendered wherever the light gate holds a crop back, so a threshold nobody measured
 * never looks like one somebody did
 */
export const DliEvidenceNote = ({
  evidence,
  subjectId,
  prefix,
}: DliEvidenceNoteProps): ReactElement => (
  <p
    className="readout-note"
    data-testid={`readout-${prefix}-dli-evidence-${subjectId}`}
    data-provenance={evidence.provenance}
    data-tier={evidence.tier ?? 'none'}
    data-class-inference={String(evidence.classInference)}
  >
    <TierBadge tier={evidence.tier} testId={`badge-${prefix}-dli-tier-${subjectId}`} />{' '}
    {evidence.summary}
    {evidence.reason ? `: ${evidence.reason}` : ''}
    {/* each citekey is a `SourceLink`, because a bare citekey leaves a reader no way to check
        the threshold */}
    {evidence.citations.length > 0 ? (
      <>
        {' ('}
        {evidence.citations.map((id, index) => (
          <Fragment key={id}>
            {index > 0 ? ', ' : null}
            <SourceLink id={id} />
          </Fragment>
        ))}
        {')'}
      </>
    ) : null}
  </p>
)

/** The inline affordance: the ranking states the headline and hands off to the disclosure */
export const DliEvidenceLink = (): ReactElement => {
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  return (
    <details className="experimental" data-testid="panel-dli-evidence-inline">
      <summary>{DLI_HEADLINE}</summary>
      <p>{DLI_STANDFIRST}</p>
      <Action testId="action-dli-evidence-open" onClick={() => setSidebarStep('sources')}>
        Read the full DLI evidence in Sources
      </Action>
    </details>
  )
}

export const DliEvidencePanel = (): ReactElement => {
  return (
    <Panel id="dli-evidence" title="Evidence behind the DLI thresholds" subtitle={DLI_HEADLINE}>
      <p data-testid="readout-dli-evidence-standfirst">{DLI_STANDFIRST}</p>
      <ul className="list" data-testid="list-dli-evidence">
        {DLI_DISCLOSURE.map((point) => (
          <li key={point.id} data-testid={`item-dli-evidence-${point.id}`}>
            <strong>{point.heading}</strong>
            <p>{point.body}</p>
            {point.id === 'shade-plants-in-sun' ? (
              <p className="readout-note" data-testid="readout-dli-evidence-ramps-citekey">
                <SourceLink id={RAMPS_LIGHT_CITED} />
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <blockquote data-testid="readout-dli-evidence-runkle">
        <p>&ldquo;{RUNKLE_QUOTE}&rdquo;</p>
        <footer>{RUNKLE_ATTRIBUTION}</footer>
      </blockquote>
      <p className="readout-note" data-testid="readout-dli-evidence-citekey-gap">
        {RUNKLE_CITEKEY_GAP} <SourceLink id={RUNKLE_CITED} />
      </p>
      <p className="disclaimer" data-testid="readout-dli-evidence-calibration">
        {DLI_CALIBRATION}
      </p>
    </Panel>
  )
}
