import type { EpochMillis } from './units'

/**
 * The storage format, versioned independently of the app. Bump it whenever a persisted
 * shape changes and register the step that carries the old shape forward; a payload whose
 * version cannot be walked to this one is discarded whole rather than half-loaded
 */
export const SCHEMA_VERSION = 5

export interface PersistEnvelope<TDesign> {
  readonly version: number
  readonly savedAtUtcMillis: EpochMillis
  readonly design: TDesign
}

/**
 * What the last read or write did, in the grower's terms. `repaired` and `discarded` are
 * separate because one kept the design and one did not, and a notice that blurs them
 * leaves the user unsure whether their plot is still there
 */
export type StorageOutcome =
  | 'unavailable'
  | 'idle'
  | 'restored'
  | 'repaired'
  | 'discarded'
  | 'saved'
  | 'cleared'
  | 'quota-exceeded'
  | 'failed'

export interface StorageStatus {
  readonly outcome: StorageOutcome
  readonly message: string
  /** Serialised size of the payload in UTF-8 bytes, zero when nothing is stored */
  readonly bytes: number
  readonly savedAtUtcMillis: EpochMillis | null
}
