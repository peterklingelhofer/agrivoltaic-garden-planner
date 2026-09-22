import { describe, expect, it } from 'bun:test'
import { CITATION_IDS } from '../types/citation-ids.generated'
import { decodeTranscript, encodeTranscript } from '../agent/transcript'
import { energyReportFixture } from '../state/testkit'
import { wordsFor, type Line } from './agent-words'

/**
 * The agent cites what it says, and doesn't cite what it can't.
 *
 * This app carries a `Cited<T>` for every figure it prints and a Sources panel holding two hundred
 * and forty-one works, and an agent that reproduces the CAVEAT off each of those records while
 * dropping the citation sitting beside it hands the reader the hedge without the source. The
 * companions reply is the sharpest case: without its citations it says "only the scored rules,
 * which are the ones with a study behind them" and then names no study.
 *
 * The second half of this file is the more important half. A marker where there's no work is a
 * lie of exactly the kind the rest of this app is built to avoid, and the agenda is where the
 * temptation lives: its dates come from Extension guidance the verified corpus doesn't hold, its
 * own caveat says so, and it must stay bare
 */
const KNOWN = new Set<string>(CITATION_IDS)

const cited = (lines: readonly Line[]): readonly string[] =>
  lines.flatMap((line) => [...(line.citations ?? [])])

describe('what the agent cites', () => {
  const report = energyReportFixture()

  it('names the works behind every model stage it reports', () => {
    const lines = wordsFor({ kind: 'energy', report }, [])
    const shown = new Set(cited(lines))
    for (const entry of report.provenance) {
      if (entry.caveat === null) continue
      for (const id of entry.citations) expect(shown, `${entry.value} cites ${id}`).toContain(id)
    }
    expect(shown.size).toBeGreaterThan(3)
  })

  it('keeps each work on the line it belongs to, not pooled at the end', () => {
    const lines = wordsFor({ kind: 'energy', report }, [])
    const faiman = lines.find((line) => line.text.startsWith('Cell temperature, Faiman'))
    expect(faiman?.citations).toContain('faiman2008-module-temperature')
    // and absent from a stage it has nothing to do with
    const albedo = lines.find((line) => line.text.startsWith('Ground albedo'))
    expect(albedo?.citations).not.toContain('faiman2008-module-temperature')
  })

  it('emits only ids the corpus actually holds', () => {
    for (const id of cited(wordsFor({ kind: 'energy', report }, []))) {
      expect(KNOWN, id).toContain(id)
    }
  })

  /**
   * The asymmetry that makes the markers worth having. The agenda's frost anchors and
   * days-to-maturity are curated from land-grant Extension guidance that isn't in the Sources
   * list. The reply says exactly that, with no citation attached anywhere
   */
  it('cites nothing on the agenda, whose own caveat says there is nothing to cite', () => {
    const lines = wordsFor(
      {
        kind: 'agenda',
        items: [],
        notes: [
          "That guidance isn't in the Sources list, so those three have no citation of their own",
        ],
        about: 'everything',
      },
      [],
    )
    expect(cited(lines)).toEqual([])
    expect(lines.map((line) => line.text).join(' ')).toContain('no citation of their own')
  })

  it('cites nothing on a reply that is a fact about the garden rather than a claim', () => {
    for (const utterance of [
      { kind: 'noted', step: 'growing' },
      { kind: 'planted', cropIds: [] },
      { kind: 'undone' },
      { kind: 'greeting', sort: 'hello' },
    ] as const) {
      expect(cited(wordsFor(utterance, [])), utterance.kind).toEqual([])
    }
  })
})

describe('a cited line across a reload', () => {
  it('survives, because a transcript that loses its sources is worse than none', () => {
    const turns = [
      {
        from: 'us' as const,
        lines: [
          {
            text: 'a claim',
            tone: 'provenance' as const,
            citations: ['faiman2008-module-temperature' as const],
          },
        ],
        offer: [],
      },
    ]
    expect(decodeTranscript(encodeTranscript(turns))).toEqual(turns)
  })

  /** Whatever is on the other side of `localStorage` is a string somebody could have written */
  it("is discarded whole when it names a work the corpus doesn't hold", () => {
    const forged = JSON.stringify([
      {
        from: 'us',
        lines: [{ text: 'a claim', tone: 'say', citations: ['not-a-real-work'] }],
        offer: [],
      },
    ])
    expect(decodeTranscript(forged)).toEqual([])
  })
})
