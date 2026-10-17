/**
 * Asks the DOI registries and the open web again about every source in the citation ledger.
 *
 * `docs/CITATIONS.csl.json` records how each entry was checked (`crossref-verified`,
 * `datacite-verified`, `url-verified`), and each of those checks happened once, by hand. A DOI that
 * stopped resolving, a registry that corrected a title, a page that moved and a field edited by
 * accident would all sit under their old label. This is the second look. The Sources workflow
 * (`.github/workflows/sources.yml`) runs it weekly and never on a push, because `main` deploys on
 * push and a publisher's outage must not block a deploy.
 *
 * What it asks
 *   - Every entry with a DOI: GET https://api.crossref.org/works/<DOI>, and after a 404 GET
 *     https://api.datacite.org/dois/<DOI>. The answer is read into the fields the ledger carries
 *     (`src/data/registry.ts`) and set beside the ledger's own.
 *   - Every entry with a URL and no DOI: GET the URL, following redirects, and keep the status,
 *     the final URL and the SHA-256 of the body bytes. The body itself is not kept.
 *   Requests start at most two a second, time out after 60 s, and a network error or a 429 is
 *   tried once more after 10 s. The User-Agent names the project and, when CROSSREF_MAILTO is set,
 *   a contact address, which is what puts a Crossref request in its polite pool.
 *
 * What it reports (to stdout, and as markdown tables appended to the file given by --summary,
 * which is where the workflow points GITHUB_STEP_SUMMARY)
 *   1. DOIs whose registry record disagrees with the ledger on title or year
 *   2. DOIs and URLs that did not answer 200
 *   3. URLs whose body hash changed since the previous snapshot (report only)
 *   4. ledger entries whose title, year, container, volume, issue, page or first author changed
 *      since the previous snapshot
 * Lists 1 and 2 each split in two: the problems that are new since the previous snapshot, and the
 * ones that are Still there.
 *
 * What fails the run
 *   A job that failed on a standing 403 or a registry quirk would stay red and stop being read,
 *   so the exit status follows what changed since the previous snapshot. It is 1 when
 *   - a DOI or URL answers something other than 200 and answered 200 in the snapshot, or has no
 *     check there
 *   - a title or year disagrees with the registry and agreed in the snapshot, or has no check
 *     there (the two fields are judged apart)
 *   - a ledger entry's title, year, container, volume, issue, page or first author differs from
 *     the snapshot's `ledger` fields
 *   and 0 otherwise. A problem the snapshot already had, which is non-200 both times or the same
 *   field disagreeing both times, is listed under Still and does not fail the run. A changed
 *   page hash never does. A check made of another DOI or URL than the ledger has now counts as no
 *   check. With no snapshot every problem is new, so the first live run fails on all of them and
 *   --write records them as the baseline. Bad arguments exit 2.
 *
 * The snapshot
 *   `docs/CITATIONS.registry.json` holds what the registries said at the last --write, beside the
 *   ledger's fields at that moment. `src/data/citation-registry.test.ts` holds the ledger to it
 *   offline, so an edit to one of those fields fails CI until this script has looked at the entry
 *   again. --write replaces the file after the report and leaves the exit status alone, so a run
 *   that finds problems still records what it found. A run limited to some citekeys replaces only
 *   their checks and keeps the rest of the file.
 *
 *   bun run sources:check                    check everything and write nothing
 *   bun run sources:check --write            check everything and write the snapshot
 *   bun run sources:check --dry-run          count the requests and show the first three of each
 *                                            kind, without making any (it writes nothing either)
 *   bun run sources:check --summary FILE     also append the report to FILE
 *   bun run sources:check KEY [KEY...]       check only those entries
 *
 * Run it with bun, since it imports TypeScript
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  agreement,
  driftBetween,
  ledgerFields,
  recordFromCrossref,
  recordFromDatacite,
} from '../src/data/registry.ts'

const LEDGER_PATH = new URL('../docs/CITATIONS.csl.json', import.meta.url)
const SNAPSHOT_PATH = new URL('../docs/CITATIONS.registry.json', import.meta.url)

const REPO_URL = 'https://github.com/peterklingelhofer/agrivoltaic-garden-planner'
const USAGE =
  'usage: bun scripts/check-sources.mjs [--write] [--dry-run] [--summary FILE] [citekey ...]'

const MIN_GAP_MS = 500
const TIMEOUT_MS = 60_000
const RETRY_DELAY_MS = 10_000
// requests start MIN_GAP_MS apart however many are in flight, which lets a few slow hosts
// overlap and never queues every request behind the slowest one
const IN_FLIGHT = 4
const HASH_SHOWN = 12
const CELL_MAX = 90

// an unset repository variable reaches the workflow as an empty string
const mailto = process.env.CROSSREF_MAILTO?.trim()
const USER_AGENT = `agrivoltaic-garden-planner (${REPO_URL}${mailto ? `; mailto:${mailto}` : ''})`

const crossrefUrl = (doi) => `https://api.crossref.org/works/${encodeURIComponent(doi)}`
const dataciteUrl = (doi) => `https://api.datacite.org/dois/${encodeURIComponent(doi)}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// the earliest time the next request may start, shared by every worker
let nextStart = 0
const takeSlot = async () => {
  const at = Math.max(Date.now(), nextStart)
  nextStart = at + MIN_GAP_MS
  await sleep(at - Date.now())
}

const readJson = (response) => response.json()

// streams the body through the hash, so a large PDF is never held in memory
const hashBody = async (response) => {
  const hash = createHash('sha256')
  if (response.body) for await (const chunk of response.body) hash.update(chunk)
  return hash.digest('hex')
}

/** One attempt. Resolves to null when no answer came: a refused connection, a timeout, bad JSON */
const attempt = async (url, read) => {
  await takeSlot()
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {})
      return { status: response.status, finalUrl: response.url || null, body: null }
    }
    return { status: 200, finalUrl: response.url || null, body: await read(response) }
  } catch {
    return null
  }
}

