#!/usr/bin/env bun
/**
 * Checks every "verbatim" quote in the citation ledger (`custom.backsClaims` in
 * `docs/CITATIONS.csl.json`) against the text of its source, so a claim can be spot-checked
 * without fetching the source again, and records the quotes it found as receipts.
 *
 * The cache
 *   The sources are read from a cache, a local folder of fetched sources that is never committed
 *   because most of them are copyrighted. It holds `<citekey>/<citekey>.{pdf,html,xml,txt}` for
 *   each source and, optionally, `status.json`, which maps a citekey to an entry whose `step` says
 *   how the source was fetched. A quote is looked up in `<citekey>.txt`, then `<citekey>.xml`, then
 *   `<citekey>.html` (its tags stripped by `stripTags` in `src/data/verbatim.ts`). The `.txt` of a
 *   PDF is its text in reading order (pdftotext without -layout). The PDF itself only gives a
 *   receipt its kind and size.
 *
 * What it checks
 *   Quoted spans that name a place in the source (section labels, breadcrumbs, table rows, short
 *   labels in parentheses) are skipped and counted as labels skipped. A cached text under 500
 *   bytes is a stub, such as a paywall or bot-check page, so its quotes are counted as stub text
 *   and not checked. A quote is split on its ellipses into segments and each segment is looked up
 *   in the cached text, both folded by `foldForMatch` in `src/data/verbatim.ts` (case, spacing and
 *   unit spellings ignored). A quote is found when every segment is found, partial when some are
 *   and not found when none are. A segment that is missing prints how far it matched and where it
 *   breaks, in folded text.
 *
 * Flags
 *   bun scripts/check-quotes.mjs [--cache DIR] [--strict] [--context] [--write-receipts]
 *                                [citekey ...]
 *
 *   --cache DIR       the cache folder, taken from the working directory when the path is
 *                     relative. Without it the script reads DEFAULT_CACHE, a folder at the repo root
 *   --strict          exit 1 when any quote that has cached text is partial or not found
 *   --context         print each quote in full, and give a missing segment a `text has` line (what
 *                     the text says where the match stops) and a `best window` line (the 240
 *                     characters of text that share the most character trigrams with the segment)
 *   --write-receipts  record the quotes that were found in `docs/CITATIONS.receipts.json`
 *   citekey ...       limit the run to those ledger entries
 *
 * Receipts
 *   `docs/CITATIONS.receipts.json` is tracked and `src/data/citation-receipts.test.ts` holds it to
 *   the ledger offline, so the proof that a quote was found travels with the ledger while the
 *   cache stays local. With --write-receipts every quote that was found gets one receipt per
 *   distinct quote key (the SHA-256 of the folded quote) and a partial, not found, stub or missing
 *   quote gets none. A receipt holds the key, the first 60 characters of the quote and where it
 *   was found: the kind and size of the cached document (the PDF, XML or HTML the text was made
 *   from, or txt when only text is cached), the SHA-256 of the folded text, the step that
 *   `status.json` records for the entry (manual when there is none) and the day. A receipt for a
 *   quote this run did not check stays as it is, so a lost cache keeps its proof. A receipt whose
 *   text hash is unchanged keeps its found record, so a rerun changes nothing. A receipt whose
 *   quote the ledger no longer carries is dropped. CI fails on such a receipt until this script
 *   runs, and the run issues a receipt for the new wording if the text has it. A quote that stops
 *   matching keeps the receipt it has until the ledger changes it.
 *
 * Exit status
 *   0 for a report. With --strict it is 1 when any quote that has cached text is partial or not
 *   found. It is also 1 for a bad argument, a missing cache folder, and a receipts file that can't
 *   be read or written.
 *
 * Run it with bun, since it imports TypeScript
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import {
  RECEIPTS_FORMAT,
  foldForMatch,
  ledgerQuoteKeys,
  quoteKey,
  quotePreview,
  quotesInClaim,
  splitSegments,
  stripTags,
} from '../src/data/verbatim.ts'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'CITATIONS.csl.json')
const RECEIPTS_PATH = path.join(REPO_ROOT, 'docs', 'CITATIONS.receipts.json')
const DEFAULT_CACHE = path.join(REPO_ROOT, 'local-docs', 'papers')

const USAGE =
  'usage: bun scripts/check-quotes.mjs [--cache DIR] [--strict] [--context] [--write-receipts] [citekey ...]'
const BREAK_CONTEXT = 40
const STUB_BYTES = 500
const WINDOW = 240
const WINDOW_STEP = 40
const DOCUMENT_KINDS = ['pdf', 'xml', 'html']

function parseOptions() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        cache: { type: 'string' },
        strict: { type: 'boolean' },
        context: { type: 'boolean' },
        'write-receipts': { type: 'boolean' },
      },
    })
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`)
    process.exit(1)
  }
}

const { values: options, positionals: citekeys } = parseOptions()
const strict = options.strict === true
const context = options.context === true
const writeReceipts = options['write-receipts'] === true
const cacheDir = path.resolve(options.cache ?? DEFAULT_CACHE)

// the cached text as { text, bytes, kind }, with text and kind null when nothing is cached. A text
// under STUB_BYTES is a stub, so text is null and bytes is its size. The kind is the file the text
// was read from: txt, xml or html
async function loadCachedText(citekey) {
  const dir = path.join(cacheDir, citekey)
  const candidates = [
    { file: `${citekey}.txt`, kind: 'txt' },
    { file: `${citekey}.xml`, kind: 'xml' },
    { file: `${citekey}.html`, kind: 'html' },
  ]
  let stubBytes = null
  for (const c of candidates) {
    try {
      const raw = await readFile(path.join(dir, c.file), 'utf8')
      const text = c.kind === 'txt' ? raw : stripTags(raw)
      const bytes = Buffer.byteLength(text)
      if (bytes >= STUB_BYTES) return { text, bytes, kind: c.kind }
      stubBytes = Math.max(stubBytes ?? 0, bytes)
    } catch {
      // try the next candidate
    }
  }
  return { text: null, bytes: stubBytes, kind: null }
}

// the length of the longest prefix of seg that occurs in text, by bisection since a prefix of an
// occurring prefix occurs too
function matchedPrefixLength(seg, text) {
  let lo = 0
  let hi = seg.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (text.includes(seg.slice(0, mid))) lo = mid
    else hi = mid - 1
  }
  return lo
}

// the WINDOW characters of text, sliding in WINDOW_STEP steps, that share the most character
// trigrams with seg, or '' when none share any
function bestWindow(seg, text) {
  const grams = new Set()
  for (let i = 0; i + 3 <= seg.length; i++) grams.add(seg.slice(i, i + 3))
  let best = ''
  let bestShared = 0
  for (let start = 0; start < text.length; start += WINDOW_STEP) {
    const chunk = text.slice(start, start + WINDOW)
    const shared = new Set()
    for (let i = 0; i + 3 <= chunk.length; i++) {
      const gram = chunk.slice(i, i + 3)
      if (grams.has(gram)) shared.add(gram)
    }
    if (shared.size > bestShared) {
      best = chunk
      bestShared = shared.size
    }
  }
  return best
}

function checkQuote(quote, foldedText) {
  const segments = splitSegments(quote).map(foldForMatch).filter(Boolean)
  const breaks = []
  segments.forEach((seg, i) => {
    if (foldedText.includes(seg)) return
    const n = matchedPrefixLength(seg, foldedText)
    const before = seg.slice(Math.max(0, n - BREAK_CONTEXT), n)
    const after = seg.slice(n, n + BREAK_CONTEXT)
    const detail = `matched ${n}/${seg.length} chars, breaks at: ...${before}|${after}...`
    const extra = []
    if (context) {
      if (n >= 12) {
        const end = foldedText.indexOf(seg.slice(0, n)) + n
        extra.push(`text has: ...${before}|${foldedText.slice(end, end + BREAK_CONTEXT)}...`)
      }
      const near = bestWindow(seg, foldedText)
      if (near) extra.push(`best window: ...${near}...`)
    }
    breaks.push({ index: i + 1, detail, extra })
  })
  const total = segments.length
  const found = total - breaks.length
  const result = total > 0 && found === total ? 'found' : found > 0 ? 'partial' : 'not found'
  return { result, found, total, breaks }
}

// the document a receipt says the quote was found in, as { kind, bytes }: the PDF, XML or HTML
// the cached text was made from when one sits beside it, else the text file itself. A text that
// came from the XML or HTML directly, because the text file is missing or a stub, names that file
async function describeDocument(citekey, textKind) {
  const kinds = textKind === 'txt' ? [...DOCUMENT_KINDS, 'txt'] : [textKind]
  for (const kind of kinds) {
    try {
      const { size } = await stat(path.join(cacheDir, citekey, `${citekey}.${kind}`))
      return { kind, bytes: size }
    } catch {
      // try the next kind
    }
  }
  throw new Error(`${citekey}: the cached file that held a found quote is gone`)
}

// the cache's status.json, or an empty object when the cache has none
function loadStatus() {
  try {
    return JSON.parse(readFileSync(path.join(cacheDir, 'status.json'), 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return {}
    throw err
  }
}

// the receipts file as { raw, file }, with raw empty and file holding no receipts when there is none
async function loadReceipts() {
  let raw
  try {
    raw = await readFile(RECEIPTS_PATH, 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    return { raw: '', file: { format: RECEIPTS_FORMAT, receipts: {} } }
  }
  const file = JSON.parse(raw)
  if (file.format !== RECEIPTS_FORMAT) {
    throw new Error(
      `${RECEIPTS_PATH} is format ${file.format}, this script writes ${RECEIPTS_FORMAT}`,
    )
  }
  return { raw, file }
}

// a receipt with its fields in the order the file keeps them
function canonical({ quote, preview, found }) {
  const { kind, bytes, textSha256, via, date } = found
  return { quote, preview, found: { kind, bytes, textSha256, via, date } }
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// the receipts file after this run. foundQuotes holds { citekey, quote, found } for every quote
// this run found. Each gets a receipt, or has its found record replaced when the text it was found
// in has changed. Every other receipt stays unless the ledger no longer carries its quote
function mergeReceipts({ existing, foundQuotes, ledger }) {
  const byEntry = new Map()
  for (const [citekey, list] of Object.entries(existing.receipts)) {
    const receipts = new Map()
    for (const receipt of list) {
      if (!receipts.has(receipt.quote)) receipts.set(receipt.quote, receipt)
    }
    byEntry.set(citekey, receipts)
  }

  const tally = { added: 0, refreshed: 0, pruned: 0 }
  const seen = new Set()
  for (const { citekey, quote, found } of foundQuotes) {
    const key = quoteKey(quote)
    if (seen.has(`${citekey} ${key}`)) continue
    seen.add(`${citekey} ${key}`)
    if (!byEntry.has(citekey)) byEntry.set(citekey, new Map())
    const receipts = byEntry.get(citekey)
    const before = receipts.get(key)
    const sameText = before?.found.textSha256 === found.textSha256
    if (before === undefined) tally.added += 1
    else if (!sameText) tally.refreshed += 1
    receipts.set(key, {
      quote: key,
      preview: quotePreview(quote),
      found: sameText ? before.found : found,
    })
  }

  const wanted = ledgerQuoteKeys(ledger)
  for (const [citekey, receipts] of byEntry) {
    for (const key of [...receipts.keys()]) {
      if (wanted.get(citekey)?.has(key)) continue
      receipts.delete(key)
      tally.pruned += 1
    }
  }

  const sorted = {}
  let total = 0
  for (const citekey of [...byEntry.keys()].sort()) {
    const list = [...byEntry.get(citekey).values()].map(canonical)
    if (list.length === 0) continue
    list.sort((a, b) => compare(a.preview, b.preview) || compare(a.quote, b.quote))
    sorted[citekey] = list
    total += list.length
  }
  return { file: { format: RECEIPTS_FORMAT, receipts: sorted }, tally, total }
}

// writes the receipts for the quotes this run found and reports what changed. checked holds
// { job, result } for every quote that had a text to look in, and textCache what was read for each
// entry
async function recordReceipts({ ledger, checked, textCache }) {
  const status = loadStatus()
  const today = new Date().toISOString().slice(0, 10)
  const foundByEntry = new Map()
  const foundQuotes = []
  for (const { job, result } of checked) {
    if (result !== 'found') continue
    if (!foundByEntry.has(job.citekey)) {
      const { foldedText, kind } = textCache.get(job.citekey)
      foundByEntry.set(job.citekey, {
        ...(await describeDocument(job.citekey, kind)),
        textSha256: createHash('sha256').update(foldedText).digest('hex'),
        via: status[job.citekey]?.step || 'manual',
        date: today,
      })
    }
    const found = foundByEntry.get(job.citekey)
    foundQuotes.push({ citekey: job.citekey, quote: job.quote, found })
  }

  const { raw, file: existing } = await loadReceipts()
  const { file, tally, total } = mergeReceipts({ existing, foundQuotes, ledger })
  const next = `${JSON.stringify(file, null, 2)}\n`
  if (next !== raw) await writeFile(RECEIPTS_PATH, next, 'utf8')

  const receipted = new Set(
    Object.entries(file.receipts).flatMap(([citekey, list]) =>
      list.map((receipt) => `${citekey} ${receipt.quote}`),
    ),
  )
  const unmatched = checked.filter(
    ({ job, result }) =>
      (result === 'partial' || result === 'not found') &&
      receipted.has(`${job.citekey} ${quoteKey(job.quote)}`),
  )
  console.log('\nReceipts (docs/CITATIONS.receipts.json)')
  console.log(`  added:     ${tally.added}`)
  console.log(`  refreshed: ${tally.refreshed}`)
  console.log(`  pruned:    ${tally.pruned}`)
  if (unmatched.length > 0) {
    console.log(
      `  kept:      ${unmatched.length} (receipts of quotes that did not match this run's text)`,
    )
  }
  console.log(`  total:     ${total} receipts for ${Object.keys(file.receipts).length} entries`)
  console.log(`  file:      ${next === raw ? 'unchanged' : 'written'}`)
}

async function main() {
  if (!existsSync(cacheDir)) {
    console.error(
      `no cache folder at ${cacheDir}, name the folder of fetched sources with --cache DIR`,
    )
    process.exit(1)
  }
  const only = new Set(citekeys)

  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
  for (const key of only) {
    if (!ledger.some((e) => e.id === key)) console.log(`${key}: not in the ledger, skipping`)
  }
  const jobs = []
  let labelsSkipped = 0
  for (const entry of ledger) {
    if (only.size && !only.has(entry.id)) continue
    const claims = entry.custom?.backsClaims || []
    for (const claim of claims) {
      for (const { text, label } of quotesInClaim(claim)) {
        if (label) labelsSkipped += 1
        else jobs.push({ citekey: entry.id, quote: text })
      }
    }
  }

  const entryCount = new Set(jobs.map((j) => j.citekey)).size
  console.log(
    `Extracted ${jobs.length} quotes from ${entryCount} ledger entries mentioning "verbatim".\n`,
  )

  const textCache = new Map()
  const checked = []
  const counts = { found: 0, partial: 0, 'not found': 0, 'no text cached': 0, 'stub text': 0 }
  let n = 0
  for (const job of jobs) {
    n += 1
    if (!textCache.has(job.citekey)) {
      const { text, bytes, kind } = await loadCachedText(job.citekey)
      const foldedText = text === null ? null : foldForMatch(text)
      textCache.set(job.citekey, { foldedText, bytes, kind })
    }
    const { foldedText, bytes } = textCache.get(job.citekey)
    const preview = job.quote.length > 60 && !context ? `${job.quote.slice(0, 60)}...` : job.quote

    if (foldedText === null) {
      const stub = bytes !== null
      counts[stub ? 'stub text' : 'no text cached'] += 1
      const what = stub ? `stub text (${bytes} bytes)` : 'no text cached'
      console.log(`${n}. [${job.citekey}] ${what}: "${preview}"`)
      continue
    }

    const { result, found, total, breaks } = checkQuote(job.quote, foldedText)
    counts[result] += 1
    checked.push({ job, result })
    const suffix = result === 'partial' ? ` (${found} of ${total} segments)` : ''
    console.log(`${n}. [${job.citekey}] ${result}${suffix}: "${preview}"`)
    for (const b of breaks) {
      console.log(`     ${total > 1 ? `segment ${b.index} of ${total}: ` : ''}${b.detail}`)
      for (const line of b.extra) console.log(`     ${line}`)
    }
  }

  console.log('\nSummary')
  console.log(`  found:          ${counts.found}`)
  console.log(`  partial:        ${counts.partial}`)
  console.log(`  not found:      ${counts['not found']}`)
  console.log(`  no text cached: ${counts['no text cached']}`)
  console.log(`  stub text:      ${counts['stub text']}`)
  console.log(`  total quotes:   ${jobs.length}`)
  console.log(`  labels skipped: ${labelsSkipped}`)
  if (strict && counts.partial + counts['not found'] > 0) process.exitCode = 1
  if (writeReceipts) await recordReceipts({ ledger, checked, textCache })
}

main()
  .catch((err) => {
    console.error('check-quotes error:', err)
    if (strict || writeReceipts) process.exitCode = 1
  })
  .finally(() => {
    process.exit()
  })
