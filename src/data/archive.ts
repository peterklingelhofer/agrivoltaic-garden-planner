/**
 * The decisions behind `custom.archived` in `docs/CITATIONS.csl.json`, as pure functions.
 *
 * Extension bulletins get revised and removed, so a live link can stop showing the figures that
 * were quoted from it. Each URL source carries a full `https://web.archive.org/web/<timestamp>/<url>`
 * link to the Wayback Machine capture nearest the day it was read. `scripts/archive-sources.mjs`
 * makes the network calls. Every choice that needs none is made here, so a test can cover it
 */

/** One capture in the Wayback Machine: when it was taken (`YYYYMMDDhhmmss`) and the URL it holds */
export interface Snapshot {
  readonly timestamp: string
  readonly url: string
}

/** The part of a ledger entry that decides whether it still needs a capture */
export interface ArchiveEntry {
  readonly URL?: string
  readonly custom?: { readonly archived?: string }
}

/** A CSL-JSON date. The ledger writes every `accessed` date as `[[year, month, day]]` */
interface CslDate {
  readonly 'date-parts'?: readonly (readonly number[])[]
}

/**
 * How many days either side of the read date a capture may sit and still stand in for the edition
 * that was read: a year, plus a margin for a bulletin revised on a yearly cycle
 */
export const MAX_SNAPSHOT_DISTANCE_DAYS = 400

const MS_PER_DAY = 86_400_000
const YYYYMMDD = /^\d{8}$/
const TIMESTAMP = /^\d{14}$/
const ON_WAYBACK = /^https?:\/\/web\.archive\.org(?:[/:?#]|$)/i
// `/web/<14 digits>/` at the start of a path, with the host or without it, and with the replay mode
// some links add after the digits (`id_`, `if_`). Anchored so a captured page whose own path holds
// such a segment can't be mistaken for the capture
const WAYBACK_PATH = /^(?:https?:\/\/web\.archive\.org)?\/web\/(\d{14})(?:[a-z]{2}_)?\//

/** Days since 1970-01-01 for a `YYYYMMDD` string, or null when it isn't a real calendar day */
const dayNumber = (yyyymmdd: string): number | null => {
  if (!YYYYMMDD.test(yyyymmdd)) return null
  const year = Number(yyyymmdd.slice(0, 4))
  const month = Number(yyyymmdd.slice(4, 6))
  const day = Number(yyyymmdd.slice(6, 8))
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC rolls 31 February over into March, so the parts have to read back as they went in
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return real ? date.getTime() / MS_PER_DAY : null
}

const pad = (value: number, width: number): string => String(value).padStart(width, '0')

const toSnapshot = (capture: Snapshot | undefined): Snapshot | null =>
  capture === undefined ? null : { timestamp: capture.timestamp, url: capture.url }

/**
 * The link that goes in `custom.archived`. The URL follows the timestamp as written, with no
 * escaping, which is the form the Wayback Machine shows in its own address bar. A timestamp that
 * isn't 14 digits throws, because the ledger test rejects such a link and this is the one place
 * that builds them
 */
export const archiveLinkFor = (timestamp: string, url: string): string => {
  if (!TIMESTAMP.test(timestamp)) {
    throw new RangeError(`a Wayback timestamp is 14 digits, got "${timestamp}"`)
  }
  return `https://web.archive.org/web/${timestamp}/${url}`
}

/**
 * A CSL date as the `YYYYMMDD` the capture lookups compare, with a missing month or day read as
 * 01. Null when there is no year or the parts don't make a real day
 */
export const snapshotDate = (accessed: CslDate | null | undefined): string | null => {
  const [year, month = 1, day = 1] = accessed?.['date-parts']?.[0] ?? []
  if (year === undefined) return null
  const text = `${pad(year, 4)}${pad(month, 2)}${pad(day, 2)}`
  return dayNumber(text) === null ? null : text
}

/**
 * The capture that best stands in for the edition read on `accessed` (`YYYYMMDD`), from the rows
 * the CDX API returns as JSON. Each row is `[urlkey, timestamp, original, mimetype, statuscode,
 * digest, length]` and the first is a header.
 *
 * Only captures that answered 200 count. A capture on or after the read date wins over a nearer
 * one before it, and the earliest of those is taken. With none on or after, the latest before it
 * is taken. A capture more than `MAX_SNAPSHOT_DISTANCE_DAYS` from the read date either way is out,
 * and null means none qualifies. With no read date the newest capture is the best guess left, and
 * so it is for a date that can't be read.
 *
 * The result carries the URL the capture holds (`original`), which can differ from the URL asked
 * for by its scheme or a leading `www.`. A link built from it opens that exact capture
 */
export const closestSnapshot = (
  rows: readonly (readonly string[])[],
  accessed: string | null,
): Snapshot | null => {
  const captures: (Snapshot & { readonly day: number })[] = []
  for (const [, timestamp, url, , statuscode] of rows) {
    // the header row fails the timestamp test, and so does anything else that isn't a capture
    if (timestamp === undefined || url === undefined || !TIMESTAMP.test(timestamp)) continue
    const day = dayNumber(timestamp.slice(0, 8))
    if (statuscode === '200' && day !== null) captures.push({ timestamp, url, day })
  }
  captures.sort((a, b) => Number(a.timestamp) - Number(b.timestamp))

  const read = accessed === null ? null : dayNumber(accessed)
  if (read === null) return toSnapshot(captures.at(-1))
  const near = captures.filter((c) => Math.abs(c.day - read) <= MAX_SNAPSHOT_DISTANCE_DAYS)
  return toSnapshot(near.find((c) => c.day >= read) ?? near.at(-1))
}

/**
 * The capture time Save Page Now reports, read from the first of the Location header, the
 * Content-Location header and the final URL that carries `/web/<14 digits>/`. The save request
 * follows redirects, so the final URL normally has it, and the headers cover a response that
 * stopped at a redirect
 */
export const timestampFromSaveResponse = (
  headers: { readonly location?: string; readonly contentLocation?: string },
  finalUrl: string,
): string | null => {
  for (const candidate of [headers.location, headers.contentLocation, finalUrl]) {
    const timestamp = candidate === undefined ? undefined : WAYBACK_PATH.exec(candidate)?.[1]
    if (timestamp !== undefined) return timestamp
  }
  return null
}

/**
 * Whether the ledger still needs a capture for this entry. A source with no URL has nothing to
 * capture, a URL already on web.archive.org is a capture, and a recorded `custom.archived` means
 * the work is done
 */
export const isArchivable = (entry: ArchiveEntry): boolean => {
  const url = entry.URL
  return url !== undefined && url !== '' && !ON_WAYBACK.test(url) && !entry.custom?.archived
}