/** A GET with one retry, after 10 s, on a network error or a 429. Resolves to the last answer */
const get = async (url, read) => {
  const first = await attempt(url, read)
  if (first !== null && first.status !== 429) return first
  await sleep(RETRY_DELAY_MS)
  return (await attempt(url, read)) ?? first
}

const now = () => new Date().toISOString()

const checkDoi = async (entry) => {
  const crossref = await get(crossrefUrl(entry.DOI), readJson)
  // only a 404 means "not here". A 503 or a dropped connection says nothing about DataCite
  const fallback = crossref?.status === 404
  const answered = fallback ? await get(dataciteUrl(entry.DOI), readJson) : crossref
  const registry = fallback ? 'datacite' : 'crossref'
  let record = null
  if (answered?.status === 200) {
    record =
      registry === 'crossref'
        ? recordFromCrossref(answered.body?.message ?? {})
        : recordFromDatacite(answered.body?.data?.attributes ?? {})
  }
  const ledger = ledgerFields(entry)
  return {
    doi: entry.DOI,
    registry: record === null ? null : registry,
    status: answered?.status ?? null,
    record,
    ledger,
    agrees: record === null ? null : agreement(ledger, record),
    checked: now(),
  }
}

const checkUrl = async (entry) => {
  const answered = await get(entry.URL, hashBody)
  return {
    url: entry.URL,
    status: answered?.status ?? null,
    finalUrl: answered?.finalUrl ?? null,
    bodySha256: answered?.body ?? null,
    checked: now(),
  }
}

/** Runs `work` over `items` with at most IN_FLIGHT calls pending */
const runPool = async (items, work) => {
  let next = 0
  const worker = async () => {
    while (next < items.length) await work(items[next++])
  }
  await Promise.all(Array.from({ length: IN_FLIGHT }, worker))
}

const readSnapshot = () => {
  if (!existsSync(SNAPSHOT_PATH)) return { format: 1, checked: null, dois: {}, urls: {} }
  const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
  if (snapshot.format !== 1) {
    throw new Error(
      `docs/CITATIONS.registry.json has format ${snapshot.format}, this reads format 1`,
    )
  }
  return snapshot
}

// every object's keys in order, so the file diffs the same however the run was ordered
const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys(value[key])]),
  )
}

const byCitekey = ([a], [b]) => a.localeCompare(b)

const display = (value) => {
  if (Array.isArray(value)) return value.join('; ') || '(none)'
  return value === null || value === undefined ? '(none)' : String(value)
}

