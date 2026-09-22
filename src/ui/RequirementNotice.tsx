import type { ReactElement } from 'react'
import { Action } from './controls'
import type { Requirement } from './requirement'

/**
 * What is missing, and the press that settles it, said once.
 *
 * The sentence and the button are one element, so a later edit can never change one of them without
 * the other
 */
export const RequirementNotice = ({
  requirement,
  testId,
}: {
  readonly requirement: Requirement
  readonly testId: string
}): ReactElement | null => {
  if (requirement.met) return null
  const { remedy } = requirement
  return (
    <div className="requirement" data-testid={testId}>
      <p className="notice notice-idle">{requirement.reason}</p>
      {remedy === null ? null : (
        <Action
          testId={`${testId}-run`}
          tone="primary"
          disabled={remedy.disabled === true}
          onClick={remedy.run}
        >
          {remedy.disabled === true ? (remedy.busyLabel ?? remedy.label) : remedy.label}
        </Action>
      )}
    </div>
  )
}
