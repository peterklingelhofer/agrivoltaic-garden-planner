import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'

/** Between the `i` and the sentence, and between the sentence and the edge of the window */
const GAP = 6

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(value, high))

/**
 * The "what does this mean" affordance: a small `i` beside a label, and the sentence it holds.
 *
 * Hover is the gesture that was asked for, and hover alone is the one gesture that cannot be the
 * whole answer: a touch screen has no pointer to rest, and a keyboard has no pointer at all. So
 * this opens on all three, and the native `title` attribute it replaces does none of them
 * properly. WCAG 1.4.13 is the specific rule, and it asks for three things this satisfies:
 * dismissible without moving the pointer (Escape), hoverable (the bubble is inside the wrapper
 * the pointer is already in, so travelling into it does not close it), and persistent (it closes
 * on an explicit gesture, never on a timer).
 *
 * This uses `aria-describedby`. It is not a label: the trigger's own name is already the field beside it,
 * and a screen reader that announced "more about row spacing" as the NAME would have replaced
 * the field's name with a description of the button. Described-by reads it after, which is what
 * it is: a footnote on the control, not the control.
 *
 * What belongs in one is settled elsewhere and is worth restating here, because this component
 * is exactly the thing that would quietly erode it: `onboarding.ts` holds that the only thing an
 * experience level hides is detail, and that a caveat is never detail. A definition of a term
 * goes in here. A limit on what the app knows does not.
 *
 * The bubble is positioned in the viewport, outside the sidebar, because the sidebar is a scroll
 * box: an absolutely positioned bubble beside a row near its top or its foot would be clipped by
 * the box, hiding the very sentence it was opened to show. Measured off the trigger when it
 * opens, and again on any scroll or resize while it is open, since a fixed element does not move
 * with the box it was measured against
 */
export const InfoTip = ({
  label,
  children,
  testId,
}: {
  /** Names the term being explained, so the button is not one of nine identical "more info"s */
  readonly label: string
  readonly children: ReactNode
  readonly testId: string
}): ReactElement => {
  const id = useId()
  /**
   * Three ways to be open, kept apart, because folding them into one toggle breaks on a pointer
   * press: it arrives as pointerenter and then click, so the enter would open the bubble and the
   * click would toggle it shut again, and only a hover would ever show anything. The hover, the
   * focus and the press each hold the bubble open on their own; the press pins it so it survives
   * the pointer leaving, and a second press unpins it
   */
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || focused || pinned
  const wrap = useRef<HTMLSpanElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const bubble = useRef<HTMLSpanElement | null>(null)
  const [at, setAt] = useState<{ readonly top: number; readonly left: number } | null>(null)

  const place = useCallback((): void => {
    const anchor = trigger.current
    const box = bubble.current
    if (anchor === null || box === null) return
    const t = anchor.getBoundingClientRect()
    const b = box.getBoundingClientRect()
    // jsdom lays nothing out and answers every rect with zeros; so does an element the browser
    // has not measured yet. A bubble pinned to the top-left corner is worse than one left where
    // the stylesheet put it, so this simply declines to place it
    if (t.width === 0 && t.height === 0) return
    const below = window.innerHeight - t.bottom
    const above = t.top
    const goAbove = b.height + GAP > below && above > below
    setAt({
      top: goAbove ? Math.max(GAP, t.top - GAP - b.height) : t.bottom + GAP,
      left: clamp(
        t.left + t.width / 2 - b.width / 2,
        GAP,
        Math.max(GAP, window.innerWidth - b.width - GAP),
      ),
    })
  }, [])

  /**
   * Measured the moment the bubble exists and before the browser paints, so it is never seen at
   * the wrong place. This is a callback ref. It is not an effect: React runs it during the commit, which
   * is the one point where the element has been laid out and nothing has been painted yet
   */
  const holdBubble = useCallback(
    (node: HTMLSpanElement | null): void => {
      bubble.current = node
      if (node === null) setAt(null)
      else place()
    },
    [place],
  )

  /**
   * And again on any scroll: the sidebar scrolls under a fixed bubble, which would otherwise sit
   * still while the word it explains travels away from it. Capture phase, because the scroll that
   * matters is the sidebar's own and a scroll on an element does not bubble to the window
   */
  useEffect(() => {
    if (!open) return
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  /**
   * Escape closes it wherever the focus is, which is the dismissible half of 1.4.13. Bound to the
   * document. It is not the button: the pointer can open this without ever moving
   * focus to it, and a key handler on an unfocused button never runs
   */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      // whichever of the three is holding it, Escape lets go of all of them
      setHovered(false)
      setFocused(false)
      setPinned(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span
      className="infotip"
      ref={wrap}
      // on the wrapper, not the button: the bubble is a child of it, so the pointer moving from
      // the `i` into the sentence it opened never leaves the element that is keeping it open
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="infotip-trigger"
        ref={trigger}
        data-testid={testId}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        aria-label={`What is ${label}?`}
        onClick={() => setPinned((value) => !value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        i
      </button>
      {open ? (
        <span
          className="infotip-bubble"
          ref={holdBubble}
          id={id}
          role="tooltip"
          data-testid={`${testId}-bubble`}
          style={at === null ? undefined : { top: at.top, left: at.left }}
        >
          {children}
        </span>
      ) : null}
    </span>
  )
}
