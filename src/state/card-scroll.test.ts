import { describe, expect, it } from 'bun:test'
import { obstructionId } from '../types/ids'
import { onCardScrollRequest, requestCardScroll, takeCardScroll } from './card-scroll'

const HOUSE = obstructionId('house-1')
const TREE = obstructionId('tree-1')

/** Every test ends with its ask taken, so none leaves one parked for the next */
describe('a request to scroll a card', () => {
  it('is used once', () => {
    requestCardScroll(HOUSE)
    expect(takeCardScroll(HOUSE)).toBe(true)
    expect(takeCardScroll(HOUSE)).toBe(false)
  })

  it('waits for the card it names, and no other takes it', () => {
    requestCardScroll(HOUSE)
    expect(takeCardScroll(TREE)).toBe(false)
    expect(takeCardScroll(HOUSE)).toBe(true)
  })

  it('is replaced by a later one', () => {
    requestCardScroll(HOUSE)
    requestCardScroll(TREE)
    expect(takeCardScroll(HOUSE)).toBe(false)
    expect(takeCardScroll(TREE)).toBe(true)
  })

  it('is announced to a listener until it stops listening', () => {
    let told = 0
    const stop = onCardScrollRequest(() => {
      told += 1
    })
    requestCardScroll(HOUSE)
    requestCardScroll(HOUSE)
    stop()
    requestCardScroll(HOUSE)
    expect(told).toBe(2)
    expect(takeCardScroll(HOUSE)).toBe(true)
  })
})
