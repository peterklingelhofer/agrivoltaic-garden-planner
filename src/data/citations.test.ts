import { describe, expect, it } from 'bun:test'
import cslEntries from '../../docs/CITATIONS.csl.json'
import { CITATION_IDS } from '../types/citation-ids.generated'
import { PEER_REVIEWED_TYPES } from '../types/evidence'
import { loadCitations, citationsFor, formatCitation } from './citations'
import { loadCompanionRules, loadRotationConstraints } from './companions'
import { loadCropCatalog } from './crops'
import { loadTekRules } from './tek'

const ids = (cslEntries as readonly { readonly id: string }[]).map((entry) => entry.id)

describe('citation registry', () => {
  it('pins the generated citekey union to the CSL-JSON, the single source of truth', () => {
    expect([...CITATION_IDS]).toEqual([...ids].sort())
  })

  it('projects every CSL entry', async () => {
    const registry = await loadCitations()
    expect(registry.size).toBe(ids.length)
    for (const record of registry.values()) {
      expect(record.title.length).toBeGreaterThan(0)
      expect(record.group.length).toBeGreaterThan(0)
      if (record.peerReviewed) expect(PEER_REVIEWED_TYPES).toContain(record.type)
    }
  })

  it('resolves every citekey referenced by the shipped data', async () => {
    const [registry, catalog, rules, rotation, tek] = await Promise.all([
      loadCitations(),
      loadCropCatalog(),
      loadCompanionRules(),
      loadRotationConstraints(),
      loadTekRules(),
    ])
    const referenced = new Set<string>()
    for (const crop of catalog) {
      for (const cited of [
        crop.light.dliMinMolM2Day,
        crop.light.dliTargetMolM2Day,
        crop.light.dliMaxBeforeDisorderMolM2Day,
        crop.light.maxDesignRsr,
        crop.coldHardinessMinC,
      ]) {
        for (const id of cited?.citations ?? []) referenced.add(id)
      }
    }
    for (const rule of rules) {
      for (const id of rule.citations) referenced.add(id)
      if (rule.grade === 'D' || rule.grade === 'E') {
        for (const id of rule.contradictedBy) referenced.add(id)
      }
    }
    for (const entry of rotation) for (const id of entry.citations) referenced.add(id)
    for (const rule of tek) for (const id of rule.attribution.citations) referenced.add(id)

    expect(referenced.size).toBeGreaterThan(10)
    const dangling = [...referenced].filter((id) => !registry.has(id as never))
    expect(dangling).toEqual([])
  })

  it('throws rather than silently dropping an unknown citekey', async () => {
    const registry = await loadCitations()
    expect(() => citationsFor(registry, ['not-a-real-key' as never])).toThrow(/unknown citekey/)
  })

  it('formats a short reference', async () => {
    const registry = await loadCitations()
    const record = registry.get('laub2022-shade-meta')
    expect(record).toBeDefined()
    if (record) expect(formatCitation(record)).toBe('Laub, Moritz et al. 2022')
  })
})
