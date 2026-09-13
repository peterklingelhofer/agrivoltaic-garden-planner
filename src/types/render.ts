/**
 * How much the renderer is allowed to spend. `auto` defers to the capability probe in
 * `src/scene/quality.ts`; the two explicit values are the grower overriding it
 */
export type LightingQuality = 'auto' | 'low' | 'high'

/** What `auto` resolves to */
export type QualityTier = Exclude<LightingQuality, 'auto'>
