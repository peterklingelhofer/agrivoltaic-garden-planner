/**
 * The single definition lives in `src/sim/growing-window.ts`, so `src/sim/obstruction.ts` can call
 * it directly for a drawn deciduous tree's season without duplicating it: `src/sim` may not import
 * `src/data` (`docs/ARCHITECTURE.md`), so the dependency runs the other way. Re-exported here
 * unchanged for the recommender and the state layer (Decision Record 26)
 */
export { growingWindowFor } from '../sim/growing-window'
