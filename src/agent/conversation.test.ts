import { describe, expect, it } from 'bun:test'
import type { OnboardingStep } from '../state/slices'
import { nextQuestion, QUESTION_STEPS, readyToDesign } from './conversation'

const answered = (...steps: readonly OnboardingStep[]): ReadonlySet<OnboardingStep> =>
  new Set(steps)

describe('what to ask next', () => {
  it('opens on the first question rather than waiting to be spoken to', () => {
    expect(nextQuestion(answered())).toBe('location')
  })

  /**
   * A visitor says "I want to grow some vegetables", a perfectly good answer to the question about
   * ambition, and an agent asking in table order replies by asking whether the beds should lean
   * towards native planting, having never established where the garden is or how big it is.
   * "Amherst, Massachusetts" typed into a question about natives is then told it did not follow
   */
  it('asks for what is still missing, not for whatever follows in the table', () => {
    expect(nextQuestion(answered('growing'))).toBe('location')
    expect(nextQuestion(answered('growing', 'location'))).toBe('space')
  })

  it('walks the whole list without repeating itself', () => {
    const seen: OnboardingStep[] = []
    let held = answered()
    for (;;) {
      const next = nextQuestion(held)
      if (next === null) break
      expect(seen).not.toContain(next)
      seen.push(next)
      held = new Set([...held, next])
    }
    expect(seen).toEqual([...QUESTION_STEPS])
  })

  it('runs out, which is what says there is enough to design something', () => {
    expect(readyToDesign(answered())).toBe(false)
    expect(readyToDesign(answered(...QUESTION_STEPS))).toBe(true)
    expect(nextQuestion(answered(...QUESTION_STEPS))).toBeNull()
  })

  /** Neither is a question: one is the outcome and one is the follow-on, and both are asked for */
  it('never asks the results or the planting as though they were questions', () => {
    expect(QUESTION_STEPS).not.toContain('results')
    expect(QUESTION_STEPS).not.toContain('planting')
  })
})
