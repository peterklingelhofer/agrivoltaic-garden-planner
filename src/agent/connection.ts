/**
 * Whether it's fair to spend 45 MB of somebody's connection without asking them first.
 *
 * The weights and the ONNX runtime together are 45 MB. Downloading them the moment the chat surface
 * is opened is progressive enhancement on a wifi laptop. On a phone halfway up a hill it is
 * somebody's data plan, spent silently, on a feature they haven't yet decided they want. The
 * surface works without them.
 *
 * So the rule is: download it unasked only where the browser AFFIRMATIVELY says the connection is
 * fast and unmetered, and ask everywhere else. `navigator.connection` is Chromium-only, so "ask"
 * covers every iPhone, which is the right way round: not knowing is a reason to ask rather than a
 * reason to assume. Once somebody says yes it is remembered, so they're asked once and not once
 * a visit
 */

/** What `navigator.connection` offers, as much of it as this decision uses */
export interface ConnectionHint {
  readonly saveData?: boolean
  readonly effectiveType?: string
}

/** The 45 MB, stated once so the words a visitor reads and the docs can't drift apart */
export const MODEL_DOWNLOAD_MB = 45

/**
 * Only '4g'. The Network Information API reports a round-trip and bandwidth estimate bucketed
 * into four labels, and '3g' on that scale is around 400 kbps, at which 45 MB is fifteen minutes
 */
export const looksUnmetered = (hint: ConnectionHint | undefined | null): boolean =>
  hint !== undefined && hint !== null && hint.saveData !== true && hint.effectiveType === '4g'

/** The hint this browser offers, or undefined where the API doesn't exist */
export const connectionHint = (): ConnectionHint | undefined => {
  if (typeof navigator === 'undefined') return undefined
  const held = (navigator as Navigator & { connection?: ConnectionHint }).connection
  return held
}
