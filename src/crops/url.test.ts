import { describe, expect, it } from 'bun:test'
import { degreesLatitude, degreesLongitude } from '../types/units'
import { FINDER_DEFAULTS, type FinderState, readFinderState, writeFinderState } from './url'

const AMHERST: FinderState = {
  place: {
    location: { latitudeDeg: degreesLatitude(42.3736), longitudeDeg: degreesLongitude(-72.5199) },
    label: 'Amherst, Massachusetts',
  },
  shadePercent: 40,
  phUnits: 5.8,
  ownPh: false,
  irrigation: 'none',
  frostPercentile: 10,
}

describe('the crop finder address', () => {
  it('reads back every field it writes', () => {
    expect(readFinderState(writeFinderState(AMHERST))).toEqual(AMHERST)
    const params = new URLSearchParams(writeFinderState(AMHERST))
    expect([...params.keys()]).toEqual([
      'lat',
      'lon',
      'label',
      'shade',
      'ph',
      'own',
      'water',
      'frost',
    ])
    expect(params.get('own')).toBe('0')
    expect(params.get('water')).toBe('none')
    expect(params.get('frost')).toBe('10')
  })

  it('writes a place to four decimals', () => {
    const search = writeFinderState({
      ...AMHERST,
      place: {
        location: {
          latitudeDeg: degreesLatitude(42.373612),
          longitudeDeg: degreesLongitude(-72.519901),
        },
        label: 'Amherst',
      },
    })
    const params = new URLSearchParams(search)
    expect(params.get('lat')).toBe('42.3736')
    expect(params.get('lon')).toBe('-72.5199')
  })

  it('opens on the defaults with nothing in the address, and leaves out a field at its default', () => {
    expect(readFinderState('')).toEqual(FINDER_DEFAULTS)
    expect(readFinderState('?')).toEqual(FINDER_DEFAULTS)
    expect(writeFinderState(FINDER_DEFAULTS)).toBe('')
    expect(writeFinderState({ ...FINDER_DEFAULTS, shadePercent: 35 })).toBe('?shade=35')
  })

  it('ignores every value it cannot read', () => {
    expect(
      readFinderState(
        '?lat=91&lon=-72.5&label=Nowhere&shade=150&ph=2&own=yes&water=bucket&frost=25',
      ),
    ).toEqual(FINDER_DEFAULTS)
    expect(readFinderState('?lat=abc&lon=12').place).toBeNull()
    expect(readFinderState('?lat=42&lon=').place).toBeNull()
    // a blank field is no value at all, never a zero
    expect(readFinderState('?shade=&ph=').shadePercent).toBe(FINDER_DEFAULTS.shadePercent)
    expect(readFinderState('?shade=&ph=').phUnits).toBe(FINDER_DEFAULTS.phUnits)
    // and one bad field leaves the good ones standing
    const mixed = readFinderState('?shade=oops&ph=7.2&water=flood')
    expect(mixed.shadePercent).toBe(FINDER_DEFAULTS.shadePercent)
    expect(mixed.phUnits).toBe(7.2)
    expect(mixed.irrigation).toBe('flood')
  })

  it('names a place by its coordinates when the link carries no label', () => {
    expect(readFinderState('?lat=42.37&lon=-72.52').place?.label).toBe('42.3700, -72.5200')
  })

  it("holds a shade or pH typed past its field's range to the range", () => {
    const params = new URLSearchParams(
      writeFinderState({ ...FINDER_DEFAULTS, shadePercent: 140, phUnits: 0 }),
    )
    expect(params.get('shade')).toBe('100')
    expect(params.get('ph')).toBe('3')
  })
})
