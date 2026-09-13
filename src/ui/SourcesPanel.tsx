import { useEffect, useState, type ReactElement } from 'react'
import { provenanceLedger, type ProvenanceGap } from '../data/gaps'
import { prefersReducedMotion } from '../state/motion'
import { useAppStore } from '../state/store'
import type { CitationId } from '../types/citation-ids.generated'
import type { CitationRecord } from '../types/evidence'
import { SCOPE_HEADLINE, SCOPE_STATEMENT } from './onboarding'
import { Panel } from './Panel'
import {
  citationLabel,
  citationShort,
  requestSourceJump,
  sourceRowId,
  useCitations,
  useSourceJump,
} from './useCitations'

const href = (record: CitationRecord): string | null =>
  record.doi !== null ? `https://doi.org/${record.doi}` : record.url

/**
 * A citation printed as bare text asks the reader to memorize a string, change tab and eye-scan a
 * list of some two hundred and forty works. This is the same label as a control: it opens Sources
 * on the row it names. The visible text leads the accessible name, so the two agree
 */
export const SourceLink = ({
  id,
  /**
   * Draw the short marker instead of the full label, for a citation that runs inside a sentence.
   *
   * One control at two densities rather than two controls: the press, the jump, the highlight and
   * the accessible name are identical, and the name is the FULL label either way, so nothing a
   * screen reader hears changes with this
   */
  short = false,
}: {
  readonly id: CitationId
  readonly short?: boolean
}): ReactElement => {
  const citations = useCitations()
  const setSidebarStep = useAppStore((s) => s.setSidebarStep)
  const setSurface = useAppStore((s) => s.setSurface)
  const label = citationLabel(citations, id)
  return (
    <button
      type="button"
      className="link"
      data-testid={`action-source-jump-${id}`}
      aria-label={`${label}, show this work in Sources`}
      onClick={() => {
        requestSourceJump(id)
        setSidebarStep('sources')
        /**
         * And onto the surface Sources is ON. The agent cites its answers too, and the conversation
         * takes the editor's column: setting the step alone would scroll a panel nobody was looking
         * at and read as a press that did nothing. A no-op when this control is already on the
         * editor surface
         */
        setSurface('edit')
      }}
    >
      {short ? citationShort(citations, id) : label}
    </button>
  )
}

/** Long enough to find the row with the eye, short enough that it never reads as a stored state */
const HIGHLIGHT_MS = 2500

const Reference = ({
  record,
  arrived,
}: {
  readonly record: CitationRecord
  /** True for the moment after a claim elsewhere sent the reader to this row */
  readonly arrived: boolean
}): ReactElement => {
  const link = href(record)
  return (
    <li
      id={sourceRowId(record.id)}
      // focusable only so an arriving reader whose control was unmounted by the tab change has
      // somewhere for their focus to land, and never in the tab order
      tabIndex={-1}
      className={arrived ? 'panel-hovered' : undefined}
      data-testid={`item-source-${record.id}`}
      data-group={record.group}
      data-arrived={arrived ? 'true' : undefined}
    >
      <span className={`badge badge-access-${record.accessLevel}`}>{record.accessLevel}</span>{' '}
      {record.peerReviewed ? <span className="badge badge-grade-a">peer reviewed</span> : null}{' '}
      {record.authors.join(', ') || record.title} ({record.year ?? 'n.d.'}){' '}
      {link === null ? (
        record.title
      ) : (
        <a href={link} target="_blank" rel="noreferrer">
          {record.title}
        </a>
      )}
      {record.caveat === null ? null : (
        <em data-testid={`readout-source-caveat-${record.id}`}> {record.caveat}</em>
      )}
    </li>
  )
}

export const SourcesPanel = (): ReactElement => {
  const citations = useCitations()
  const [gaps, setGaps] = useState<readonly ProvenanceGap[] | null>(null)
  useEffect(() => {
    let live = true
    void provenanceLedger().then((loaded) => {
      if (live) setGaps(loaded)
    })
    return () => {
      live = false
    }
  }, [])

  const records = citations === null ? [] : [...citations.values()]
  const jump = useSourceJump()
  /**
   * Which jump's highlight has already burned down, rather than which row is lit. Derived state
   * one way round and stored the other: the timer is the only thing that ever writes here, so a
   * newly arrived jump lights up without an effect having to set state to say so
   */
  const [fadedNonce, setFadedNonce] = useState(0)
  const arrived =
    jump !== null && jump.nonce !== fadedNonce && citations?.has(jump.id) === true ? jump.id : null

  /**
   * The jump is asked for before this panel exists and before the corpus has loaded, so it waits
   * on the row it has to land on rather than being served once into an empty list and lost
   */
  useEffect(() => {
    if (jump === null || records.length === 0) return undefined
    const row = document.getElementById(sourceRowId(jump.id))
    if (row === null) return undefined
    // jsdom implements neither, and the sidebar's own scroll takes the same line: a browser
    // missing one is a browser that doesn't scroll, not one that throws inside an effect
    if (typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    }
    // the control that asked for this lived on another tab and the tab change unmounted it, so
    // focus is sitting on nothing. Taking it here restores it rather than steals it, and a reader
    // who asked from a control still on screen keeps the focus they already had
    if (document.activeElement === null || document.activeElement === document.body) {
      row.focus({ preventScroll: true })
    }
    const timer = window.setTimeout(() => setFadedNonce(jump.nonce), HIGHLIGHT_MS)
    return () => {
      window.clearTimeout(timer)
    }
  }, [jump, records.length])

  return (
    <Panel
      id="sources"
      title="Sources and gaps"
      subtitle="Every figure in this app traces to a work listed here. Claims with no source yet are listed as gaps."
    >
      {/* first thing on the step, before the bibliography it introduces, and shown
          unconditionally, with no `showsFigures` gate and no details element, because a
          caveat is never detail */}
      <div className="notice notice-warn" data-testid="readout-sources-scope">
        <h3>{SCOPE_HEADLINE}</h3>
        <p>{SCOPE_STATEMENT}</p>
      </div>
      <p data-testid="readout-source-count">
        {records.length} works, {records.filter((r) => r.peerReviewed).length} peer reviewed
      </p>
      {/*
        The list below names the sources, and this is where the reasoning lives, published with the
        app so the running tool has a route to it. Absolute because `scripts/render-docs.mjs` writes
        it into the build: `bun run dev` serves no `/docs`, which is the one place this link doesn't
        resolve
      */}
      <p className="panel-sub" data-testid="readout-sources-documents">
        <a href="/docs/">How this works, and where the numbers come from</a>: the modeling documents
        behind every figure, including the decision record, the verification pass over this
        project's own riskiest numbers, and the full citation corpus.
      </p>
      {/* said politely and out of the way: the highlight below is the visual half of the same
          message, and neither of them interrupts whatever the reader was doing */}
      <p className="visually-hidden" role="status" data-testid="status-source-jump">
        {arrived === null ? '' : `Showing ${citationLabel(citations, arrived)} in the list below`}
      </p>
      <ul className="list" data-testid="list-sources">
        {records.map((record) => (
          <Reference key={record.id} record={record} arrived={record.id === arrived} />
        ))}
      </ul>
      <h3>Known gaps</h3>
      {gaps === null ? (
        <p className="notice notice-loading" data-testid="status-gaps">
          Working...
        </p>
      ) : (
        <ul className="list" data-testid="list-gaps">
          {gaps.map((gap) => (
            <li key={`${gap.area}:${gap.subject}:${gap.field}`} data-testid="item-gap">
              <strong>{gap.subject}</strong> {gap.field}: {gap.reason}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
