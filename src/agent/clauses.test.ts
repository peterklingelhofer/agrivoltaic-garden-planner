import { describe, expect, it } from 'bun:test'
import { clausesOf } from './clauses'

/** A stand-in for the router: whatever the test says is a request, is one */
const only =
  (...requests: readonly string[]) =>
  (part: string): boolean =>
    requests.includes(part.toLowerCase())

const never = (): boolean => false
const always = (): boolean => true

describe('splitting a sentence into what it asks for', () => {
  it('leaves an ordinary sentence whole', () => {
    expect(clausesOf('i want to grow tomatoes', { standsAlone: always })).toEqual([
      'i want to grow tomatoes',
    ])
  })

  it('splits on the joins that always mean a boundary', () => {
    expect(clausesOf('design it for me then fill the beds', { standsAlone: never })).toEqual([
      'design it for me',
      'fill the beds',
    ])
    expect(clausesOf('raise the panels and then run the numbers', { standsAlone: never })).toEqual([
      'raise the panels',
      'run the numbers',
    ])
  })

  it('splits three requests into three', () => {
    expect(clausesOf('set the place then size it then design it', { standsAlone: never })).toEqual([
      'set the place',
      'size it',
      'design it',
    ])
  })

  /**
   * The conservative half. A conjunction is far more often inside one request than between two,
   * and cutting a list destroys it: "tomatoes and courgettes" is one thing somebody wants
   */
  it('keeps a list together, because a list is one request', () => {
    expect(clausesOf('tomatoes and courgettes', { standsAlone: never })).toEqual([
      'tomatoes and courgettes',
    ])
    expect(clausesOf('a bit of both', { standsAlone: always })).toEqual(['a bit of both'])
  })

  it('splits a bare and only when both halves are requests on their own', () => {
    const said = 'take out the tomatoes and fill the beds'
    expect(clausesOf(said, { standsAlone: never })).toEqual([said])
    expect(
      clausesOf(said, { standsAlone: only('take out the tomatoes', 'fill the beds') }),
    ).toEqual(['take out the tomatoes', 'fill the beds'])
  })

  it('never leaves a one-word half, which is the signature of a list', () => {
    expect(clausesOf('salt and pepper', { standsAlone: always })).toEqual(['salt and pepper'])
  })

  it('has nothing to say about an empty sentence', () => {
    expect(clausesOf('   ', { standsAlone: always })).toEqual([])
  })
})
