export type Attempt<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string }

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const attempt = <T>(run: () => T): Attempt<T> => {
  try {
    return { ok: true, value: run() }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

export const attemptAsync = async <T>(run: () => Promise<T>): Promise<Attempt<T>> => {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, message: messageOf(error) }
  }
}

export const attemptOr = <T>(run: () => T, fallback: () => T): T => {
  const result = attempt(run)
  return result.ok ? result.value : fallback()
}

export const UNAVAILABLE = 'simulation unavailable'

export const unavailableMessage = (subsystem: string, message: string): string =>
  `${subsystem} unavailable: ${message}`
