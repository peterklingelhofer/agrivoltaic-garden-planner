import { ONBOARDING_STEPS, type OnboardingStep } from '../state/slices'

/**
 * Which question to ask next, given what has actually been answered.
 *
 * The agent used to ask whatever came after the last question answered, in table order, and that
 * is wrong the moment somebody volunteers something. A real session went: "I want to grow some
 * vegetables" -- recorded as the ambition, which is right -- and the agent then asked about native
 * planting, having never established where the garden is or how big it is. The visitor typed
 * "Amherst, Massachusetts" into a question about natives and was told it did not follow.
 *
 * Asking for what is still MISSING rather than for what comes next fixes that class outright, and
 * it is also simply how a person asks: somebody who tells you they want salad has not told you
 * where they live, and you ask them where they live
 */

/**
 * The questions worth asking, in the order the garden depends on them.
 *
 * `results` and `planting` are excluded because neither is a question: they are the outcome and
 * the follow-on, and both are reached by asking for them. Running off the end of this list returns
 * null, which is what tells the conversation it has everything and can offer to design something
 */
export const QUESTION_STEPS: readonly OnboardingStep[] = ONBOARDING_STEPS.filter(
  (step) => step !== 'results' && step !== 'planting',
)

export const nextQuestion = (answered: ReadonlySet<OnboardingStep>): OnboardingStep | null =>
  QUESTION_STEPS.find((step) => !answered.has(step)) ?? null

/** Whether every question has an answer, so the conversation can offer the thing it is all for */
export const readyToDesign = (answered: ReadonlySet<OnboardingStep>): boolean =>
  nextQuestion(answered) === null
