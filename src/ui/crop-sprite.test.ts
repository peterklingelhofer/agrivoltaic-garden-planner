import { describe, expect, it } from 'bun:test'
import { CROP_ROWS } from '../data/catalog/rows'
import { CROP_SPRITE, SPRITE_PALETTES } from './crop-sprite'
import { SPRITE_FORMS } from './crop-sprite-forms'

/**
 * The grids are ASCII art, which is the point of them and also the risk: a row one character
 * short is invisible in a diff and obvious on screen. Everything here is the kind of check a
 * compiler cannot make about a string
 */
const SIZE = 12
const SLOTS = new Set(['.', 'a', 'b', 'c', 'g'])

describe('the pixel forms', () => {
  it('are square, and exactly the size the renderer draws them at', () => {
    for (const [name, grid] of Object.entries(SPRITE_FORMS)) {
      expect(grid.length, `${name} row count`).toBe(SIZE)
      grid.forEach((row, index) => {
        expect(row.length, `${name} row ${String(index)}: "${row}"`).toBe(SIZE)
      })
    }
  })

  /**
   * Every character has to be a palette slot. A stray one is not a crash: the renderer skips
   * what it cannot colour, so a Cyrillic 'а' typed for a Latin 'a' would silently punch a hole in
   * the middle of a flower and nothing anywhere would say why
   */
  it('are drawn out of palette slots and nothing else', () => {
    for (const [name, grid] of Object.entries(SPRITE_FORMS)) {
      for (const row of grid) {
        for (const character of row) {
          expect(SLOTS.has(character), `${name} has "${character}" in "${row}"`).toBe(true)
        }
      }
    }
  })

  it('all draw something, rather than an empty grid', () => {
    for (const [name, grid] of Object.entries(SPRITE_FORMS)) {
      const filled = grid.join('').replace(/\./g, '').length
      expect(filled, `${name} is blank`).toBeGreaterThan(12)
    }
  })
})

describe('every crop is drawn', () => {
  const catalogue = CROP_ROWS.map((row) => String((row as unknown as string[])[0]))

  it('covers the catalogue exactly, with no entry for a crop that does not exist', () => {
    for (const id of catalogue) {
      expect(CROP_SPRITE[id], `${id} has no sprite`).toBeDefined()
    }
    for (const id of Object.keys(CROP_SPRITE)) {
      expect(catalogue, `${id} is drawn but is not a crop`).toContain(id)
    }
  })

  it('names a form and a palette that exist', () => {
    for (const [id, [form, palette]] of Object.entries(CROP_SPRITE)) {
      expect(SPRITE_FORMS[form], `${id} form ${form}`).toBeDefined()
      expect(SPRITE_PALETTES[palette], `${id} palette ${palette}`).toBeDefined()
    }
  })

  /**
   * Colour is what actually tells one crop from another at 20px, so a catalogue drawn in three
   * palettes would be the silhouettes again with extra steps. Not a target to optimise, a floor
   * to notice falling through
   */
  it('spends enough shapes and colours to be worth drawing at all', () => {
    const forms = new Set(Object.values(CROP_SPRITE).map(([form]) => form))
    const palettes = new Set(Object.values(CROP_SPRITE).map(([, palette]) => palette))
    expect(forms.size).toBeGreaterThanOrEqual(12)
    expect(palettes.size).toBeGreaterThanOrEqual(30)
  })

  it('uses every palette it defines, so a colour nobody wears is deleted rather than kept', () => {
    const worn = new Set(Object.values(CROP_SPRITE).map(([, palette]) => palette))
    for (const name of Object.keys(SPRITE_PALETTES)) {
      expect(worn.has(name as never), `${name} is defined and unused`).toBe(true)
    }
  })

  it('draws every colour as a hex a browser will take', () => {
    for (const [name, palette] of Object.entries(SPRITE_PALETTES)) {
      for (const [slot, colour] of Object.entries(palette)) {
        expect(colour, `${name}.${slot}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
