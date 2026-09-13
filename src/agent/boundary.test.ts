import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

/**
 * The second half of the enforcement, mirroring `src/sim/boundary.test.ts` for the same reason
 * that file gives: a lint rule can be silenced with a comment and a test cannot.
 *
 * What it protects is not tidiness. The router has to be provable without a DOM, without a GL
 * context and without mounting React, because the only way to know whether it understands people
 * is to run several hundred sentences through it in a unit test. The day it imports a panel, that
 * stops being possible and the accuracy corpus stops being runnable
 */
const FORBIDDEN = ['three', '@react-three/fiber', '@react-three/drei', 'react', 'react-dom']

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '')

const sources: Record<string, string> = {}
for (const path of new Glob('**/*.ts').scanSync(import.meta.dir)) {
  sources[`./${path}`] = readFileSync(`${import.meta.dir}/${path}`, 'utf8')
}

const agentSources = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'))

describe('src/agent boundary', () => {
  it('globs at least the known agent modules', () => {
    expect(agentSources.length).toBeGreaterThan(3)
  })

  it.each(agentSources)('%s imports no renderer or React package', (path, source) => {
    const offenders = importSpecifiers(source).filter((specifier) =>
      FORBIDDEN.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`)),
    )
    expect(offenders, path).toEqual([])
  })

  it.each(agentSources)('%s imports neither the scene nor the panels', (path, source) => {
    const offenders = importSpecifiers(source).filter((specifier) =>
      /(^@\/|\.\.\/)(scene|ui)(\/|$)/.test(specifier),
    )
    expect(offenders, path).toEqual([])
  })

  /**
   * `model-presence.ts` reads the filesystem to say whether the weights were fetched, which is a
   * question only a test asks and only node can answer. It sits in `src/agent` beside
   * `holdout-scoring.ts` for the same reason that one does, and carries the same rule: reachable
   * from a test and from nothing the browser loads, because `node:fs` is not there
   */
  it.each(agentSources.filter(([path]) => !path.endsWith('/model-presence.ts')))(
    '%s does not reach the node-only model-presence helper',
    (path, source) => {
      const offenders = importSpecifiers(source).filter((specifier) =>
        /(^@\/agent\/|\.\/|\.\.\/agent\/)model-presence$/.test(specifier),
      )
      expect(offenders, path).toEqual([])
    },
  )
})
