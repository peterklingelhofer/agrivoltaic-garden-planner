import {
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { CANCEL_EVENTS } from '../state/motion'
import { registerLanding } from './landing'
import { Action } from './controls'
import { RequirementNotice } from './RequirementNotice'
import type { Requirement } from './requirement'

export interface StepDefinition<T extends string> {
  readonly id: T
  /** The question this step answers, in the words of someone who has never grown anything */
  readonly label: string
  /**
   * What this step has settled, shown while it's closed. Null while nothing is settled yet, so
   * a step reads as done only when it is: a closed step with a blank line under it is the one
   * thing a checklist must never be, which is ambiguous about whether it was answered
   */
  readonly summary: string | null
  /**
   * What must be true before this step can say anything. Null for a step that never waits: the
   * place, the ground it sits on, and the reference shelf at the end
   */
  readonly requirement: Requirement | null
  /**
   * The one step to look at after the open one. When the guided setup hands over, this is what says
   * where to go: the list alone shows what is open and what is locked, and never what comes next
   */
  readonly next?: boolean
}

export interface StepperProps<T extends string> {
  readonly label: string
  readonly steps: readonly StepDefinition<T>[]
  /** The open step. The sidebar always has one open */
  readonly selected: T
  /**
   * A key that changes whenever the app itself picks the open step, and should land at the top of
   * the column the way a press does. The guided setup opens the plants step as it hands over
   */
  readonly landOn: string
  onSelect(id: T): void
  renderPanel(id: T): ReactNode
}

const STEP_KEY: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

/**
 * The longest the column goes on trying to put the pressed header at the top of itself.
 *
 * It has to be able to try more than once, because a step's content doesn't necessarily exist on
 * the frame the press commits. Measured on the step that asks when to plant: at that frame the
 * column was 609px long, which is the nine closed headers and nothing else, so scrolling 367px
 * down wasn't something the container could do at all and the browser clamped it to where it
 * already was. The rows arrive off a derivation and the column is then 22,993px.
 *
 * A backstop. What actually drives the retry is the step growing, so between the
 * press and the content arriving nothing is happening at all. It stops the moment the header is
 * where it was sent, which on every step but that one is the first frame. Both of those matter,
 * because while it's live it is undoing anybody ELSE's scroll: re-scrolling every frame for a
 * second would drag the column back to the top of the step under Playwright, which scrolls the
 * calendar legend into view to screenshot it. Input from the visitor also ends it: see
 * `CANCEL_EVENTS`, the same list the camera tour and the cold open stand down on, which is what
 * keeps it from fighting a disclosure being opened
 */
const LANDING_MS = 5_000

/**
 * The thing that would move if this element were scrolled to, or null if nothing would.
 *
 * `scrollIntoView` doesn't say whether it managed anything, and "managed" is the stop condition:
 * a column that can't scroll far enough yet reports the same silence as one that has arrived.
 * Which element scrolls is still not this component's business to KNOW, only to ask.
 *
 * Whether it overflows RIGHT NOW is deliberately not part of the question: on a 390x844 phone the
 * nine closed headers are 609px inside a 747px column, so at the frame the press commits nothing
 * overflows, and asking would answer null and make the one step whose content arrives late the one
 * step that gives up immediately. What is being asked is which element is GOING to scroll, and that
 * is a property of the stylesheet
 */
const scrollerOf = (el: HTMLElement): Element | null => {
  for (let node = el.parentElement; node !== null; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return node
  }
  return null
}

interface Landing {
  /** Puts the element this returns at the top of whatever is scrolling it, and holds it there */
  start(head: () => HTMLElement | undefined): void
  stop(): void
}

/**
 * Outside the component on purpose, and it's not a style preference: `performance.now` is impure
 * and the frame callbacks are long-lived, so a linter looking at a function defined in a render
 * body can't tell this from work being done during a render. Written as closures over one frame
 * handle, it's plainly what it is, and the component holds one of them for its lifetime
 */
const createLanding = (): Landing => {
  let frame: number | null = null
  let growth: ResizeObserver | null = null
  const stop = (): void => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    growth?.disconnect()
    growth = null
    for (const event of CANCEL_EVENTS) window.removeEventListener(event, stop)
  }
  const start = (head: () => HTMLElement | undefined): void => {
    stop()
    const deadline = performance.now() + LANDING_MS
    const land = (): void => {
      const target = head()
      // jsdom has neither, and a browser missing one simply skips the scroll, without throwing
      if (typeof target?.scrollIntoView !== 'function') {
        stop()
        return
      }
      target.scrollIntoView({ block: 'start', behavior: 'auto' })
      const scroller = scrollerOf(target)
      // nothing can scroll, so the header is already everywhere it is going to be
      if (scroller === null) {
        stop()
        return
      }
      const landed =
        Math.abs(target.getBoundingClientRect().top - scroller.getBoundingClientRect().top) <= 1
      if (landed || performance.now() >= deadline) stop()
    }
    frame = requestAnimationFrame(() => {
      /*
        Registered at this level, because the press is one of them. A keydown
        handler that adds a keydown listener to `window` is adding it to a node the event hasn't
        bubbled to yet, so the very keystroke that opened the step would cancel its own landing
      */
      for (const event of CANCEL_EVENTS) window.addEventListener(event, stop, { passive: true })
      /*
        The step's own row, which is the thing that grows when its panel finishes arriving. Asking
        to be told is what makes the retry cost nothing between the press and the content: the
        alternative, trying again on every frame for as long as it might take, spends a few
        hundred frames undoing other people's scrolling to catch one event
      */
      const row = head()?.closest('li') ?? null
      if (row !== null && typeof ResizeObserver === 'function') {
        growth = new ResizeObserver(land)
        growth.observe(row)
      }
      land()
    })
  }
  return { start, stop }
}

