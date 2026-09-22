import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { geocode, type GeocodeHit } from '../data/geocode'
import { messageOf } from '../state/safe'
import { useAppStore } from '../state/store'

/** Nominatim policy: at most one request a second, from the identity src/data/http.ts attaches */
export const NOMINATIM_MIN_INTERVAL_MS = 1100

export const MIN_QUERY_LENGTH = 3

export interface AddressSearch {
  readonly query: string
  readonly hits: readonly GeocodeHit[]
  readonly error: string | null
  readonly searching: boolean
  readonly activeIndex: number
  setQuery(query: string): void
  setActiveIndex(index: number): void
  setError(message: string | null): void
  search(): void
  /** Closes the list and puts focus back where it came from */
  dismiss(): void
  /** Closes the list without moving focus, for a caller that is about to move it itself */
  clear(): void
}

/** The address lookup both the site panel and the guided setup run, throttle and all */
export const useAddressSearch = (inputRef: RefObject<HTMLInputElement | null>): AddressSearch => {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<readonly GeocodeHit[]>([])
  const [error, setError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const lastRequest = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // the place the garden is at, so a name shared by seven towns lists the near one first:
  // without it, a common town name lists every match nationwide in no useful order, and the
  // wrong one is an easy pick
  const near = useAppStore((s) => (s.site.status === 'ready' ? s.site.value.location : null))

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), [])

  const search = useCallback((): void => {
    // Pressing Enter on one or two letters is a natural first gesture, and returning here in
    // silence, with no hits and no error, would look like a search that legitimately found nothing.
    // Routed through the same `error` channel every other failure here uses, with no field of its
    // own for this one case
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setError('Type at least three letters to search')
      return
    }
    const wait = Math.max(0, NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastRequest.current))
    if (timer.current) clearTimeout(timer.current)
    setSearching(true)
    setError(null)
    timer.current = setTimeout(() => {
      lastRequest.current = Date.now()
      geocode(query, null, near)
        .then((results) => {
          setActiveIndex(0)
          setHits(results)
        })
        .catch((cause: unknown) => setError(messageOf(cause)))
        .finally(() => setSearching(false))
    }, wait)
  }, [query, near])

  const clear = useCallback((): void => {
    setHits([])
    setActiveIndex(0)
  }, [])

  const dismiss = useCallback((): void => {
    clear()
    inputRef.current?.focus()
  }, [clear, inputRef])

  return {
    query,
    hits,
    error,
    searching,
    activeIndex,
    setQuery,
    setActiveIndex,
    setError,
    search,
    dismiss,
    clear,
  }
}
