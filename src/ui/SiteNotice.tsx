import { useEffect, useState, type ReactElement } from 'react'
import type { AsyncState } from '../state/slices'
import { showingExample, useAppStore } from '../state/store'
import { Action } from './controls'
import { capitalizeSentence, siteNoticeText, waitLabel } from './site-notice'

export interface SiteNoticeProps<T> {
  readonly state: AsyncState<T>
  readonly testId: string
  /** What the notice says before anything has been asked for */
  readonly idleLabel: string
}

/**
 * What the place lookup is doing, and the press that settles it.
 *
 * A "Try again" that gives no sign of trying, and nothing new when it fails again, stops being
 * believed. The store schedules its own retry and keeps the clock time in `siteRetryAt`, so the
 * promise the message makes is one a reader can watch: the seconds tick down, the button is there
 * for anyone who will not wait, and when nothing more is scheduled it says so
 */
export const SiteNotice = <T,>({
  state,
  testId,
  idleLabel,
}: SiteNoticeProps<T>): ReactElement | null => {
  const location = useAppStore((s) => s.location)
  const locationLabel = useAppStore((s) => s.locationLabel)
  const retryAt = useAppStore((s) => s.siteRetryAt)
  const resolveSite = useAppStore((s) => s.resolveSite)
  const example = useAppStore(showingExample)
  const failed = state.status === 'error'
  // the shipped example already has its light computed, so a 429 on the lookup it runs for
  // itself is not a visitor's failed search and must never read as one
  const muted = example && failed
  const [now, setNow] = useState(() => Date.now())

  /*
    The clock, read once a second and only while there is a countdown on screen: an idle or ready
    panel re-rendering every second is a cost for nothing. The timer at zero is the read that
    matters, because this panel is usually already mounted when the lookup fails and the clock it
    took at mount is minutes old by then; the clock may not be read during a render
  */
  useEffect(() => {
    if (!failed || retryAt === null) return
    const first = setTimeout(() => {
      setNow(Date.now())
    }, 0)
    const tick = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearTimeout(first)
      clearInterval(tick)
    }
  }, [failed, retryAt])

  const text = siteNoticeText(state, idleLabel, locationLabel)
  if (text === null) return null
  const seconds = retryAt === null ? null : Math.max(0, Math.ceil((retryAt - now) / 1000))

  return (
    <div
      className={`notice notice-${muted ? 'idle' : state.status} site-notice`}
      data-testid={testId}
      data-state={state.status}
    >
      {/* the upstream sentence arrives lowercase; muted it sits after a colon and stays that
          way, plain it opens the paragraph on its own and reads wrong without a capital */}
      <p>
        {muted
          ? `Weather for ${locationLabel} hasn't loaded yet: ${text}`
          : capitalizeSentence(text)}
      </p>
      {failed ? (
        <>
          <p data-testid={`${testId}-retry-when`}>
            {seconds === null
              ? "It won't try again by itself"
              : `Trying again in ${waitLabel(seconds)}`}
          </p>
          <Action
            testId={`${testId}-retry`}
            tone="primary"
            onClick={() => void resolveSite(location, locationLabel)}
          >
            Try again now
          </Action>
        </>
      ) : null}
    </div>
  )
}
