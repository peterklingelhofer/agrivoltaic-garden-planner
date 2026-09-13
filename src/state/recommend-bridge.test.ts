import { describe, expect, it } from 'bun:test'
import { normaliseRun } from './recommend-bridge'

const plan = {
  frostPercentile: 20,
  beds: [
    {
      bedId: 'bed-1',
      ranked: [
        { recommendation: { cropId: 'daucus-carota' }, calendar: { cropId: 'daucus-carota' } },
      ],
      calendar: { bedId: 'bed-1', entries: [{ cropId: 'daucus-carota' }] },
    },
  ],
}

describe('recommend bridge', () => {
  it('projects a garden plan onto ranking sets and calendars', () => {
    const run = normaliseRun(plan)
    expect(run?.sets.length).toBe(1)
    expect(run?.sets[0]?.bedId).toBe('bed-1')
    expect(run?.sets[0]?.ranked[0]?.cropId).toBe('daucus-carota')
    expect(run?.calendars?.length).toBe(1)
    expect(run?.calendars?.[0]?.entries.length).toBe(1)
  })

  it('reports no calendar rather than a partial one', () => {
    const run = normaliseRun({ beds: [{ bedId: 'bed-1', ranked: [] }] })
    expect(run?.sets.length).toBe(1)
    expect(run?.calendars).toBeNull()
  })

  it('rejects a shape it does not recognise', () => {
    expect(normaliseRun(null)).toBeNull()
    expect(normaliseRun([])).toBeNull()
    expect(normaliseRun({ sets: [] })).toBeNull()
  })
})
