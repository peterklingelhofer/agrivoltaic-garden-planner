import type { ReactElement } from 'react'
import { useAppStore } from '../state/store'
import type { TekDesignRule } from '../types/tek'
import { AsyncNotice, Panel } from './Panel'
import { SourceLink } from './SourcesPanel'
import { peoplesOf, practiceOf, TEK_ENDORSEMENT } from './tek'

const Credit = ({ rule }: { readonly rule: TekDesignRule }): ReactElement => {
  const a = rule.attribution
  return (
    <li data-testid={`item-tek-${rule.key}`}>
      <h3>{rule.title}</h3>
      <p>{rule.guidance}</p>
      <p data-testid={`readout-tek-peoples-${rule.key}`}>
        <strong>Peoples:</strong> {peoplesOf(rule)}
      </p>
      {a.individualInnovators.length > 0 ? (
        <p data-testid={`readout-tek-innovators-${rule.key}`}>
          <strong>Named innovators:</strong> {a.individualInnovators.join(', ')}
        </p>
      ) : null}
      <p data-testid={`readout-tek-status-${rule.key}`}>
        <strong>Practice status:</strong> {practiceOf(rule)}
      </p>
      <p data-testid={`readout-tek-endorsement-${rule.key}`}>
        {TEK_ENDORSEMENT}. Source type: {a.sourceType}.
      </p>
      <ul className="list">
        {a.citations.map((id) => (
          <li key={id}>
            <SourceLink id={id} />
          </li>
        ))}
      </ul>
    </li>
  )
}

export const TekCreditsPanel = (): ReactElement => {
  const tekRules = useAppStore((s) => s.tekRules)
  return (
    <Panel
      id="tek-credits"
      title="TEK credits"
      subtitle="Every rule drawn from traditional ecological knowledge (TEK) is attributed to specifically named peoples. There is no merged 'ancient wisdom' preset, and pan-indigenous generalisation is the failure mode this design avoids."
    >
      <AsyncNotice state={tekRules} testId="status-tek" idleLabel="TEK rules not loaded" />
      {tekRules.status === 'ready' ? (
        <ul className="list" data-testid="list-tek">
          {tekRules.value.map((rule) => (
            <Credit key={rule.id} rule={rule} />
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
