import { describe, expect, it } from 'bun:test'
import { agentEnabled } from './flag'

describe('the agent feature flag', () => {
  it('is off in a deployed build that says nothing about it', () => {
    // the case that matters: a push to main must not ship the agent by default
    expect(agentEnabled({ DEV: false })).toBe(false)
    expect(agentEnabled({ DEV: false, VITE_AGENT: undefined })).toBe(false)
  })

  it('is on while developing, so nobody has to remember a variable to work on it', () => {
    expect(agentEnabled({ DEV: true })).toBe(true)
  })

  it('can be turned on in a build and off in development, both explicitly', () => {
    expect(agentEnabled({ DEV: false, VITE_AGENT: 'on' })).toBe(true)
    expect(agentEnabled({ DEV: true, VITE_AGENT: 'off' })).toBe(false)
  })

  it('treats anything it does not recognise as unset, and so fails closed in a build', () => {
    // a typo in a CI variable must not be what decides whether a feature ships
    expect(agentEnabled({ DEV: false, VITE_AGENT: 'true' })).toBe(false)
    expect(agentEnabled({ DEV: false, VITE_AGENT: 'ON' })).toBe(false)
    expect(agentEnabled({ DEV: false, VITE_AGENT: '' })).toBe(false)
    expect(agentEnabled({ DEV: true, VITE_AGENT: 'yes' })).toBe(true)
  })
})
