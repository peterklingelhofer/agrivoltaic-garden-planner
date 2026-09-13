import type { ReactElement } from 'react'
import { Action } from './controls'
import type { Requirement } from './requirement'

/**
 * What is missing, and the press that settles it, said once.
 *
 * Replaces four hand-built versions of the same thing. The sentence and the button are one
 * element rather than two, because the pair that drifted apart was exactly the failure: the
 * ranking panel put its sentence on a status line and its button in a separate row, and a later
 * edit changed one of them
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
