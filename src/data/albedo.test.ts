import { describe, expect, it } from 'bun:test'
import { GROUND_COVER_ALBEDO } from '../types/ground'
import { GROUND_COVER_OPTIONS } from './albedo'

/**
 * The numbers live in `src/types/ground.ts` because `src/sim` may not import `src/data`, and the
 * citations live here because a citation is not something the simulation needs. Two files, one
 * set of figures: these are what stops the second file from quietly growing its own copy
 */
describe('the cited table and the numbers the simulation reads', () => {
  it('are the same numbers, because the citations quote the values rather than restate them', () => {
    for (const option of GROUND_COVER_OPTIONS) {
      expect(option.albedo.value, option.id).toBe(GROUND_COVER_ALBEDO[option.id])
    }
  })

  it('says where every one of them came from, with no silent gaps', () => {
    for (const option of GROUND_COVER_OPTIONS) {
      expect(option.albedo.citations.length, option.id).toBeGreaterThan(0)
      expect(option.label.length, option.id).toBeGreaterThan(0)
      expect(option.help.length, option.id).toBeGreaterThan(0)
    }
  })
})
