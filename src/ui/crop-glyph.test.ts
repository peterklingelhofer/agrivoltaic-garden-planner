import { describe, expect, it } from 'bun:test'
import { DLI_CLASSES } from '../data/catalog/schema'
import type { DliClass } from '../types/crop'
import { DLI_CLASS_LABEL } from './cold-open'
import { CROP_GLYPH } from './crop-glyph'

/**
 * The mapping has to be total, and "total" here means against the catalog's own list of
 * classes. `DLI_CLASSES` is what the crop schema validates every
 * crop against, so a class added there and missing here would ship crops with no picture, and the
 * type alone wouldn't catch it if the record were ever widened
 */
describe('every crop has a picture', () => {
  const classes = Object.keys(DLI_CLASSES) as DliClass[]

  it('draws every class the catalog can give a crop', () => {
    expect(classes.length).toBeGreaterThan(0)
    for (const dliClass of classes) {
      expect(CROP_GLYPH[dliClass], dliClass).toBeDefined()
      expect(CROP_GLYPH[dliClass].length, dliClass).toBeGreaterThan(0)
    }
    // and nothing here draws a class that no crop can have
    expect(Object.keys(CROP_GLYPH).sort()).toEqual([...classes].sort())
  })

  /**
   * The glyph isn't a label: the crop's name is beside it and `DLI_CLASS_LABEL` is what says the
   * class in words. Holding the two key sets together is what stops a picture drifting away from
   * the sentence that explains it
   */
  it('draws exactly the classes the app names in words', () => {
    expect(Object.keys(CROP_GLYPH).sort()).toEqual(Object.keys(DLI_CLASS_LABEL).sort())
  })

  it('draws shapes a renderer can take, at a size that fits the box', () => {
    for (const [dliClass, shapes] of Object.entries(CROP_GLYPH)) {
      for (const shape of shapes) {
        if (shape.kind === 'path') {
          expect(shape.d.startsWith('M'), `${dliClass} path starts somewhere`).toBe(true)
          // every coordinate inside the 16 by 16 box, allowing for the stroke's own width
          for (const number of shape.d.match(/\d+(\.\d+)?/g) ?? []) {
            expect(Number(number), `${dliClass} coordinate ${number}`).toBeLessThanOrEqual(16)
          }
        } else {
          expect(shape.r, dliClass).toBeGreaterThan(0)
          expect(shape.cx - shape.r, dliClass).toBeGreaterThanOrEqual(0)
          expect(shape.cx + shape.r, dliClass).toBeLessThanOrEqual(16)
          expect(shape.cy - shape.r, dliClass).toBeGreaterThanOrEqual(0)
          expect(shape.cy + shape.r, dliClass).toBeLessThanOrEqual(16)
        }
      }
    }
  })

  /**
   * Two to four shapes. These are read at 16px, where extra lines turn to mush, and the whole
   * argument for a drawing over a photograph is that it survives being small. The wheat ear is the
   * one that earns six, being a stalk and its grains
   */
  it("keeps each glyph to a handful of shapes, because they're read at 16px", () => {
    for (const [dliClass, shapes] of Object.entries(CROP_GLYPH)) {
      expect(shapes.length, dliClass).toBeLessThanOrEqual(6)
    }
  })
})
