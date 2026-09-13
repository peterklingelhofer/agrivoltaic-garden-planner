import { describe, expect, it } from 'bun:test'
import type { Crop } from '../types/crop'
import { cropId, type CropId } from '../types/ids'
import { choicesEffectSentence } from './plants-effect'

const CATALOG = ['borage', 'calendula', 'cabbage', 'leek', 'tomato'].map((id) => ({
  id: cropId(id),
  taxonomy: { commonNames: [id] },
})) as unknown as readonly Crop[]

const ids = (...names: string[]): readonly CropId[] => names.map((name) => cropId(name))

describe('what a wildlife switch or a pick changed on the ranking', () => {
  it('says the top is unchanged when the order held too', () => {
    const said = choicesEffectSentence(
      'Flowers for bees on',
      'Bed 1',
      ids('tomato', 'cabbage'),
      ids('tomato', 'cabbage'),
      CATALOG,
    )
    expect(said).toBe('Flowers for bees on: the top 2 for Bed 1 are unchanged')
  })

  it('says the same plants moved when the set held but the order did not', () => {
    const said = choicesEffectSentence(
      'Flowers for bees on',
      'Bed 1',
      ids('tomato', 'cabbage'),
      ids('cabbage', 'tomato'),
      CATALOG,
    )
    expect(said).toBe(
      'Flowers for bees on: the top 2 for Bed 1 are the same plants, in a different order',
    )
  })

  it('names what moved in and out, and reminds the beds are untouched', () => {
    const said = choicesEffectSentence(
      'Flowers for bees on',
      'Bed 1',
      ids('cabbage', 'leek', 'tomato'),
      ids('borage', 'calendula', 'tomato'),
      CATALOG,
    )
    expect(said).toBe(
      "Flowers for bees on: borage and calendula moved into the top 3 for Bed 1; cabbage and leek moved out. The beds keep what's planted until you replant.",
    )
  })

  it('says only what moved in when nothing dropped out of the top', () => {
    const said = choicesEffectSentence(
      'Prefer borage',
      'Bed 1',
      ids('tomato', 'cabbage'),
      ids('borage', 'tomato', 'cabbage'),
      CATALOG,
    )
    expect(said).toBe(
      "Prefer borage: borage moved into the top 3 for Bed 1. The beds keep what's planted until you replant.",
    )
  })

  it('says only what moved out when nothing new entered the top', () => {
    const said = choicesEffectSentence(
      'Wild plants from around here off',
      'Bed 1',
      ids('borage', 'tomato', 'cabbage'),
      ids('tomato', 'cabbage'),
      CATALOG,
    )
    expect(said).toBe(
      "Wild plants from around here off: borage moved out. The beds keep what's planted until you replant.",
    )
  })
})
