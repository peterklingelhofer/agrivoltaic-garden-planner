// docs/CITATIONS.md is derived: the bibliography is rendered from CITATIONS.csl.json so the
// two cannot drift. The hand-written preamble and gaps ledger are preserved verbatim
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const docs = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs')
const jsonPath = join(docs, 'CITATIONS.csl.json')
const mdPath = join(docs, 'CITATIONS.md')

const GROUPS = [
  ['agrivoltaics', 'Agrivoltaics'],
  ['solar', 'Solar engineering'],
  ['horticulture', 'Horticulture & crop physiology'],
  ['climate', 'Climate & geodata'],
  ['tek', 'Traditional ecological knowledge'],
  ['standards', 'Standards & regulation'],
  ['software', 'Software & datasets'],
]

const LEDGER = '## Unsourced and weakly-sourced claims'

const entries = JSON.parse(readFileSync(jsonPath, 'utf8'))
const previous = readFileSync(mdPath, 'utf8')

const preamble = previous.slice(0, previous.indexOf(`\n## ${GROUPS[0][1]}`))
const ledgerAt = previous.indexOf(LEDGER)
const ledger = ledgerAt === -1 ? '' : previous.slice(ledgerAt)

const names = (authors) =>
  !authors?.length
    ? null
    : authors
        .map((a) => (a.literal ? a.literal : [a.family, a.given].filter(Boolean).join(', ')))
        .join('; ')

const year = (issued) => issued?.['date-parts']?.[0]?.[0] ?? 'n.d.'

const reference = (e) => {
  const parts = []
  const who = names(e.author)
  if (who) parts.push(`${who}.`)
  parts.push(`(${year(e.issued)}).`)
  parts.push(`*${e.title}*.`)
  // publisher is only informative when there is no journal to name
  const venue = e['container-title'] ?? e.publisher
  const where = [venue, e.number].filter(Boolean).join(' ')
  if (where) parts.push(where.trim())
  const locus = [e.volume, e.page].filter(Boolean).join(': ')
  if (locus) parts.push(locus)
  return parts.join(' ').replace(/\s+/g, ' ').replace(/ \./g, '.')
}

const verificationLabel = {
  'crossref-verified': 'Crossref-verified',
  'datacite-verified': 'DataCite-verified',
  'url-verified': 'URL-verified',
  unverified: 'UNVERIFIED',
}

const render = (e) => {
  const c = e.custom ?? {}
  const lines = [`#### \`${e.id}\``, '', reference(e), '']
  if (e.DOI) lines.push(`- DOI: [${e.DOI}](https://doi.org/${e.DOI})`)
  else if (e.URL) lines.push(`- URL: <${e.URL}>`)
  const tier = c.evidenceTier ? `, evidence tier **${c.evidenceTier}**` : ''
  lines.push(
    `- Verification: ${verificationLabel[c.verification] ?? c.verification} | Access: ${c.accessLevel}${tier}`,
  )
  if (c.backsClaims?.length) {
    lines.push('- Backs:')
    for (const claim of c.backsClaims) lines.push(`  - ${claim}`)
  }
  if (c.caveat) lines.push(`- **Caveat:** ${c.caveat}`)
  lines.push('')
  return lines.join('\n')
}

const tally = (key) => {
  const counted = {}
  for (const e of entries) {
    const k = key(e.custom ?? {})
    counted[k] = (counted[k] ?? 0) + 1
  }
  // sorted by key so a re-render of an unchanged corpus is byte-identical
  return Object.fromEntries(Object.entries(counted).sort(([a], [b]) => a.localeCompare(b)))
}

const counts = tally((c) => c.verification ?? 'unverified')
const access = tally((c) => c.accessLevel ?? 'unknown')
const tiers = tally((c) => c.evidenceTier ?? 'null (not applicable)')

const table = (heading, counted, total) =>
  [
    `| ${heading} | n |`,
    '|---|---|',
    ...Object.entries(counted).map(([k, v]) => `| ${k} | ${v} |`),
    ...(total ? [`| **total** | **${entries.length}** |`] : []),
  ].join('\n')

const body = GROUPS.map(([key, heading]) => {
  const group = entries.filter((e) => e.custom?.group === key)
  const sorted = [...group].sort((a, b) => a.id.localeCompare(b.id))
  return [`## ${heading}`, '', `${sorted.length} sources.`, '', ...sorted.map(render)].join('\n')
}).join('\n')

const ungrouped = entries.filter((e) => !GROUPS.some(([k]) => k === e.custom?.group))
if (ungrouped.length) {
  console.error(`ungrouped entries: ${ungrouped.map((e) => e.id).join(', ')}`)
  process.exitCode = 1
}

// the count line and the count tables are derived, not hand-written. The replacement writes back `N
// sources (...).`, so the trailing group is optional: a pattern that matched only `N sources.`
// would find nothing after the first run and silently leave the count frozen
const counted = preamble.replace(
  /^\d+ sources(?: \([^)]*\))?\./m,
  `${entries.length} sources (${Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ')}).`,
)

// the tables drifted the same way, by being preserved verbatim as if they were prose: rendering
// them from the corpus is what makes the file's "cannot drift" claim true of the counts as well
const header = counted.replace(
  /^### Counts\n[\s\S]*?(?=\n---\n)/m,
  [
    '### Counts',
    '',
    table('Verification', counts, true),
    '',
    table('Access level', access, false),
    '',
    table('Evidence tier', tiers, false),
    '',
  ].join('\n'),
)

writeFileSync(mdPath, [header, body, ledger].join('\n').replace(/\n{3,}/g, '\n\n'))
console.log(`rendered ${entries.length} entries to docs/CITATIONS.md`)
