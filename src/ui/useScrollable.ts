import { useEffect, useState, type RefObject } from 'react'

/**
 * What is out of sight in a scroll box, measured rather than assumed.
 *
 * Extracted from the guided dock's answer column, which needed it first and computed the two
 * questions worth answering separately. It's here because two more places need the same answer
 * for the same reason: the dock's help paragraph and the agent's transcript both scroll, and both
 * would otherwise be content a keyboard can't reach.
 *
 * Read on every scroll and on every resize of the box AND of what is in it, because all three
 * change what is hidden: new content, a control appearing inside it, and the window. A fade drawn
 * from a stale measurement, or drawn always, is the same lie as no fade at all
 */
export interface Overflow {
  /** There's content below the bottom edge right now, which is what a fade declares */
  readonly more: boolean
  /**
   * There's content out of sight wherever the box happens to be scrolled to. Kept apart from
   * `more` because they answer different questions: a box scrolled to its end has nothing below
   * it and is still a box somebody has to be able to scroll back up
   */
  readonly scrollable: boolean
}

/**
 * The ref is the CALLER's, rather than made here and handed back.
 *
 * Two reasons, and the second is the one that decided it. Some of these boxes are already
 * referenced for something else: the transcript is scrolled to its newest turn. One ref is
 * better than two on one element. And a ref returned from a hook is a ref the React Compiler rules
 * can't recognize as one: `useExhaustiveDependencies` started asking for `log.current` in a
 * dependency list, which isn't a thing that can be depended on
 */
export const useScrollable = <T extends HTMLElement>(
  node: RefObject<T | null>,
  /**
   * Something that changes when the CONTENT does, and the reason this isn't optional in
   * practice.
   *
   * A ResizeObserver on the box says nothing when the box is the thing being held at a fixed size:
   * new content inside it changes what is hidden and changes no measurable box at all. Observing
   * `firstElementChild` covers only a growing column. A paragraph of text has no element child,
   * and when a transcript gains a turn at the end, its first child is exactly as tall as it was.
   *
   * So the caller passes whatever identifies the content, the step or the number of turns, and
   * the measurement is taken again when it moves
   */
  watch?: unknown,
): Overflow => {
  const [overflow, setOverflow] = useState<Overflow>({ more: false, scrollable: false })

  /*
    `watch` is a dependency the body never reads, which biome's
    `useExhaustiveDependencies` calls unnecessary: it treats it as an outer-scope value, and for a
    custom hook's own parameter that is wrong. Re-running IS the effect of it changing, because
    re-running takes the measurement again. Writing it into the body to satisfy the rule would be
    a `void watch` and a lie about why it's there
  */
  // biome-ignore lint/correctness/useExhaustiveDependencies: `watch` re-measures, see above
  useEffect(() => {
    const box = node.current
    if (box === null) return
    const read = (): void => {
      const hidden = box.scrollHeight - box.clientHeight
      const next = { more: hidden - box.scrollTop > 1, scrollable: hidden > 1 }
      // the same answer is the same object, so a scroll that changes nothing renders nothing
      setOverflow((was) =>
        was.more === next.more && was.scrollable === next.scrollable ? was : next,
      )
    }
    read()
    box.addEventListener('scroll', read, { passive: true })
    // jsdom has no ResizeObserver and no layout to observe with it, so the listener alone is
    // what runs under the unit tests, where every box is zero and the fade is never shown
    const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    sizes?.observe(box)
    if (box.firstElementChild !== null) sizes?.observe(box.firstElementChild)
    return () => {
      box.removeEventListener('scroll', read)
      sizes?.disconnect()
    }
  }, [node, watch])

  return overflow
}
