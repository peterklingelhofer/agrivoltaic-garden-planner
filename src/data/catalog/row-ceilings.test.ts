import { describe, expect, it } from 'bun:test'
import { citedReason } from '../../types/cited'
import { cropLightTable } from '../crop-light-table'
import { CROP_ROWS } from './rows'
import { DLI_CLASSES, expandRow } from './schema'

const table = cropLightTable(CROP_ROWS)

const printed = (id: string) => {
  const row = table.rows.find((one) => one.id === id)
  if (row === undefined) throw new Error(`${id} is not on the table`)
  return row
}

describe('a shade ceiling a row sets for itself', () => {
  it('never carries the note its class wrote for the class figure', () => {
    const wrong = CROP_ROWS.map(expandRow).filter((crop) => {
      const spec = DLI_CLASSES[crop.dliClass]
      const ceiling = crop.light.maxDesignRsr
      return ceiling.value !== spec.maxDesignRsr && citedReason(ceiling) === spec.maxDesignRsrNote
    })
    expect(wrong.map((crop) => crop.id)).toEqual([])
  })

  it("reads as the row's own, and a row at its class's figure reads as the class's", () => {
    expect(printed('apple')).toMatchObject({ ceiling: 0.1, ceilingBasis: 'row' })
    expect(printed('hazelnut')).toMatchObject({
      ceiling: DLI_CLASSES['cane-bush-berries'].maxDesignRsr,
      ceilingBasis: 'own',
    })
    expect(printed('olive').ceiling).toBe(0.1)
  })
})
