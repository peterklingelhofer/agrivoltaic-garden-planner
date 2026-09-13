import { Fragment, type ReactElement } from 'react'
import type { FolkloreCompanionRule } from '../types/companion'
import { Panel } from './Panel'
import { SourceLink } from './SourcesPanel'

export interface FolklorePanelProps {
  readonly rules: readonly FolkloreCompanionRule[]
}

// Grade D and E rules are unscoreable by construction: this panel is the only place they can
// be rendered, and nothing here reaches a layout, a score or a yield band
export const FolklorePanel = ({ rules }: FolklorePanelProps): ReactElement => {
  return (
    <Panel
      id="folklore"
      title="Folklore and contradicted claims"
      subtitle="Grade D (traditional, untested) and grade E (no evidence or contradicted). These never affect scoring or layout."
    >
      {rules.length === 0 ? (
        <p className="notice notice-idle" data-testid="status-folklore">
          No folklore rules loaded
        </p>
      ) : (
        <ul className="list" data-testid="list-folklore">
          {rules.map((rule) => (
            <li key={rule.id} data-testid={`item-folklore-${rule.id}`} data-grade={rule.grade}>
              <span className={`badge badge-grade-${rule.grade.toLowerCase()}`}>
                Grade {rule.grade}
              </span>{' '}
              {rule.subjectRef} + {rule.objectRef}
              {rule.mechanism ? `: ${rule.mechanism}` : ''}
              {rule.contradictedBy.length > 0 ? (
                <em data-testid={`readout-folklore-contradicted-${rule.id}`}>
                  {' '}
                  Contradicted by{' '}
                  {rule.contradictedBy.map((id, index) => (
                    <Fragment key={id}>
                      {index > 0 ? '; ' : null}
                      <SourceLink id={id} />
                    </Fragment>
                  ))}
                </em>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
