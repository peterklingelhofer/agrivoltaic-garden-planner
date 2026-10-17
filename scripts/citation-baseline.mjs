#!/usr/bin/env bun
/**
 * Holds five counts in the citation ledger to a baseline that can only go down.
 *
 * The counts come from `baselineCounts` in `src/data/citation-baseline.ts`: the entries still
 * marked unverified, the verbatim quotes that have no receipt, the quotes that elide words with a
 * bare ellipsis where `[...]` is the written form, the quotes with no locator and the entries with
 * a claim that still says verbatim. `docs/CITATIONS.baseline.json` holds the figure each one may
 * not exceed and `src/data/citation-baseline.test.ts` fails CI when one does, so a regression is
 * caught offline and an improvement is a one-line change to the baseline.
 *
 *   bun scripts/citation-baseline.mjs           print each count as `current / baseline`, say
 *                                               which could come down, and exit 1 when any is over
 *   bun scripts/citation-baseline.mjs --write   rewrite the baseline to the current counts and
 *                                               exit 0
 *
 * Lowering a baseline is a normal commit. Raising one needs its reason in the commit message.
 * A baseline file that is missing or in another format exits 1 and bad arguments exit 2
 *
 * Run it with bun, since it imports TypeScript
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import {
  BASELINE_FORMAT,
  BASELINE_METRICS,
  baselineCounts,
  overBaseline,
} from '../src/data/citation-baseline.ts'

const LEDGER_PATH = new URL('../docs/CITATIONS.csl.json', import.meta.url)
const RECEIPTS_PATH = new URL('../docs/CITATIONS.receipts.json', import.meta.url)
const BASELINE_PATH = new URL('../docs/CITATIONS.baseline.json', import.meta.url)
const BASELINE_NAME = 'docs/CITATIONS.baseline.json'
const WRITE_HINT = 'lower a baseline with: bun run citations:baseline --write'
const USAGE = 'usage: bun scripts/citation-baseline.mjs [--write]'

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'))

// the committed baseline, or null when there is no such file
const readBaseline = () => {
  try {
    return readJson(BASELINE_PATH)
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`${BASELINE_NAME} can't be read: ${error.message}`)
  }
}

const parseOptions = () => {
  try {
    return parseArgs({ options: { write: { type: 'boolean' } } })
  } catch (error) {
    console.error(`${error.message}\n${USAGE}`)
    return null
  }
}

const width = Math.max(...BASELINE_METRICS.map((metric) => metric.length))

const report = (current, baseline) => {
  const limits = baseline.counts ?? {}
  const over = overBaseline(current, limits).map((one) => one.metric)
  const lower = BASELINE_METRICS.filter((metric) => current[metric] < limits[metric])
  for (const metric of BASELINE_METRICS) {
    let note = ''
    if (over.includes(metric)) note = '  over'
    else if (lower.includes(metric)) note = '  can come down'
    console.log(`${metric.padEnd(width)}  ${current[metric]} / ${limits[metric]}${note}`)
  }
  if (over.length > 0) {
    console.log(`${over.length} over the baseline: ${over.join(', ')}`)
  } else if (lower.length > 0) {
    console.log(`could come down: ${lower.join(', ')}`)
    console.log(WRITE_HINT)
  } else {
    console.log('every count is at its baseline')
  }
  return over.length > 0 ? 1 : 0
}

// how a count compares with the figure it replaces in the baseline
const change = (was, now) => {
  if (was === undefined) return ''
  if (was === now) return ' (unchanged)'
  return was > now ? ` (was ${was})` : ` (was ${was}, raised)`
}

const write = (current) => {
  let before = null
  try {
    before = readBaseline()
  } catch {
    // a baseline that can't be read is replaced
  }
  const file = {
    format: BASELINE_FORMAT,
    counts: Object.fromEntries(BASELINE_METRICS.map((metric) => [metric, current[metric]])),
  }
  writeFileSync(BASELINE_PATH, `${JSON.stringify(file, null, 2)}\n`)
  console.log(`wrote ${BASELINE_NAME}`)
  for (const metric of BASELINE_METRICS) {
    const was = before?.counts?.[metric]
    console.log(`${metric.padEnd(width)}  ${current[metric]}${change(was, current[metric])}`)
  }
  return 0
}

const main = () => {
  const parsed = parseOptions()
  if (parsed === null) return 2
  const current = baselineCounts(readJson(LEDGER_PATH), readJson(RECEIPTS_PATH))
  if (parsed.values.write) return write(current)

  const baseline = readBaseline()
  if (baseline === null) {
    console.error(
      `${BASELINE_NAME} is missing, create it with: bun scripts/citation-baseline.mjs --write`,
    )
    return 1
  }
  if (baseline.format !== BASELINE_FORMAT) {
    console.error(
      `${BASELINE_NAME} is format ${baseline.format}, this script reads ${BASELINE_FORMAT}`,
    )
    return 1
  }
  return report(current, baseline)
}

process.exitCode = main()
