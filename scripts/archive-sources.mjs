/**
 * Pins every URL source in the citation ledger to a Wayback Machine capture, so a bulletin that
 * is revised or removed can still be read as it was when it was quoted.
 *
 * An entry is archivable when it has a URL, the URL isn't already on web.archive.org and
 * `custom.archived` is unset (`isArchivable` in src/data/archive.ts). Each one goes through two
 * steps:
 *
 *   1. Look up the captures the Archive already holds, with the CDX API (status 200 only). The
 *      capture nearest the day the source was read wins, which is `accessed` in the ledger. One on
 *      or after that day is preferred, none may sit more than MAX_SNAPSHOT_DISTANCE_DAYS from it,
 *      and with no `accessed` date the newest capture is taken (`closestSnapshot`). An answer that
 *      isn't JSON counts as no captures, and the log line says so
 *   2. With no capture, ask Save Page Now for one: GET web.archive.org/save/<url>, redirects
 *      followed, with the capture time read from the response (`timestampFromSaveResponse`). A
 *      fresh capture shows the page as it is today, which for a source read long ago can be a later
 *      edition than the one quoted. The log line prints the read date beside the capture time so
 *      those can be checked. `--lookup-only` skips this step
 *
 * The link is recorded as `custom.archived`, the full `https://web.archive.org/web/<timestamp>/<url>`
 * form, and `scripts/render-citations-md.mjs` prints it under the entry.
 *
 * Pace: at most two lookups a second and one capture every five seconds, counted from the start of
 * one request to the start of the next. A 429, a 5xx or a network error waits 60 seconds and tries
 * once more, and then the entry is skipped and reported. A failed lookup never leads to a capture,
 * because the Archive might already hold the right one.
 *
 * The ledger is saved as it is formatted: parsed, changed, and written back with
 * `JSON.stringify(data, null, 2)` and a trailing newline. Nothing is written unless the unmodified
 * file reads back byte for byte the same. Every save reads the file afresh and adds only the new
 * links, so edits made to the ledger during a long run survive. It saves after every ten entries
 * and on Ctrl-C, so an interrupted run keeps its progress, and a second run carries on from there.
 *
 *   bun scripts/archive-sources.mjs                  every archivable entry
 *   bun scripts/archive-sources.mjs <citekey> ...    only these entries
 *   bun scripts/archive-sources.mjs --dry-run        list the entries it would look up, no network
 *   bun scripts/archive-sources.mjs --lookup-only    record existing captures, request no new ones
 *
 * It runs under bun because it imports the TypeScript helpers. After a run that wrote links, run
 * `bun run generate` to render them into docs/CITATIONS.md
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  archiveLinkFor,
  closestSnapshot,
  isArchivable,
  snapshotDate,
  timestampFromSaveResponse,
} from '../src/data/archive.ts'

const LEDGER = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'CITATIONS.csl.json')
const USER_AGENT =
  'agrivoltaic-garden-planner (https://github.com/peterklingelhofer/agrivoltaic-garden-planner)'
const CDX = 'https://web.archive.org/cdx/search/cdx'
const CDX_FIELDS = 'urlkey,timestamp,original,mimetype,statuscode,digest,length'
const SAVE = 'https://web.archive.org/save/'

const LOOKUP_GAP_MS = 500
const CAPTURE_GAP_MS = 5_000
const RETRY_WAIT_MS = 60_000
const LOOKUP_TIMEOUT_MS = 60_000
// Save Page Now answers only once the capture is done, and a large PDF takes a while
const CAPTURE_TIMEOUT_MS = 180_000
const SAVE_EVERY = 10
const NOT_JSON_SHOWN_CHARS = 60
const OPTIONS = ['--dry-run', '--lookup-only']

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const lookupOnly = args.includes('--lookup-only')
const unknownOptions = args.filter((arg) => arg.startsWith('--') && !OPTIONS.includes(arg))
const citekeys = args.filter((arg) => !arg.startsWith('--'))

const stats = { looked: 0, found: 0, captured: 0, written: 0, saveFailed: false }
// reason -> citekeys, so the summary can say why each skipped entry was skipped
const skipped = new Map()
// citekey -> link, recorded in memory and not yet saved
const pending = new Map()

const format = (data) => `${JSON.stringify(data, null, 2)}\n`

const readLedger = () => {
  const text = readFileSync(LEDGER, 'utf8')
  const data = JSON.parse(text)
  if (format(data) !== text) {
    throw new Error(
      "docs/CITATIONS.csl.json doesn't read back byte for byte after JSON.stringify(data, null, 2), so a save would reformat it. Nothing was written",
    )
  }
  return data
}

const save = () => {
  if (pending.size === 0) return
  const data = readLedger()
  let written = 0
  for (const [id, link] of pending) {
    const entry = data.find((candidate) => candidate.id === id)
    if (entry === undefined) {
      console.log(`  ${id} is no longer in the ledger, so its link was dropped`)
    } else if (entry.custom?.archived) {
      console.log(`  ${id} gained an archived link meanwhile, so it was left as it is`)
    } else {
      entry.custom ??= {}
      entry.custom.archived = link
      written += 1
    }
  }
  writeFileSync(LEDGER, format(data))
  pending.clear()
  stats.written += written
  console.log(`saved to docs/CITATIONS.csl.json: ${String(written)} links`)
}

// a save that throws leaves the links in `pending`, so they are printed for a manual copy
const trySave = () => {
  try {
    save()
    return true
  } catch (error) {
    console.error(`could not save: ${error instanceof Error ? error.message : String(error)}`)
    for (const [id, link] of pending) console.error(`  unsaved: ${id} ${link}`)
    process.exitCode = 1
    stats.saveFailed = true
    return false
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Holds each caller until `gapMs` has passed since the previous caller started */
const pacer = (gapMs) => {
  let next = 0
  return async () => {
    const wait = next - Date.now()
    if (wait > 0) await sleep(wait)
    next = Date.now() + gapMs
  }
}
const waitForLookup = pacer(LOOKUP_GAP_MS)
const waitForCapture = pacer(CAPTURE_GAP_MS)

