import type { Licensed } from '../../types/evidence'

/**
 * Every catalogue row is curated from public-domain US land-grant Extension publications, FAO
 * ECOCROP and FAO-56. PFAF and Permapeople are CC BY-SA (viral) and no value in this catalogue is
 * derived from either.
 *
 * A leaf module with one type import and nothing at runtime, for the reason `src/agent/flag.ts`
 * and `src/sim/rust-core-flag.ts` are also leaves: `scripts/generate-catalog.mjs` reads this in
 * plain Node through type stripping, and Node cannot resolve the extensionless runtime imports
 * that `schema.ts` carries. Stating the licence twice so a generator could reach it would be a
 * second source of truth for exactly the field that must not have one.
 */
export const CATALOG_PROVENANCE: Licensed = {
  sourceId: 'curated-extension-ecocrop',
  licence: 'Public domain (US Extension, FAO-56) and FAO open data (ECOCROP)',
  attribution:
    'Curated from USDA and land-grant Extension publications, FAO ECOCROP and FAO Irrigation and Drainage Paper 56 Table 22',
  viralLicence: false,
}