const cell = (value) => {
  const text = display(value).replace(/\s+/g, ' ').trim()
  const clipped = text.length > CELL_MAX ? `${text.slice(0, CELL_MAX - 3)}...` : text
  // a DOI can hold angle brackets, which a markdown table would swallow as a tag
  return clipped.replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const section = (heading, columns, rows, note) => {
  const lines = [`### ${heading} (${rows.length})`, '']
  if (note) lines.push(note, '')
  if (rows.length === 0) {
    lines.push('None.')
  } else {
    lines.push(`| ${columns.join(' | ')} |`, `|${columns.map(() => ' --- |').join('')}`)
    for (const row of rows) lines.push(`| ${row.map(cell).join(' | ')} |`)
  }
  return lines.join('\n')
}

const count = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`

const describeStatus = (status) => (status === null ? 'no answer' : String(status))

/** Asks every registry and every URL, and answers { dois, urls } keyed by citekey */
const runChecks = async (doiEntries, urlEntries) => {
  const dois = {}
  const urls = {}
  const jobs = [
    ...doiEntries.map((entry) => ({ entry, results: dois, check: checkDoi })),
    ...urlEntries.map((entry) => ({ entry, results: urls, check: checkUrl })),
  ]
  let finished = 0
  await runPool(jobs, async ({ entry, results, check }) => {
    results[entry.id] = await check(entry)
    finished += 1
    const counter = `${String(finished).padStart(String(jobs.length).length)}/${jobs.length}`
    console.error(`[${counter}] ${describeStatus(results[entry.id].status)} ${entry.id}`)
  })
  return { dois, urls }
}

// the previous snapshot's check of the same DOI or URL. A check made of another one, because the
// ledger entry was edited since, is no check at all
const priorDoi = (previous, id, check) =>
  previous.dois[id]?.doi === check.doi ? previous.dois[id] : null

const priorUrl = (previous, id, check) =>
  previous.urls[id]?.url === check.url ? previous.urls[id] : null

/**
 * Sorts what the checks found into the lists the report prints. A problem is new when the previous
 * snapshot had no check of the same DOI or URL, or a clean one, and Still when the previous
 * snapshot had the same problem. Title and year are judged one at a time, and a previous check
 * that found no record to compare cannot have had a disagreement
 */
const findProblems = ({ dois, urls }, previous) => {
  const found = {
    newDisagreements: [],
    stillDisagreements: [],
    newUnanswered: [],
    stillUnanswered: [],
    hashChanges: [],
    drifted: [],
    otherDifferences: 0,
  }
  for (const [id, check] of Object.entries(dois).sort(byCitekey)) {
    const before = priorDoi(previous, id, check)
    if (check.status !== 200) {
      const standing = before !== null && before.status !== 200
      const list = standing ? found.stillUnanswered : found.newUnanswered
      list.push([id, 'DOI', check.doi, describeStatus(check.status), ''])
    }
    if (check.agrees !== null) {
      for (const field of ['title', 'year']) {
        if (check.agrees[field]) continue
        const standing = before?.agrees ? !before.agrees[field] : false
        const list = standing ? found.stillDisagreements : found.newDisagreements
        const offered = field === 'year' ? check.record.years : check.record.title
        list.push([id, check.doi, check.registry, field, check.ledger[field], offered])
      }
      const { containerTitle, volume, page, authors } = check.agrees
      if (!(containerTitle && volume && page && authors)) found.otherDifferences += 1
    }
    const earlier = previous.dois[id]
    if (earlier) {
      for (const field of driftBetween(check.ledger, earlier.ledger)) {
        found.drifted.push([id, field, earlier.ledger[field], check.ledger[field]])
      }
    }
  }
  for (const [id, check] of Object.entries(urls).sort(byCitekey)) {
    const before = priorUrl(previous, id, check)
    if (check.status !== 200) {
      const standing = before !== null && before.status !== 200
      const list = standing ? found.stillUnanswered : found.newUnanswered
      const landed = check.finalUrl && check.finalUrl !== check.url ? check.finalUrl : ''
      list.push([id, 'URL', check.url, describeStatus(check.status), landed])
    }
    // a hash only means something when both fetches answered 200
    const comparable = before?.bodySha256 && check.bodySha256
    if (comparable && before.bodySha256 !== check.bodySha256) {
      const [was, is] = [before.bodySha256, check.bodySha256].map((hash) =>
        hash.slice(0, HASH_SHOWN),
      )
      found.hashChanges.push([id, check.url, was, is])
    }
  }
  return found
}

// the problems that fail the run
const failures = (found) =>
  found.newDisagreements.length + found.newUnanswered.length + found.drifted.length

const renderReport = (found, counts) => {
  const standing = found.stillDisagreements.length + found.stillUnanswered.length
  const lines = [
    '## Sources',
    '',
    `Checked ${count(counts.dois, 'DOI')} and ${count(counts.urls, 'URL')}${counts.limit}. New since the previous snapshot: ${failures(found)}. Still the same: ${standing}.`,
    '',
    'The run fails only on what is new since the previous snapshot, and what the snapshot already had is listed under Still. With no snapshot everything is new, so the first run fails on all of it and `--write` records the baseline.',
  ]
  if (found.otherDifferences > 0) {
    lines.push(
      '',
      `Container, volume, page or first author differ from the registry on ${count(found.otherDifferences, 'DOI')}. The snapshot records which, and the run does not fail on them.`,
    )
  }
  const disagreementColumns = ['Citekey', 'DOI', 'Registry', 'Field', 'Ledger', 'Registry says']
  const unansweredColumns = ['Citekey', 'Kind', 'Requested', 'Status', 'Ended at']
  lines.push(
    '',
    section(
      'New: DOIs whose registry record disagrees with the ledger on title or year',
      disagreementColumns,
      found.newDisagreements,
      'Agreed in the previous snapshot, or had no check there. Fails the run.',
    ),
    '',
    section(
      'New: DOIs and URLs that did not answer 200',
      unansweredColumns,
      found.newUnanswered,
      'Answered 200 in the previous snapshot, or had no check there. Fails the run.',
    ),
    '',
    section(
      'Ledger entries that changed since the previous snapshot',
      ['Citekey', 'Field', 'Was', 'Now'],
      found.drifted,
      'Fails the run. The ledger holds the Now value and the snapshot holds the Was value. `bun run sources:check --write` records the Now value after checking it against the registry.',
    ),
    '',
    section(
      'URLs whose body changed since the previous snapshot',
      ['Citekey', 'URL', 'Was (SHA-256)', 'Now (SHA-256)'],
      found.hashChanges,
      'Report only. A page that prints the date or a session token changes on every fetch.',
    ),
    '',
    section(
      'Still: DOIs whose registry record disagrees with the ledger on title or year',
      disagreementColumns,
      found.stillDisagreements,
      'Disagreed in the previous snapshot too. Does not fail the run.',
    ),
    '',
    section(
      'Still: DOIs and URLs that did not answer 200',
      unansweredColumns,
      found.stillUnanswered,
      'Did not answer 200 in the previous snapshot either. Does not fail the run.',
    ),
    '',
  )
  return lines.join('\n')
}

/**
 * This run's checks laid over the earlier ones the ledger still backs. The earlier ones only
 * survive a run limited to some citekeys, since a full run redoes every check
 */
const nextSnapshot = (previous, results, byId, startedAt) => {
  const keep = (checks, still) =>
    Object.fromEntries(Object.entries(checks).filter(([id, check]) => still(byId.get(id), check)))
  return {
    format: 1,
    checked: startedAt,
    dois: { ...keep(previous.dois, (entry, check) => entry?.DOI === check.doi), ...results.dois },
    urls: {
      ...keep(previous.urls, (entry, check) => entry?.URL === check.url && !entry.DOI),
      ...results.urls,
    },
  }
}

const parseOptions = () => {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        write: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        summary: { type: 'string' },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`)
    return null
  }
}

