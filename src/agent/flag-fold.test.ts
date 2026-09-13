import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'

/**
 * That the flag actually removes the feature, rather than merely hiding it.
 *
 * This exists because the obvious two ways of writing the check both produced a build that was
 * correct and shipped the agent anyway. `AGENT_ENABLED = agentEnabled(import.meta.env)` is a
 * function call and no bundler can see through one; exporting the answer as a const does not
 * propagate across the module boundary during minification. Both emitted a 23 kB `AgentPanel`
 * chunk into a build with `VITE_AGENT` unset, reachable by nothing.
 *
 * A source scan and not a build, for the same reason `sim/boundary.test.ts` is one: it runs in
 * milliseconds on every commit, and what it is guarding against is somebody tidying the raw
 * define back into a named import, which reads like an improvement and silently undoes this
 */
const ROOT = join(import.meta.dir, '..')
const RELATIVE_PATHS = ['App.tsx', 'ui/MobileTabs.tsx']
const sources: Record<string, string> = {}
for (const relativePath of RELATIVE_PATHS) {
  sources[`../${relativePath}`] = readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('the flag folds rather than hides', () => {
  it('finds both of the files the agent is gated in', () => {
    expect(Object.keys(sources).sort()).toEqual(['../App.tsx', '../ui/MobileTabs.tsx'])
  })

  it.each(Object.entries(sources))('%s gates on the raw define', (path, source) => {
    // a comment mentioning the wrapper is fine; a gate written against it is not
    const gated = source.split('\n').filter((line) => !line.trim().startsWith('*'))
    expect(gated.join('\n'), path).toContain('__AGENT_ENABLED__')
    expect(
      gated.some((line) => /\bAGENT_ENABLED\b(?!__)/.test(line.replace(/__AGENT_ENABLED__/g, ''))),
      path,
    ).toBe(false)
  })

  it.each(Object.entries(sources))('%s never imports a wrapper around it', (path, source) => {
    expect(/import\s*\{[^}]*\bAGENT_ENABLED\b[^}]*\}\s*from/.test(source), path).toBe(false)
  })
})
