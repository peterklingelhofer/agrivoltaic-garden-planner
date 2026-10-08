import type { CSSProperties, ReactElement } from 'react'
import { canRedo, canUndo, redo, undo, useHistory } from '../state/history'
import type { Surface } from '../state/slices'
import { useAppStore } from '../state/store'
import { REDO_KEYS, UNDO_KEYS } from './useEditKeys'

/**
 * The whole of the mobile navigation: one surface at a time, and the way between them.
 *
 * It's rendered at every width and hidden by CSS above the breakpoint, with no gate on a
 * media query in JavaScript. Two reasons, and the second is the one that matters: a JS breakpoint
 * is a second definition of "narrow" that can drift from the CSS one, and `display: none` takes
 * the whole thing out of the accessibility tree on a desktop, so nothing here is announced to a
 * reader who has no use for it.
 *
 * Two destinations, the garden and the plan: the plan is the same column as the desktop sidebar,
 * questions first, and a first visit opens on it.
 *
 * The bar also carries Undo and Redo, in a group beside the nav. On a phone it's the one strip of
 * controls on screen on both tabs, and the toolbar's pill, which only the garden shows, had no
 * room for the pair
 */

type Tab = {
  readonly surface: Surface
  readonly label: string
  readonly hint: string
}

/**
 * The agent tab is appended at the end, and only in a build that carries the agent.
 *
 * `__AGENT_ENABLED__` is the raw define used here, for the reason
 * `App.tsx` gives: a const re-exported from another module doesn't fold across the boundary, and
 * the point of the flag is that a deployed build carries none of this. Appended
 * because the other two are the order the garden itself depends on, and a new way IN belongs
 * after the ways that already exist
 */
const TABS: readonly Tab[] = [
  { surface: 'garden', label: 'Garden', hint: 'The 3D view of your plot' },
  // the test id stays `action-tab-edit`: ids never change for wording
  { surface: 'edit', label: 'Plan', hint: 'The questions and every panel that changes the design' },
  ...(__AGENT_ENABLED__
    ? ([{ surface: 'chat', label: 'Ask', hint: 'Describe your garden in your own words' }] as const)
    : []),
]

export const MobileTabs = (): ReactElement => {
  const current = useAppStore((s) => s.surface)
  const setSurface = useAppStore((s) => s.setSurface)
  const undoable = useHistory(canUndo)
  const redoable = useHistory(canRedo)

  // A plain `div` holds the two groups. It adds no landmark, so the nav stays the only one in the
  // bar, and it adds no toolbar role, which would promise arrow-key movement that these two
  // buttons don't have. Undo and Redo are actions, so they sit beside the nav and never inside
  // it: a nav lists places to go. `--tab-count` is how many cells the nav holds, since the agent's
  // tab joins it only in some builds
  return (
    <div className="bottombar" style={{ '--tab-count': String(TABS.length) } as CSSProperties}>
      <nav className="tabbar" data-testid="panel-tabbar" aria-label="What to show">
        {TABS.map((tab) => (
          <button
            key={tab.surface}
            type="button"
            className="tab"
            data-testid={`action-tab-${tab.surface}`}
            data-current={tab.surface === current ? 'true' : undefined}
            // a tab bar is a set of destinations, and `aria-current`
            // is what says which one you are on without claiming these are ARIA tabs: there are no
            // tabpanels here, the surfaces are regions of the app itself
            aria-current={tab.surface === current ? 'page' : undefined}
            title={tab.hint}
            onClick={() => setSurface(tab.surface)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      {/*
        A named section is a region landmark, so the pair sits in a landmark the way the nav beside
        it does, and a reader can jump to it from the landmark list. Without one, axe's `region`
        rule finds two buttons outside every landmark.
        The buttons carry the same keys as the toolbar pair, since a tablet with a keyboard can sit
        at 760px, and each one's text is its name. Neither takes `aria-current`: a press changes
        the design and leaves the surface where it was.

        Each one is `aria-disabled` when it has nothing to do. That keeps the focus on a button
        pressed down to its last step, which `disabled` would drop. The click is ignored in that
        state, since `redo` settles an open burst of edits before it finds nothing to redo
      */}
      <section className="bottombar-history" aria-label="Undo and redo">
        <button
          type="button"
          className="bottombar-action"
          data-testid="action-tabbar-undo"
          aria-disabled={!undoable}
          aria-keyshortcuts={UNDO_KEYS}
          onClick={undoable ? undo : undefined}
        >
          Undo
        </button>
        <button
          type="button"
          className="bottombar-action"
          data-testid="action-tabbar-redo"
          aria-disabled={!redoable}
          aria-keyshortcuts={REDO_KEYS}
          onClick={redoable ? redo : undefined}
        >
          Redo
        </button>
      </section>
    </div>
  )
}
