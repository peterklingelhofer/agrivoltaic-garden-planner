import type { ReactElement } from 'react'
import type { Surface } from '../state/slices'
import { useAppStore } from '../state/store'

/**
 * The whole of the mobile navigation: one surface at a time, and the way between them.
 *
 * It is rendered at every width and hidden by CSS above the breakpoint, with no gate on a
 * media query in JavaScript. Two reasons, and the second is the one that matters: a JS breakpoint
 * is a second definition of "narrow" that can drift from the CSS one, and `display: none` takes
 * the whole thing out of the accessibility tree on a desktop, so nothing here is announced to a
 * reader who has no use for it.
 *
 * Two destinations, the garden and the plan: the plan is the same column as the desktop sidebar,
 * questions first, and a first visit opens on it
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
 * `App.tsx` gives: a const re-exported from another module does not fold across the boundary, and
 * the point of the flag is that a deployed build carries none of this. Appended and not inserted
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

  return (
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
  )
}
