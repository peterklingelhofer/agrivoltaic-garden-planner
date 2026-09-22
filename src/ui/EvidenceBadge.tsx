import type { ReactElement } from 'react'
import type { DataTier, EvidenceGrade } from '../types/evidence'
import { gradeDisplay } from './format'

export const EvidenceBadge = ({
  grade,
  testId,
}: {
  readonly grade: EvidenceGrade
  readonly testId: string
}): ReactElement => (
  <span
    className={`badge badge-grade-${grade.toLowerCase()}`}
    data-testid={testId}
    data-grade={grade}
  >
    {gradeDisplay(grade)}
  </span>
)

/** A null tier is the unsourced case, which must always read as weaker than C */
export const TierBadge = ({
  tier,
  testId,
}: {
  readonly tier: DataTier | null
  readonly testId: string
}): ReactElement => (
  <span
    className={`badge badge-tier-${(tier ?? 'none').toLowerCase()}`}
    data-testid={testId}
    data-tier={tier ?? 'none'}
  >
    {tier === null ? 'Unsourced' : tier === 'C' ? 'Tier C, provisional' : `Tier ${tier}`}
  </span>
)
