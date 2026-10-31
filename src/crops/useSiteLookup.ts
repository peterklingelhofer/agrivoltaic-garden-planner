import { useCallback, useEffect, useState } from 'react'
import { resolveSite, type SitePart } from '../data/site'
import { messageOf } from '../state/safe'
import type { AsyncState } from '../state/slices'
import type { LatLon } from '../types/geo'
import type { Site } from '../types/site'

export interface SiteRequest {
  readonly location: LatLon
  readonly label: string
  /** The country a geocoder named, which narrows the fallback clock to that country's zones */
  readonly countryCode: string | null
}

export interface SiteLookup {
  readonly state: AsyncState<Site>
  /** The parts of the lookup that have landed so far, so a notice can name the ones still out */
  readonly parts: readonly SitePart[]
  lookup(location: LatLon, label: string, countryCode: string | null): void
  /** The last place asked for, asked for again */
  retry(): void
}

/** A request and its turn, so asking for the same place twice still starts a second lookup */
interface Turn {
  readonly request: SiteRequest
  readonly turn: number
}

/**
 * The place lookup, for a page with no store. Each lookup cancels the one before it, and leaving
 * the page cancels the last, so a slow answer for an old place never overwrites a newer one.
 *
 * `initial` is a place to look up the moment the page mounts, which is what lets a link open on
 * its answer. It's read once
 */
export const useSiteLookup = (initial: SiteRequest | null): SiteLookup => {
  const [current, setCurrent] = useState<Turn | null>(() =>
    initial === null ? null : { request: initial, turn: 0 },
  )
  const [state, setState] = useState<AsyncState<Site>>(() =>
    initial === null ? { status: 'idle' } : { status: 'loading' },
  )
  const [parts, setParts] = useState<readonly SitePart[]>([])

  useEffect(() => {
    if (current === null) return
    const controller = new AbortController()
    const { location, label, countryCode } = current.request
    // every update below comes from a settled request, and an aborted one has been replaced
    void resolveSite(location, label, controller.signal, countryCode, (part) => {
      if (!controller.signal.aborted) setParts((landed) => [...landed, part])
    }).then(
      ({ site }) => {
        if (!controller.signal.aborted) setState({ status: 'ready', value: site })
      },
      (cause: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'error', message: messageOf(cause) })
      },
    )
    return () => controller.abort()
  }, [current])

  const start = useCallback((request: SiteRequest): void => {
    setState({ status: 'loading' })
    setParts([])
    setCurrent((previous) => ({ request, turn: (previous?.turn ?? 0) + 1 }))
  }, [])

  const lookup = useCallback(
    (location: LatLon, label: string, countryCode: string | null): void =>
      start({ location, label, countryCode }),
    [start],
  )

  const retry = useCallback((): void => {
    if (current !== null) start(current.request)
  }, [current, start])

  return { state, parts, lookup, retry }
}