const describeError = (error) =>
  error?.name === 'TimeoutError' ? 'timed out' : String(error?.message ?? error)

/**
 * One GET, tried a second time after a minute when it ends in a 429, a 5xx or a thrown error.
 * Answers `{ response }` for any other status, a 4xx included, which the caller reads, and
 * `{ failure }` with a reason when both tries ended that way
 */
const send = async (url, { wait, timeoutMs, tag }) => {
  let failure = ''
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await wait()
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.status !== 429 && response.status < 500) return { response }
      await response.body?.cancel()
      failure = `HTTP ${String(response.status)}`
    } catch (error) {
      failure = describeError(error)
    }
    if (attempt === 1) {
      console.log(`${tag}: ${failure}, waiting ${String(RETRY_WAIT_MS / 1000)} s before one retry`)
      await sleep(RETRY_WAIT_MS)
    }
  }
  return { failure: `${failure} after a retry` }
}

/** The CDX rows for a URL: `{ rows }` (with a `note` when the answer wasn't JSON), or `{ failure }` */
const lookUp = async (url, tag) => {
  const query = `${CDX}?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&fl=${CDX_FIELDS}`
  const { response, failure } = await send(query, {
    wait: waitForLookup,
    timeoutMs: LOOKUP_TIMEOUT_MS,
    tag,
  })
  if (failure !== undefined) return { failure: `lookup failed, ${failure}` }
  if (!response.ok) {
    await response.body?.cancel()
    return { failure: `lookup answered HTTP ${String(response.status)}` }
  }
  let text
  try {
    text = await response.text()
  } catch (error) {
    return { failure: `lookup failed, ${describeError(error)}` }
  }
  let rows = null
  try {
    rows = JSON.parse(text)
  } catch {
    // not JSON: read as no captures below
  }
  if (Array.isArray(rows) && rows.every(Array.isArray)) return { rows }
  const note =
    text.trim() === ''
      ? 'the lookup answered with nothing'
      : `the lookup answered something other than JSON rows: ${text.trim().slice(0, NOT_JSON_SHOWN_CHARS)}`
  return { rows: [], note }
}

/** Asks Save Page Now for a capture: `{ timestamp }`, or `{ failure }` */
const capture = async (url, tag) => {
  const { response, failure } = await send(`${SAVE}${url}`, {
    wait: waitForCapture,
    timeoutMs: CAPTURE_TIMEOUT_MS,
    tag,
  })
  if (failure !== undefined) return { failure: `capture failed, ${failure}` }
  // the replayed page can be a large PDF, and only where the response ended up matters
  await response.body?.cancel()
  if (!response.ok) return { failure: `capture answered HTTP ${String(response.status)}` }
  const timestamp = timestampFromSaveResponse(
    {
      location: response.headers.get('location') ?? undefined,
      contentLocation: response.headers.get('content-location') ?? undefined,
    },
    response.url,
  )
  if (timestamp === null) return { failure: 'capture answered with no timestamp to read' }
  return { timestamp }
}