/**
 * The sidebar as a numbered list with one thing open at a time.
 *
 * An accordion. The distinction from a tablist isn't cosmetic. Tabs say these are
 * peers, pick one. A numbered list that locks says these have an order, and here is where you're
 * in it. The steps are the dependency chain, so the order isn't a preference, and a step
 * whose prerequisite is missing says which one and offers the press that settles it.
 *
 * A locked step still opens. Refusing the click would hide the very sentence explaining the
 * refusal, and the reason a visitor clicks a locked step is to find out why it's locked
 */
export const Stepper = <T extends string>({
  label,
  steps,
  selected,
  landOn,
  onSelect,
  renderPanel,
}: StepperProps<T>): ReactElement => {
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  /** One per stepper, holding the header of the step last pressed at the top of the column */
  const landing = useMemo(() => createLanding(), [])

  // a press whose step was still arriving when the component went away
  useEffect(() => {
    const forget = registerLanding(landing)
    return () => {
      landing.stop()
      forget()
    }
  }, [landing])

  /** The step the last press opened, so the effect below can tell a press from the app */
  const pressed = useRef<T | null>(null)
  /** The step last seen open, starting at the mount, which is where the column already was */
  const seen = useRef<T>(selected)
  /** The `landOn` key last acted on, starting at the mount's, which a reload doesn't act on */
  const landed = useRef<unknown>(landOn)

  /*
    The app opened a step, so land on it the way a press would.

    Two things count as the app opening one. The `landOn` key changing, which is the guided
    setup handing over and then its generation arriving. And the open step itself changing by
    some route other than its header: "Fix Bed 1" on the seasons step, a plant clicked in the
    scene and a crop dropped on a bed all open the plants step with that bed selected, and none
    of them moved the column, so the ranking panel scrolled its own list for the bed instead and
    put the planting the press named a screen above the fold. A press has already landed by the
    time this runs and is skipped. One effect for both, because the two can arrive in one commit
    and a landing started twice in a frame is two scrolls
  */
  useEffect(() => {
    const stepChanged = selected !== seen.current
    const byPress = stepChanged && pressed.current === selected
    if (stepChanged) {
      seen.current = selected
      pressed.current = null
    }
    const keyChanged = landOn !== landed.current
    landed.current = landOn
    if (byPress) return
    if (!stepChanged && !keyChanged) return
    landing.start(() => buttons.current.get(selected))
    /*
      And focus with it, when the step changed by the app's hand. "Use this layout and plant it"
      unmounts the pressed button and opens the plants step, and without this a keyboard user is
      left with focus on nothing and no ring anywhere: the header that just landed at the top of the
      column is the one thing that says where they are. `preventScroll`, because the landing above
      is the scroll and a second one would fight it
    */
    if (stepChanged) buttons.current.get(selected)?.focus({ preventScroll: true })
  }, [landOn, selected, landing])

  /**
   * The press lands on the step it opened.
   *
   * On a phone the step is the whole screen. Measured at 375x667 with the ranking read to the
   * bottom, a press on "When do you plant it?" that doesn't land leaves the column at the top of
   * the list: what fills the screen is the first step's title and the name of the town, and the
   * panel just asked for starts 420px down a 570px window. From the middle of a step it is worse
   * than useless, because the scroll offset is simply kept: pressing "What can you grow?" from
   * 2,142px down lands inside a sow-day dropdown belonging to a bed, with nothing on screen naming
   * the step it is in.
   *
   * `scrollIntoView` on the header, so it's the scrolling
   * ancestor's problem which element that is: the sidebar is the scroller on a laptop and the
   * whole stage is the scroller on a phone, and neither is named here.
   *
   * In a frame callback because the press isn't the layout: opening a step closes the one before
   * it, and on this stepper that is worth thousands of pixels. And in a frame callback that keeps
   * going, because for some steps the content doesn't exist yet either. See `LANDING_MS`.
   *
   * Instant, unlike the two smooth scrolls this app already has, and the difference is what the
   * movement is for. Those two move the column when the visitor didn't ask it to, and the
   * animation is what says something moved. This one is the visitor's own press landing, and it
   * was measured at 10,209px on the step that opens the calendar: a second and a bit of a
   * 23,000px column flying past, with nothing to see on the way because what is underneath is a
   * different panel from the one that was there. A smooth scroll would also be animating toward
   * where the column ended when it started, which on exactly these steps is the wrong place
   */
  const openStep = (id: T): void => {
    pressed.current = id
    onSelect(id)
    landing.start(() => buttons.current.get(id))
  }

  const focusStep = (index: number): void => {
    const next = steps[((index % steps.length) + steps.length) % steps.length]
    if (!next) return
    openStep(next.id)
    buttons.current.get(next.id)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const move = STEP_KEY[event.key]
    const target =
      move !== undefined
        ? index + move
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? steps.length - 1
            : null
    if (target === null) return
    event.preventDefault()
    focusStep(target)
  }

  /**
   * The step the foot press opens: the one the caller marked next, which is the step after the open
   * one. It's the last child of the open step, under everything it asks, so on a phone the thumb
   * moves on without traveling up past the field it has just filled, and it lands the way a header
   * press does
   */
  const following = steps.find((step) => step.next === true && step.id !== selected) ?? null

  return (
    <ol className="stepper" data-testid="panel-stepper" aria-label={label}>
      {steps.map((step, index) => {
        const open = step.id === selected
        const locked = step.requirement !== null && !step.requirement.met
        const next = step.next === true && !open && !locked
        return (
          <li
            key={step.id}
            className="step"
            data-step={step.id}
            data-open={open}
            data-locked={locked}
            data-next={next ? 'true' : undefined}
          >
            <h2 className="step-head">
              <button
                type="button"
                className="step-button"
                id={`step-${step.id}`}
                data-testid={`action-step-${step.id}`}
                aria-expanded={open}
                aria-controls={`steppanel-${step.id}`}
                ref={(node) => {
                  if (node) buttons.current.set(step.id, node)
                  else buttons.current.delete(step.id)
                }}
                onClick={() => openStep(step.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                aria-describedby={locked ? `step-locked-${step.id}` : undefined}
              >
                {/*
                  The number always, and the lock beside it, always together. A padlock replacing
                  the number would leave the list reading 1, 2, 3, lock, lock, lock, lock, 8, 9: the
                  count the design set up stops halfway and the steps that are waiting lose the one
                  thing that says where they come in the order
                */}
                <span className="step-number" aria-hidden="true" data-locked={locked}>
                  {index + 1}
                </span>
                {locked ? (
                  <span
                    className="step-lock"
                    aria-hidden="true"
                    data-testid={`badge-step-locked-${step.id}`}
                  >
                    🔒
                  </span>
                ) : null}
                <span className="step-title">{step.label}</span>
                {/*
                  And the reason, for whoever can't see the padlock at all. The padlock is an emoji
                  with no accessible name and no title, so on its own it never tells a screen reader
                  what would open it, and the sentence that says so is inside the step, which has to
                  be opened to be read. `aria-describedby` puts it with the label, where the same
                  idiom already sits on the destructive press in the storage panel
                */}
                {locked && step.requirement !== null ? (
                  <span className="visually-hidden" id={`step-locked-${step.id}`}>
                    Locked. {step.requirement.reason}
                  </span>
                ) : null}
                {/* the word, in the lock's column: a next step is never a locked one */}
                {next ? (
                  <span
                    className="step-next"
                    data-testid={`badge-step-next-${step.id}`}
                    // out of the header's accessible name: the foot button already says which step
                    // is next, and "Next" inside every closed title would read as part of it
                    aria-hidden="true"
                  >
                    Next
                  </span>
                ) : null}
                {/* the summary is the whole reason a closed step is worth keeping on screen:
                    it turns the list into a record of what has been decided so far */}
                {step.summary === null ? null : (
                  <span className="step-summary" data-testid={`readout-step-summary-${step.id}`}>
                    {step.summary}
                  </span>
                )}
                {/*
                  What a locked step is waiting for, under its title where the summary would go.
                  With the reason only in a hover title and a hidden span, five padlocks could
                  appear with nothing said about why. The sentence is the same one the open step
                  prints, cut to one line by the stylesheet
                */}
                {locked && step.summary === null && step.requirement !== null ? (
                  <span
                    className="step-summary step-waiting"
                    aria-hidden="true"
                    data-testid={`readout-step-waiting-${step.id}`}
                  >
                    {step.requirement.reason}
                  </span>
                ) : null}
              </button>
            </h2>
            {/* a section here carries its own role: an accessible name is
                what promotes a section to a landmark, and `aria-labelledby` is giving it one */}
            <section
              className="steppanel"
              id={`steppanel-${step.id}`}
              aria-labelledby={`step-${step.id}`}
              data-testid={`panel-step-${step.id}`}
              hidden={!open}
            >
              {/* nothing of a closed step is in the document, which is what keeps a nine step
                  sidebar as small as three tabs would be */}
              {open && step.requirement !== null && !step.requirement.met ? (
                <RequirementNotice
                  requirement={step.requirement}
                  testId={`status-step-blocked-${step.id}`}
                />
              ) : null}
              {open && !locked ? renderPanel(step.id) : null}
              {/* nothing after the last step: it ends */}
              {open && !locked && following !== null ? (
                <div className="step-foot">
                  {/*
                    One word on the face and the whole question for a screen reader. "Next: How big
                    is the space, and what shades it?" printed directly above a header saying "How
                    big is the space, and what shades it?" reads as the same control twice. It's
                    the filled press on every step, whatever else the step carries, because "the big
                    green Next" is what a visitor looks for when a step is done
                  */}
                  <Action
                    testId="action-step-next"
                    tone="primary"
                    block
                    onClick={() => openStep(following.id)}
                  >
                    Next
                    <span className="visually-hidden">: {following.label}</span>
                  </Action>
                </div>
              ) : null}
            </section>
          </li>
        )
      })}
    </ol>
  )
}