const main = async () => {
  const parsed = parseOptions()
  if (parsed === null) return 2
  const { values: options, positionals } = parsed

  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  const byId = new Map(ledger.map((entry) => [entry.id, entry]))
  const unknown = positionals.filter((citekey) => !byId.has(citekey))
  if (unknown.length > 0) {
    console.error(`not in the ledger: ${unknown.join(', ')}`)
    return 2
  }
  const chosen =
    positionals.length > 0 ? [...new Set(positionals)].map((id) => byId.get(id)) : ledger
  const doiEntries = chosen.filter((entry) => entry.DOI)
  const urlEntries = chosen.filter((entry) => entry.URL && !entry.DOI)

  if (options['dry-run']) {
    console.log(`User-Agent: ${USER_AGENT}`)
    console.log(`${doiEntries.length} DOI lookups, Crossref first and DataCite after a 404`)
    for (const entry of doiEntries.slice(0, 3)) {
      console.log(`  ${entry.id}  GET ${crossrefUrl(entry.DOI)}`)
    }
    console.log(`${urlEntries.length} URL fetches, for entries with a URL and no DOI`)
    for (const entry of urlEntries.slice(0, 3)) console.log(`  ${entry.id}  GET ${entry.URL}`)
    return 0
  }

  const previous = readSnapshot()
  const startedAt = now()
  const results = await runChecks(doiEntries, urlEntries)
  const found = findProblems(results, previous)

  const limit = positionals.length > 0 ? ` (limited to ${positionals.length} citekeys)` : ''
  const report = renderReport(found, { dois: doiEntries.length, urls: urlEntries.length, limit })
  console.log(report)
  if (options.summary) appendFileSync(options.summary, `${report}\n`)

  if (options.write) {
    const snapshot = nextSnapshot(previous, results, byId, startedAt)
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(sortKeys(snapshot), null, 2)}\n`)
    const [dois, urls] = [snapshot.dois, snapshot.urls].map((checks) => Object.keys(checks).length)
    console.error(`wrote ${dois} DOI and ${urls} URL checks to docs/CITATIONS.registry.json`)
  }

  return failures(found) > 0 ? 1 : 0
}

process.exitCode = await main()
