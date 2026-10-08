import { create } from 'zustand'
import { debounce, WRITE_DELAY_MS, type PersistedKey } from './persist'
import type { AppState } from './slices'

/**
 * What undo and redo move: the design the grower authored, and nothing they only looked at.
 *
 * A subset of `PERSISTED_KEYS`, each of which is the grower's to keep. Left out on purpose:
 *
 * - `location` and `locationLabel`. Putting a place back means looking it up again, which is
 *   hundreds of requests to weather services that ration them and can refuse. A lookup also writes
 *   onto the plot, stamping the soil reading on beds nobody typed over and turning a starting array
 *   to face the equator, and a restore wouldn't write that again. So a new place ends the history
 *   (see `onChange`), and an undo never crosses a town
 * - `simulation`. Seasons that were run happened, and each carries the seed it was drawn from, so
 *   a plot stepping back doesn't rewrite them
 * - `selectedBedId`, `selectedArrayId`, `sidebarStep`, `overlay`, `imageryEnabled`, `lighting`,
 *   `effects` and `lengthUnit`. Where the grower is looking, how the picture is drawn and which
 *   unit it speaks. None of them is the garden, and an undo that also moved the sidebar or the
 *   overlay would read as skipping a step
 *
 * `history.test.ts` fails for a persisted key that is in neither this list nor the left-out list it
 * keeps, so a new key has to say which side it is on
 */
export const HISTORY_KEYS = [
  'frostPercentile',
  'plot',
  'preferences',
  'compatibilityWeights',
  'maxCropsPerBed',
  'wildlife',
  'plantYear',
  'answers',
  // a tariff or a panel cost the grower typed, so a typo is theirs to take back
  'economyInputs',
] as const satisfies readonly PersistedKey[]

export type HistoryKey = (typeof HISTORY_KEYS)[number]

/** The design as undo and redo see it: one value for each key above */
export type HistorySnapshot = { readonly [K in HistoryKey]: AppState[K] }

export const snapshotHistory = (state: HistorySnapshot): HistorySnapshot =>
  Object.fromEntries(HISTORY_KEYS.map((key) => [key, state[key]])) as unknown as HistorySnapshot

/** Immer keeps untouched slices as they were, so identity per key is the test, like `sameDesign` */
export const sameHistory = (a: HistorySnapshot, b: HistorySnapshot): boolean =>
  HISTORY_KEYS.every((key) => a[key] === b[key])

/**
 * How many steps back the session keeps, the oldest going first. A step shares most of its objects
 * with its neighbors, since immer keeps untouched slices as they were, so five hundred of them
 * hold what changed between one and the next
 */
export const MAX_HISTORY_STEPS = 500

export interface HistoryState {
  /** Designs to step back to, the next undo last */
  readonly past: readonly HistorySnapshot[]
  /** Designs undone and still on offer, the next redo last */
  readonly future: readonly HistorySnapshot[]
  /** The design as it stood before the burst of edits that hasn't settled yet, or null */
  readonly open: HistorySnapshot | null
}

/**
 * The history, in a store of its own.
 *
 * It stays out of `AppState` because that is the design store: a stack of five hundred designs
 * there would be one more thing every subscriber to it could wake up for, and nothing outside
 * this file should be writing to it. It's never persisted, so a reload starts a session with
 * nothing to undo
 */
export const useHistory = create<HistoryState>()(() => ({ past: [], future: [], open: null }))

/**
 * Whether Undo has something to do. An unsettled burst counts: the edit is on screen, so the
 * button has to be live the moment the edit is made, with no 600 ms wait
 */
export const canUndo = (history: HistoryState): boolean =>
  history.past.length > 0 || history.open !== null

export const canRedo = (history: HistoryState): boolean => history.future.length > 0

/** What `trackHistory` needs from the design store, so this file never imports it back */
export interface HistoryHost {
  getState(): AppState
  subscribe(listener: (state: AppState, previous: AppState) => void): () => void
}

let host: HistoryHost | null = null

/**
 * The tracked design as the store last held it, which is what the next change is measured against.
 * Moved before a restore, so the store's echo of the design it was handed is no change at all
 */
let current: HistorySnapshot | null = null

/** Moves the finished burst onto the past, dropping the oldest step beyond the cap */
const closeBurst = (): void => {
  const { past, open } = useHistory.getState()
  if (open === null) return
  useHistory.setState({ past: [...past, open].slice(-MAX_HISTORY_STEPS), open: null })
}

/**
 * The same pause the autosave waits, so a settled step and a saved design are one moment. A drag
 * writes once, on release, and a typed number writes on every key, so both end up as one step
 */
const settle = debounce(closeBurst, WRITE_DELAY_MS)

/**
 * Two writers put the design into the store without the grower editing it: a place lookup landing
 * (it stamps the soil reading on beds nobody typed over and turns a starting array to face the
 * equator) and the example garden arriving or being cleared. Each changes `site` or `example` in
 * the very update that writes the design, which no edit of the grower's does
 */
const arrivedWithTheStore = (state: AppState, previous: AppState): boolean =>
  state.site !== previous.site || state.example !== previous.example

/**
 * Whether the design now sits at another place. The coordinates decide: a lookup of the point
 * that's already there, or the same point under another name, moves nothing
 */
const placeMoved = (state: AppState, previous: AppState): boolean =>
  state.location.latitudeDeg !== previous.location.latitudeDeg ||
  state.location.longitudeDeg !== previous.location.longitudeDeg

const onChange = (state: AppState, previous: AppState): void => {
  if (current === null) return
  // wherever a place is committed, a lookup that starts or a coordinate typed, the steps behind it
  // belong to another town, so the history starts again from the design as it now stands
  if (placeMoved(state, previous)) {
    resetHistory(state)
    return
  }
  const next = snapshotHistory(state)
  if (sameHistory(next, current)) return
  const before = current
  current = next
  // the baseline moves and nothing is recorded, so Undo never offers a lookup's own copy-in
  if (arrivedWithTheStore(state, previous)) return
  // the first change of a burst keeps the design from before it, and empties the redo list as it
  // does, so Redo goes dead the moment the edit is made
  if (useHistory.getState().open === null) useHistory.setState({ open: before, future: [] })
  settle()
}

/**
 * Starts watching the design store, once. A change to a tracked key opens a burst, and a burst
 * that sees nothing new for `WRITE_DELAY_MS` becomes one step, so a drag, a typed number and a
 * slider pulled across are one Undo each
 */
export const trackHistory = (store: HistoryHost): void => {
  host = store
  current = snapshotHistory(store.getState())
  store.subscribe(onChange)
}

/**
 * Forgets every step and takes `design` as the baseline. For the actions that start the garden
 * over, which call it with the design they are about to write so the write itself is no change
 */
export const resetHistory = (design: HistorySnapshot): void => {
  settle.cancel()
  current = snapshotHistory(design)
  useHistory.setState({ past: [], future: [], open: null })
}

const travel = (direction: 'back' | 'forward'): void => {
  if (host === null || current === null) return
  // an unsettled burst is a step like any other, so it is closed before anything is taken from it
  settle.cancel()
  closeBurst()
  const { past, future } = useHistory.getState()
  const from = direction === 'back' ? past : future
  const target = from[from.length - 1]
  if (target === undefined) return
  const rest = from.slice(0, -1)
  useHistory.setState(
    direction === 'back'
      ? { past: rest, future: [...future, current] }
      : { past: [...past, current].slice(-MAX_HISTORY_STEPS), future: rest },
  )
  current = target
  host.getState().restoreDesign(target)
}

export const undo = (): void => travel('back')

export const redo = (): void => travel('forward')