const skip = (tag, id, reason) => {
  skipped.set(reason, [...(skipped.get(reason) ?? []), id])
  console.log(`${tag}: skipped, ${reason}`)
}

const summarize = () => {
  const skippedCount = [...skipped.values()].reduce((total, ids) => total + ids.length, 0)
  console.log('')
  console.log(`looked up: ${String(stats.looked)}`)
  console.log(`found existing: ${String(stats.found)}`)
  console.log(`captured: ${String(stats.captured)}`)
  console.log(`skipped: ${String(skippedCount)}`)
  for (const [reason, ids] of skipped)
    console.log(`  ${reason} (${String(ids.length)}): ${ids.join(', ')}`)
  console.log(`links written to the ledger: ${String(stats.written)}`)
}

const finish = () => {
  if (!stats.saveFailed) trySave()
  summarize()
  console.log(
    stats.saveFailed
      ? 'The links listed as unsaved were not written, so there is nothing to render yet'
      : 'Run `bun run generate` to render the links into docs/CITATIONS.md',
  )
}

const main = async () => {
  if (unknownOptions.length > 0) {
    console.error(`unknown option: ${unknownOptions.join(', ')}`)
    console.error(
      'usage: bun scripts/archive-sources.mjs [--dry-run] [--lookup-only] [citekey ...]',
    )
    process.exitCode = 1
    return
  }

  let ledger
  try {
    ledger = readLedger()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }
  const unknownKeys = citekeys.filter((id) => !ledger.some((entry) => entry.id === id))
  if (unknownKeys.length > 0) {
    console.error(`unknown citekey: ${unknownKeys.join(', ')}`)
    process.exitCode = 1
    return
  }

  const chosen =
    citekeys.length > 0 ? ledger.filter((entry) => citekeys.includes(entry.id)) : ledger
  const todo = chosen.filter(isArchivable)
  const counts = `entries to look up: ${String(todo.length)}, left out: ${String(chosen.length - todo.length)} (no URL, a web.archive.org URL, or already archived)`

  if (dryRun) {
    console.log('dry run: no network, and nothing is written')
    for (const entry of todo) {
      console.log(`${entry.id}  read ${snapshotDate(entry.accessed) ?? 'unknown'}  ${entry.URL}`)
    }
    console.log(counts)
    return
  }

  console.log(counts)
  const named = citekeys.filter((id) => !todo.some((entry) => entry.id === id))
  if (named.length > 0) console.log(`named but left out: ${named.join(', ')}`)
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`\n${signal}, saving what is done`)
      finish()
      process.exit(130)
    })
  }

  for (const [index, entry] of todo.entries()) {
    const tag = `[${String(index + 1)}/${String(todo.length)}] ${entry.id}`
    const read = snapshotDate(entry.accessed)
    const readText = `read ${read ?? 'unknown'}`

    const found = await lookUp(entry.URL, tag)
    stats.looked += 1
    if (found.failure !== undefined) {
      skip(tag, entry.id, found.failure)
    } else {
      const existing = closestSnapshot(found.rows, read)
      if (existing !== null) {
        pending.set(entry.id, archiveLinkFor(existing.timestamp, existing.url))
        stats.found += 1
        console.log(`${tag}: found ${existing.timestamp} (${readText})`)
      } else if (lookupOnly) {
        skip(tag, entry.id, 'no usable capture, and --lookup-only is set')
      } else {
        const why = found.note ?? `${String(found.rows.length)} rows returned`
        console.log(`${tag}: no usable capture (${why}), requesting one`)
        const made = await capture(entry.URL, tag)
        if (made.failure !== undefined) {
          skip(tag, entry.id, made.failure)
        } else {
          pending.set(entry.id, archiveLinkFor(made.timestamp, entry.URL))
          stats.captured += 1
          console.log(`${tag}: captured ${made.timestamp} (${readText})`)
        }
      }
    }

    if ((index + 1) % SAVE_EVERY === 0 && !trySave()) break
  }
  finish()
}

await main()
