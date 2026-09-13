import { describe, expect, it } from 'bun:test'
import { decodeTranscript, encodeTranscript, KEEP_TURNS, type StoredTurn } from './transcript'

const turn = (text: string, from: StoredTurn['from'] = 'us'): StoredTurn => ({
  from,
  lines: [{ text, tone: 'say' }],
  offer: [],
})

describe('keeping the conversation across a reload', () => {
  it('carries a transcript out and back unchanged', () => {
    const turns = [turn('hello', 'them'), turn('Where is the space?')]
    expect(decodeTranscript(encodeTranscript(turns))).toEqual(turns)
  })

  it('keeps the recent end of a long conversation and drops the old', () => {
    const many = Array.from({ length: KEEP_TURNS + 10 }, (_unused, at) =>
      turn(`turn ${String(at)}`),
    )
    const back = decodeTranscript(encodeTranscript(many))
    expect(back).toHaveLength(KEEP_TURNS)
    // the last thing said is the thing a returning visitor needs
    expect(back[back.length - 1]?.lines[0]?.text).toBe(`turn ${String(KEEP_TURNS + 9)}`)
  })

  /**
   * Decoded rather than cast. What is on the other side of `localStorage` is a string somebody
   * could have written by hand, and a transcript that trusts it renders whatever it is given
   */
  it('discards anything that does not decode, rather than rendering it', () => {
    expect(decodeTranscript(null)).toEqual([])
    expect(decodeTranscript('not json at all')).toEqual([])
    expect(decodeTranscript('{"not":"an array"}')).toEqual([])
    expect(decodeTranscript('[{"from":"nobody","lines":[]}]')).toEqual([])
    expect(decodeTranscript('[{"from":"us","lines":[{"text":1,"tone":"say"}]}]')).toEqual([])
    expect(decodeTranscript('[{"from":"us","lines":[{"text":"x","tone":"shouting"}]}]')).toEqual([])
  })

  it('keeps the good turns out of a partly broken payload', () => {
    const back = decodeTranscript('[{"from":"us","lines":[{"text":"kept","tone":"say"}]},null,7]')
    expect(back).toHaveLength(1)
    expect(back[0]?.lines[0]?.text).toBe('kept')
  })

  it('remembers which turn was the opening one', () => {
    const opening: StoredTurn = { ...turn('hello'), opening: true }
    expect(decodeTranscript(encodeTranscript([opening]))[0]?.opening).toBe(true)
  })
})
