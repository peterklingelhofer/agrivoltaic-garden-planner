import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'

const FORBIDDEN = [
  'three',
  '@react-three/fiber',
  '@react-three/drei',
  'react',
  'react-dom',
  'zustand',
]

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((match) => match[1] ?? '')

const sources: Record<string, string> = {}
for (const path of new Glob('**/*.ts').scanSync(import.meta.dir)) {
  sources[`./${path}`] = readFileSync(`${import.meta.dir}/${path}`, 'utf8')
}

const simSources = Object.entries(sources).filter(([path]) => !path.endsWith('.test.ts'))

describe('src/sim framework-free boundary', () => {
  it('globs at least the known sim modules', () => {
    expect(simSources.length).toBeGreaterThan(10)
  })

  it.each(simSources)('%s imports no three.js, React or store package', (path, source) => {
    const offenders = importSpecifiers(source).filter((specifier) =>
      FORBIDDEN.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`)),
    )
    expect(offenders, path).toEqual([])
  })

  it.each(simSources)('%s imports no upstream application layer', (path, source) => {
    const offenders = importSpecifiers(source).filter((specifier) =>
      /(^@\/|\.\.\/)(scene|ui|state|data|recommend)(\/|$)/.test(specifier),
    )
    expect(offenders, path).toEqual([])
  })
})
