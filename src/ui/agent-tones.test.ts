import { describe, expect, it } from 'bun:test'
import { PV_CHAIN_PROVENANCE, stageOf } from '../sim/pv/provenance'
import { energyReportFixture } from '../state/testkit'
import { TONES } from '../agent/transcript'
import { wordsFor } from './agent-words'

/**
 * What is a caveat, what is provenance, and the rule that nothing is lost by telling them apart.
 *
 * The energy answer carries the whole PV model chain. Rendered as caveats it said, seven times
 * over and under a warning rule, that the figure was more doubtful than it is: one entry is about
 * a cell-temperature model that was NOT used, and reading "available but not the default" beneath
 * "What that answer does not cover" is a claim about the answer that nobody made.
 *
 * The split is a heading and a colour and nothing else. Every word the report carries still
 * reaches the screen, which is what these tests hold
 */
describe('the model chain in an answer', () => {
  const report = energyReportFixture()
  const lines = wordsFor({ kind: 'energy', report }, [])

  it('is provenance rather than caveat, so it is not drawn as a warning', () => {
    const tones = new Set(lines.map((line) => line.tone))
    expect(tones.has('provenance')).toBe(true)
    expect(tones.has('caveat')).toBe(false)
  })

  /**
   * The caveat is what qualifies the figure, so every word of every one has to be here. The
   * equation beside it is detail, which is the one thing this app's doctrine allows to be left
   * out, and `EnergyPanel` still prints it in full for anybody who went looking
   */
  it('keeps every caveat word for word, and leaves the equations to the panel', () => {
    const shown = lines.map((line) => line.text).join('\n')
    for (const entry of report.provenance) {
      if (entry.caveat === null) continue
      expect(shown, entry.value).toContain(stageOf(entry))
      expect(shown, entry.caveat).toContain(entry.caveat)
    }
    expect(report.provenance).toBe(PV_CHAIN_PROVENANCE)
    // and no equation reached the bubble: every one of these is written after a colon
    expect(shown).not.toContain('T_cell =')
    expect(shown).not.toContain('Pdc =')
  })

  /**
   * A stage with no caveat makes no qualification: all it had to say was its equation, and the
   * stage name alone is a heading with nothing under it. It stays in the panel and not here
   */
  it('leaves out a stage that qualifies nothing', () => {
    const silent = report.provenance.filter((entry) => entry.caveat === null)
    expect(silent.length).toBeGreaterThan(0)
    const shown = lines.map((line) => line.text)
    for (const entry of silent) {
      expect(shown, entry.value).not.toContain(stageOf(entry))
    }
  })

  /**
   * The step and its note together, which is what `EnergyPanel` shows. Kept alone, the note
   * "Available but not the default, because a, b and dT are empirical per module construction"
   * stands with no subject at all: a sentence about the Sandia model that never names it
   */
  it('keeps each note under the step it belongs to', () => {
    const withCaveat = report.provenance.filter((entry) => entry.caveat !== null)
    expect(withCaveat.length).toBeGreaterThan(1)
    for (const entry of withCaveat) {
      const line = lines.find((candidate) => candidate.text.startsWith(`${stageOf(entry)}. `))
      expect(line?.text, entry.value).toContain(entry.caveat ?? '')
    }
  })

  it('is one of the tones the transcript knows how to restore', () => {
    for (const line of lines) expect(TONES).toContain(line.tone)
  })
})
