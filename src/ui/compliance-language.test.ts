import { describe, expect, it } from 'bun:test'
import { OUTCOME_LABEL, criterionSummary } from './format'
import type { ComplianceCheck, ComplianceOutcome, CriterionResult } from '../types/compliance'
import { wordsFor } from './agent-words'
import { NOT_A_DETERMINATION } from './onboarding'

// the verification document item 1: no regime is self-verifiable, so no user-visible string may
// read as a determination. DOER mandates its own tool, the window is Growing Season Hours,
// and every parameter is waivable
const FORBIDDEN =
  /\b(compliant|non-compliant|noncompliant|pass|passes|fail|failed|fails|approved|rejected)\b/i

const OUTCOMES: readonly ComplianceOutcome[] = [
  'meets-expedited-parameters',
  'requires-exception-request',
  'indeterminate',
]

const SAMPLES: readonly CriterionResult[] = [
  {
    criterion: { key: 'a', label: 'a', thresholdText: 'a' },
    outcome: 'meets',
    measured: 1,
    threshold: 0.5,
    unit: 'm',
  },
  {
    criterion: { key: 'b', label: 'b', thresholdText: 'b' },
    outcome: 'misses',
    measured: 0.1,
    threshold: 0.5,
    unit: 'm',
    remedy: 'raise it',
    worstCellFraction: null,
  },
  {
    criterion: { key: 'c', label: 'c', thresholdText: 'c' },
    outcome: 'approximate',
    measured: 0.4,
    threshold: 0.5,
    unit: 'fraction',
    windowDisclaimer: 'month-restricted',
    remedy: null,
  },
  {
    criterion: { key: 'd', label: 'd', thresholdText: 'd' },
    outcome: 'not-applicable',
    reason: 'needs an inverter model',
  },
]

describe('compliance language', () => {
  it('never renders a determination for any outcome', () => {
    for (const outcome of OUTCOMES) expect(OUTCOME_LABEL[outcome]).not.toMatch(FORBIDDEN)
  })

  it('never renders pass or fail language for any criterion result', () => {
    for (const sample of SAMPLES) expect(criterionSummary(sample)).not.toMatch(FORBIDDEN)
  })

  it('covers every outcome so a new one cannot be added unlabelled', () => {
    expect(Object.keys(OUTCOME_LABEL).sort()).toEqual([...OUTCOMES].sort())
  })

  /**
   * The agent leads the readout with a plain sentence, because fourteen lines of criteria are not
   * an answer to "is this legal". It is the line most likely to be read and the least likely to
   * be read carefully, so it is held to the same language rule as everything under it, and the
   * sentence saying none of this is a determination still has to close it
   */
  it('leads with a plain reading that is still not a determination', () => {
    const checks: readonly ComplianceCheck[] = OUTCOMES.map((overall, at) => ({
      regime: {
        id: 'us-ma-smart',
        label: `regime ${String(at)}`,
        verifiability: 'estimate-only',
        determinationBarrier: 'the programme decides',
        citations: ['doer2018-smart'] as unknown as ComplianceCheck['regime']['citations'],
      },
      results: [],
      overall,
      isDetermination: false,
      waiverNote: 'waivable',
    }))
    const lines = wordsFor({ kind: 'compliance', checks }, [])
    const first = lines[0]?.text ?? ''
    expect(first).not.toMatch(FORBIDDEN)
    // it says how many were looked at, and does not stop at a number
    expect(first).toContain('3 programmes')
    expect(lines[lines.length - 1]?.text).toBe(NOT_A_DETERMINATION)
  })
})
