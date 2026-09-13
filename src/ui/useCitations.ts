import { useEffect, useState } from 'react'
import { citationMarker, formatCitation, loadCitations } from '../data/citations'
import type { CitationId } from '../types/citation-ids.generated'
import type { CitationRecord } from '../types/evidence'

export type CitationRegistry = ReadonlyMap<CitationId, CitationRecord>

let shared: CitationRegistry | null = null

export const useCitations = (): CitationRegistry | null => {
  const [registry, setRegistry] = useState<CitationRegistry | null>(shared)
  useEffect(() => {
    if (registry !== null) return
    let live = true
    void loadCitations().then((loaded) => {
      shared = loaded
      if (live) setRegistry(loaded)
    })
    return () => {
      live = false
    }
  }, [registry])
  return registry
}

/** Falls back to the citekey so a reference is never rendered as blank while loading */
export const citationLabel = (registry: CitationRegistry | null, id: CitationId): string => {
  const record = registry?.get(id)
  return record === undefined ? id : formatCitation(record)
}

/** The same work as an inline marker. See `citationMarker` for why a second form is needed */
export const citationShort = (registry: CitationRegistry | null, id: CitationId): string => {
  const record = registry?.get(id)
  return record === undefined ? id : citationMarker(record)
}

/** The DOM id of a work's row in the Sources panel, so a claim anywhere can point straight at it */
export const sourceRowId = (id: CitationId): string => `source-${id}`

export interface SourceJump {
  readonly id: CitationId
  /** Two clicks on the same work are two separate jumps, and the panel has to see the second */
  readonly nonce: number
}

/**
 * Only the open sidebar step has children, so the row a reader asks for does not exist at the
 * moment they ask for it: the request is parked here and the Sources panel claims it once it has
 * rendered the row. Asking from inside the sources step, which the DLI disclosure does, remounts
 * nothing at all, so the panel is told rather than left to notice
 */
let pending: SourceJump | null = null
let jumps = 0
const listeners = new Set<(next: SourceJump) => void>()

export const requestSourceJump = (id: CitationId): void => {
  jumps += 1
  const next = { id, nonce: jumps }
  pending = next
  // the jump is handed to every listener from a local, never re-read from `pending`: the first
  // listener to take it clears the parking slot, and reading the slot again inside the same loop
  // would hand the listeners after it a jump that had just been served to somebody else
  for (const listener of listeners) listener(next)
}

/**
 * Taken rather than read: a jump is owed once. The caller keeps it in its own state afterwards,
 * so leaving the sources step and coming back later does not replay a jump already served
 */
export const useSourceJump = (): SourceJump | null => {
  const [jump, setJump] = useState<SourceJump | null>(null)
  useEffect(() => {
    const take = (next: SourceJump): void => {
      pending = null
      setJump(next)
    }
    listeners.add(take)
    if (pending !== null) take(pending)
    return () => {
      listeners.delete(take)
    }
  }, [])
  return jump
}
