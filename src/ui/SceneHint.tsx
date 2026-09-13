import { useEffect, useState, type ReactElement } from 'react'
import { coarsePointer } from '../state/motion'
import { EMPTY_LIST } from '../state/slices'
import { useAppStore } from '../state/store'
import { cropName } from './format'
import { joinWords } from './polyculture'
import { Action } from './controls'
import { cornersSoFar, DRAW_HINT, MOVE_HINT, TOUCH_DRAW_HINT, TOUCH_MOVE_HINT } from './scene-hint'
import { useSeasonEvent } from './useSeasonSweep'

/**
 * What to do with the bed that was just tapped.
 *
 * On a laptop this would be furniture: the panel about the selected bed is in the sidebar beside
 * the garden, and selecting a bed visibly fills it. On a phone the garden and the editor take
 * turns on the screen, so a tap selected the bed, raised its move handles, and nothing anywhere
 * said that the thing to do with it was on another surface. It was the one dead end left in the
 * walkthrough of the phone.
 *
 * The press has to do two things or it is not worth having. Switching surfaces alone lands the
 * visitor wherever the stepper happened to be, which after a first visit is the first step and
 * the address they already gave; it opens the step that plants a bed as well, which is the answer
 * to the question the tap asked.
 *
 * Hidden above the breakpoint by the stylesheet rather than by a width read in JavaScript, for
 * the reasons `MobileTabs` gives: one definition of "narrow", and `display: none` keeps a control
 * with nothing to do out of a desktop reader's accessibility tree entirely
 */
const PlantPrompt = (): ReactElement | null => {
  const bed = useAppStore((s) => {
    const id = s.selectedBedId
    // nothing while a layout is being looked at: the beds in the picture are the proposal's,
    // and "Bed 2 is empty, plant it" under them would open the garden's own Bed 2
    if (id === null || s.previewPlot !== null) return null
    return s.plot?.beds.find((entry) => entry.id === id) ?? null
  })
  const setSurface = useAppStore((s) => s.setSurface)
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  const catalog = useAppStore((s) => (s.catalog.status === 'ready' ? s.catalog.value : EMPTY_LIST))
  if (bed === null) return null
  /*
    What is in the bed, on the strip, and a press that says where it goes. "Plant it" on a bed
    already full of plants read as a way to see them planted, so the press could look like it
    should change the picture. It should not open the plan. A bed's plants also could not be read
    off the garden without landing a tap on each clump
  */
  const names = bed.plantings.map((planting) => cropName(catalog, planting.cropId))
  const planted = names.length > 0
  return (
    <aside
      className="scene-hint scene-hint-select"
      data-testid="status-scene-selected"
      data-bed={bed.id}
    >
      <p className="scene-hint-body">
        {planted ? `${bed.label}: ${joinWords(names)}` : `${bed.label} is empty`}
      </p>
      <Action
        testId="action-scene-plant-bed"
        tone="primary"
        onClick={() => {
          setSidebarStep('plants')
          setSurface('edit')
        }}
      >
        {planted ? 'Change its plants' : 'Plant it'}
      </Action>
    </aside>
  )
}

/**
 * A line of instruction over the scene while a shape is being drawn, and the keys it promises.
 *
 * The keyboard half is deliberately in the same component as the sentence advertising it: they
 * are one promise, and the failure this fixes was a UI that had the finishing move and never said
 * so anywhere the drawer could see. The listener is on `window` rather than on the canvas because
 * the canvas cannot hold focus after a click on a sidebar field, and a grower who typed a plot
 * width and came back to the drawing would otherwise find Enter dead.
 *
 * The effect is above the early return so the keys work for as long as the mode does. Both
 * handlers are gated on the mode, and the store's own `commitDraft` refuses a draft under three
 * vertices, so neither key can do anything surprising outside a drawing already under way
 */
export const SceneHint = (): ReactElement | null => {
  const mode = useAppStore((s) => s.mode)
  const [coarse] = useState(coarsePointer)
  const draftLength = useAppStore((s) => s.draft.length)
  const commitDraft = useAppStore((s) => s.commitDraft)
  const cancelDraft = useAppStore((s) => s.cancelDraft)
  // "Bed 3: cucumber harvested", named for a couple of seconds as the season plays past it
  const seasonEvent = useSeasonEvent()

  useEffect(() => {
    if (mode === 'select' || mode === 'move') return undefined
    const onKey = (event: KeyboardEvent): void => {
      // never taken from a field: Enter in the address search runs a search, and a half-drawn
      // plot must not turn that into a bed
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, textarea, select') !== null)
        return
      if (event.key === 'Enter') {
        event.preventDefault()
        commitDraft()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        cancelDraft()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, commitDraft, cancelDraft])

  // nothing is being drawn, so the question is what to do with whatever is selected
  const hint =
    mode === 'select' ? (
      <PlantPrompt />
    ) : mode === 'move' ? (
      <aside className="scene-hint" data-testid="status-scene-hint" data-mode={mode}>
        <p className="scene-hint-body">{coarse ? TOUCH_MOVE_HINT : MOVE_HINT}</p>
      </aside>
    ) : (
      // never takes the pointer, for the reason `.scene-tooltip` never does: the ground under it
      // is where the next corner goes
      <aside className="scene-hint" data-testid="status-scene-hint" data-mode={mode}>
        <p className="scene-hint-body">{(coarse ? TOUCH_DRAW_HINT : DRAW_HINT)[mode]}</p>
        <p
          className="scene-hint-count"
          data-testid="readout-scene-hint-corners"
          data-corners={draftLength}
        >
          {cornersSoFar(draftLength)}
        </p>
        {/* the two gestures as presses, on the surface the drawing happens on: a keyboard and a
            double-click are not things a finger has, and the sidebar's own Close polygon press
            sits inside a fold on another surface of a phone */}
        <div className="row scene-hint-actions">
          <Action
            testId="action-scene-close-shape"
            tone="primary"
            disabled={draftLength < 3}
            onClick={commitDraft}
          >
            Close the shape
          </Action>
          <Action testId="action-scene-start-over" onClick={cancelDraft}>
            Start over
          </Action>
        </div>
      </aside>
    )

  if (seasonEvent === null) return hint

  return (
    <>
      <p className="scene-hint" data-testid="status-season-event">
        {seasonEvent}
      </p>
      {hint}
    </>
  )
}
