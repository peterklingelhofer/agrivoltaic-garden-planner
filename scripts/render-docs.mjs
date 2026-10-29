/**
 * Renders the science and provenance documents into `dist/docs/` as part of the build.
 *
 *   bun scripts/render-docs.mjs         # after `vite build`, so `dist/` exists
 *
 * It runs under Bun because the crop page imports the catalog's TypeScript
 * (`src/data/crop-light-table.ts`, which imports `schema.ts`), whose extensionless imports plain
 * Node can't resolve.
 *
 * Why this exists: the deployed app is a client-rendered SPA whose entire case for being taken
 * seriously lives in `docs/`, and none of it was reachable from the deployed URL. A reader who
 * wants to know where a number came from couldn't get there, and neither could anything reading
 * the page without executing JavaScript.
 *
 * PUBLISHED is a whitelist and must stay one. `docs/` also holds engineering notes (the
 * architecture) that a reader of the science has no use for. Adding a file here is a decision to
 * publish it
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { marked } from 'marked'

const ROOT = new URL('../', import.meta.url)
const OUT = new URL('dist/docs/', ROOT)

const SITE_TITLE = 'Agrivoltaic Garden Planner'

/** The bar at the top says it the way the planner's own toolbar does */
const SITE_HEADER = 'Agrivoltaic garden planner'

/**
 * What ships, in reading order: a reader arriving cold should meet the decision record first
 * and the raw citation corpus last. The blurb is what the index shows, and
 * it's the only prose here that is not lifted from the document itself
 */
const PUBLISHED = [
  {
    file: '00-DECISIONS.md',
    title: 'Decision record',
    blurb: 'Every modeling decision, what it rests on, and what each figure is allowed to claim',
  },
  {
    file: 'STATIC-LAYERS.md',
    title: 'Bundled climate and region grids',
    blurb:
      'The Koppen, hardiness and botanical-region rasters: their sources, what resampling cost, and how each is checked against its own source',
  },
  {
    file: 'VALIDATION.md',
    title: 'Validation record',
    blurb:
      'Which numbers have been checked against something outside this app, in four bands from a named physics oracle down to nothing measured in a garden',
  },
  {
    file: 'CITATIONS.md',
    title: 'Citation corpus',
    blurb:
      "Every source with its verification status, and the gaps ledger of the claims this tool can't yet source",
  },
]

/**
 * Pages built from data, not read from `docs/`. They stay out of PUBLISHED so that stays a list
 * of markdown files, and the index puts each one right after the document its `after` names
 */
const CROPS = {
  file: 'crops.html',
  title: 'Crop light figures',
  blurb:
    "Every crop in the catalog with the least light it needs, its target band and the most panel shade it's allowed",
  after: '00-DECISIONS.md',
}
const GENERATED = [CROPS]

/**
 * Said once on the index and once at the head of every document, because a reader can arrive at
 * any of them directly from a search result and none of them should be read as a recommendation
 */
const STANDING_NOTE =
  "These are the working documents of a modeling tool, and they haven't been peer reviewed. They record what the tool computes and what each figure rests on, including where a figure is an inference. Nothing here is agronomic or engineering advice."

const esc = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Self-contained, no external font or stylesheet, and honors the reader's own theme. A
 * provenance page that can't be read offline or that pulls a webfont from a third party would be
 * making a point about this project it doesn't want to make
 */
const STYLE = `
/* the planner's own face, served from this origin the way the app serves it (src/index.css), so
   the documents read in the tool's type and still make no third-party request */
@font-face { font-family:'Ubuntu Sans'; font-style:normal; font-weight:100 800; font-display:swap;
  src:url(/fonts/ubuntu-sans-latin.woff2) format('woff2');
  unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD }
@font-face { font-family:'Ubuntu Sans'; font-style:normal; font-weight:100 800; font-display:swap;
  src:url(/fonts/ubuntu-sans-latin-ext.woff2) format('woff2');
  unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF }
:root { color-scheme: light dark; --ink:#16281f; --dim:#4a5d54; --bg:#fbfaf7; --panel:#fff; --line:#d9e0da; --link:#1c5f43; --code:#f0efe9;
  --sans:'Ubuntu Sans', system-ui, sans-serif }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e6ece8; --dim:#a3b3aa; --bg:#131714; --panel:#1a201c; --line:#2c3630; --link:#7fc9a5; --code:#222a25 }
}
* { box-sizing: border-box }
body { margin:0; background:var(--bg); color:var(--ink); overflow-x:clip;
  font:16px/1.65 ui-serif, Georgia, "Times New Roman", serif; }
.wrap { max-width: 46rem; margin:0 auto; padding: 2rem 1.25rem 6rem }
/* the bar the planner itself wears: its name in its own face and case, on a panel with a rule under it */
header.site { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:4px 16px; padding:8px 14px; border-bottom:1px solid var(--line); background:var(--panel) }
header.site a { color:var(--ink); text-decoration:none; font:600 15px/1.4 var(--sans) }
/* the bar's right end on a generated page: how current the reading behind it is */
.site-aside { font:13px/1.4 var(--sans); color:var(--dim) }
h1,h2,h3,h4 { font-family: var(--sans); line-height:1.25; margin:2.2rem 0 0.7rem }
h1 { font-size:1.9rem; margin-top:0 } h2 { font-size:1.35rem } h3 { font-size:1.1rem } h4 { font-size:1rem }
a { color:var(--link) }
p, li { overflow-wrap:break-word }
code { background:var(--code); padding:0.1em 0.35em; border-radius:3px;
  font:0.87em/1.5 ui-monospace, SFMono-Regular, Menlo, monospace }
pre { background:var(--code); padding:0.9rem 1rem; border-radius:6px; overflow-x:auto }
pre code { background:none; padding:0 }
blockquote { margin:1.2rem 0; padding:0.1rem 0 0.1rem 1rem; border-left:3px solid var(--line); color:var(--dim) }
/* the text keeps its reading width, and a table that can't fit it spreads into the margins: the
   outer box spans the window, the inner one is the text's width or the least its table needs,
   centered, and scrolls only where the window is narrower still. The page itself never scrolls
   sideways */
.table-bleed { margin:1.2rem calc(50% - 50vw); padding:0 1.25rem }
.table-scroll { overflow-x:auto; width:min-content; min-width:min(100%, 43.5rem); max-width:100%;
  margin:0 auto; border:1px solid var(--line); border-radius:6px }
/* four columns or more get room to read, up to 64rem: held to the text's width, each column of
   such a table wraps a word or two to a line */
.table-scroll.wide { width:fit-content; max-width:min(100%, 64rem) }
table { border-collapse:collapse; width:100%; font:0.86rem/1.5 var(--sans) }
th, td { border-bottom:1px solid var(--line); padding:0.5rem 0.7rem; text-align:left; vertical-align:top }
th { background:var(--panel); font-weight:650; white-space:nowrap }
hr { border:0; border-top:1px solid var(--line); margin:2.5rem 0 }
.note { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:0.9rem 1.1rem;
  font:0.9rem/1.6 var(--sans); color:var(--dim); margin:0 0 2rem }
.index { list-style:none; padding:0; margin:2rem 0 0 }
.index li { border-top:1px solid var(--line); padding:1rem 0 }
.index a { font:650 1.05rem/1.4 var(--sans); text-decoration:none }
.index a:hover { text-decoration:underline }
.index p { margin:0.3rem 0 0; color:var(--dim); font:0.92rem/1.55 var(--sans) }
.dim { color: var(--dim); font-size: 0.92em }
tr.group th { background: var(--panel); text-align: left; white-space: normal; font-weight: 650; padding-top: 0.8rem }
.noted { text-decoration: underline dotted; text-decoration-color: var(--dim); text-underline-offset: 0.2em; cursor: help }
.filter { font: 0.92rem/1.5 var(--sans); color: var(--dim); margin: 1.5rem 0 0 }
.filter input { font: inherit; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 4px; padding: 0.35rem 0.5rem; width: min(100%, 20rem); margin-right: 0.6rem }
.filter output { white-space: nowrap }
thead th[title] { cursor: help; text-decoration: underline dotted; text-decoration-color: var(--dim); text-underline-offset: 0.25em }
/* the copy of the crop table's header row that the page script fixes to the top of the window */
.floating-head { position: fixed; top: 0; z-index: 3; overflow: hidden; background: var(--panel); border-bottom: 1px solid var(--line); box-shadow: 0 2px 6px rgb(0 0 0 / 0.08) }
.floating-head table { table-layout: fixed; width: auto }
.floating-head th { border-bottom: 0 }
/* twelve columns, so the crop table gets more room than the documents' tables before it scrolls */
.crops .table-scroll.wide { max-width: min(100%, 96rem) }
`

const page = ({ title, body, home, description, aside = null }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} | ${esc(SITE_TITLE)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:type" content="article" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />
    <style>${STYLE}</style>
  </head>
  <body>
    <header class="site"><a href="${home}">${esc(SITE_HEADER)}</a>${aside === null ? '' : `<span class="site-aside">${esc(aside)}</span>`}</header>
    <div class="wrap">
      ${body}
    </div>
  </body>
</html>
`

/** GitHub-flavored, because every table in these documents is a GFM table */
marked.setOptions({ gfm: true, breaks: false })

/**
 * GitHub's heading slug: lowercase, every character dropped that isn't a letter, a digit, a space
 * or a hyphen, then each space a hyphen. Hyphens stay as they fall, so "a - b" is "a---b"
 */
const slugOf = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, '')
    .replace(/ /g, '-')

/** A heading's text with the markup gone: the inside of code, links and emphasis */
const plainText = (tokens) =>
  tokens.map((token) => (token.tokens ? plainText(token.tokens) : (token.text ?? ''))).join('')

// the ids handed out so far in the document being rendered
let headingIds = new Set()

/** The slug, and a repeat of one within the document gets -1, -2... after it */
const uniqueId = (text) => {
  const slug = slugOf(text)
  let id = slug
  for (let n = 1; headingIds.has(id); n += 1) id = `${slug}-${n}`
  headingIds.add(id)
  return id
}

/**
 * marked adds no ids to headings, so nothing could link to a section or a citation. The citation
 * corpus headings are the citation ids in backticks, so their ids are the citation ids. A method,
 * not an arrow function: marked calls it with the renderer as `this`
 */
marked.use({
  renderer: {
    heading(token) {
      const id = uniqueId(plainText(token.tokens))
      return `<h${token.depth} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`
    },
  },
})

/** One document to HTML, with the ids its headings got */
const render = (source) => {
  headingIds = new Set()
  return { html: marked.parse(source), ids: headingIds }
}

/**
 * Two rewrites on the rendered HTML, both of them about links that would otherwise be broken
 * promises. A `.md` link to a published document becomes its `.html`. A `.md` link to anything
 * NOT published becomes plain text, because a whitelist that still linked to what it withheld
 * would ship a page of 404s
 */
const relink = (html, published) =>
  html.replace(
    /<a href="([^"]*?)\.md(#[^"]*)?"([^>]*)>(.*?)<\/a>/g,
    (_whole, path, hash, _rest, text) => {
      const name = `${path.split('/').pop()}.md`
      return published.has(name)
        ? `<a href="./${name.replace(/\.md$/, '.html')}${hash ?? ''}">${text}</a>`
        : text
    },
  )

const wrapTables = (html) =>
  html.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    const header = table.match(/<tr>([\s\S]*?)<\/tr>/)?.[1] ?? ''
    const wide = (header.match(/<th[\s>]/g) ?? []).length >= 4
    return `<div class="table-bleed"><div class="table-scroll${wide ? ' wide' : ''}">${table}</div></div>`
  })

/**
 * "Laub et al. 2022" for a citation id, from its CSL record. The id itself where there's no
 * record, or the record lacks the author or the year the label needs
 */
const citationLabel = (items, id) => {
  const item = items.get(id)
  const authors = item?.author ?? []
  const year = item?.issued?.['date-parts']?.[0]?.[0]
  // both names of a pair, else the first author's. An institution is its literal name, and an
  // undated work goes by its author alone
  const names = authors
    .slice(0, authors.length === 2 ? 2 : 1)
    .map((author) => author.family ?? author.literal)
  if (names.length === 0 || names.includes(undefined)) return id
  const who = `${names.join(' and ')}${authors.length > 2 ? ' et al.' : ''}`
  return year ? `${who} ${year}` : who
}

/**
 * How current the reading behind the table is, for the bar's right end: the latest day any work
 * the rows cite was read, as the ledger's accessed dates record it, and the day the ledger's
 * registry records were last checked
 */
const sourcesAsOf = (table, csl, registry) => {
  const ids = new Set(
    table.rows.flatMap((row) => [
      ...row.lightCitations,
      ...row.ceilingCitations,
      ...row.survivalCitations,
    ]),
  )
  const read = [...ids]
    .map((id) => csl.get(id)?.accessed?.['date-parts']?.[0])
    .filter(Boolean)
    .map(([year, month = 1, day = 1]) => Date.UTC(year, month - 1, day))
    .sort((a, b) => a - b)
    .at(-1)
  const month = { month: 'long', year: 'numeric', timeZone: 'UTC' }
  const day = { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
  return [
    read === undefined
      ? null
      : `Sources read through ${new Intl.DateTimeFormat('en-US', month).format(read)}`,
    registry.checked
      ? `records verified ${new Intl.DateTimeFormat('en-US', day).format(new Date(registry.checked))}`
      : null,
  ]
    .filter((part) => part !== null)
    .join(', ')
}

const cropCount = (n) => `${n} ${n === 1 ? 'crop' : 'crops'}`

/** A class's target band as its group row words it, from whichever ends exist */
const classTarget = ({ targetLowMolM2Day: low, targetHighMolM2Day: high }) => {
  const band = [low, high].filter((figure) => figure !== null).join(' to ')
  return band === '' ? 'no class target' : `target ${band}`
}

const maturityText = (maturity) => {
  if (maturity === null) return ''
  if (maturity.kind === 'days')
    return `${maturity.days} days${maturity.from === 'transplant' ? ' from transplant' : ''}`
  if (maturity.kind === 'perennial') return 'perennial'
  if (maturity.years < 1) return 'under a year'
  return maturity.years === 1 ? '1 year' : `${maturity.years} years`
}

/** What a crop's own note is about, as the label before it in the name's hover */
const NOTE_SUBJECT = { light: 'Light figures', ceiling: 'Shade ceiling' }
const noteSubject = (note) =>
  NOTE_SUBJECT[note.kind] ??
  `${note.kind.charAt(0).toUpperCase()}${note.kind.slice(1)} ceiling ${note.value} mol/m²/d`

const sameIds = (a, b) => a.length === b.length && a.every((id, i) => id === b[i])

/** Each header and the short explainer its hover shows, an empty one for a header with none */
const HEADERS = [
  ['Crop', ''],
  ['Botanical name', 'Genus and species'],
  ['Family', 'The plant family'],
  ['Light floor (mol/m²/d)', 'The least light the crop gets by on'],
  ['Target light band (mol/m²/d)', 'Where it does well.'],
  [
    'Research tier',
    "How solid the light floor and band are. A is measured on this crop, B a shade or field study of it, and C is the catalog's own figure, set by analogy with the crops in its class that have a published number. The word after it says where the number came from: the class, a cited table, a trial or a study.",
  ],
  [
    'Shade ceiling (%)',
    "The most of a bed's light the panels may take over the crop's season, set at the cautious end of a range.",
  ],
  [
    'Research tier',
    "How solid the shade ceiling is. B rests on a shade study in this same unit: a pooled regression across crops found no significant yield loss below 20 percent shading, and a Swiss strawberry study put its limit at 10 to 30 percent. C is the catalog's own bound for the class, kept inside what a meta-analysis of shade trials found tolerable, with no shade trial on the crop itself.",
  ],
  ['Shade benefit', "Says in heat when the crop tends to like some shade where it's hot and dry."],
  [
    'Maturity',
    'Days from sowing to harvest, or from transplanting when it says so. Perennials show years to full size where the catalog has them.',
  ],
  [
    'Spacing (cm)',
    'Plant spacing in centimeters. The first number is the gap between plants along a row, the second the gap between rows.',
  ],
  ['Sources', ''],
]

/**
 * Adds the filter box and the floating header to the crop table. A script builds both and the
 * HTML never holds them, so the page reads complete with scripts off. A row hides when its text
 * lacks the query, and a class hides when none of its rows are left. The header row sits in a
 * box that scrolls sideways, and a sticky row can't follow the window's scroll from inside one,
 * so a copy of it is fixed to the top of the window once the real one has scrolled off, kept to
 * the table's column widths and its sideways scroll
 */
const FILTER_SCRIPT = `<script>
(() => {
  const bleed = document.querySelector('.table-bleed')
  const bodies = [...bleed.querySelectorAll('tbody')]
  const rows = [...bleed.querySelectorAll('tbody tr:not(.group)')]
  const texts = rows.map((row) => row.textContent.toLowerCase())
  const count = (shown) => shown + ' of ' + rows.length + ' crops'
  const filter = document.createElement('p')
  filter.className = 'filter'
  filter.innerHTML =
    '<label>Filter the table <input type="search" autocomplete="off" spellcheck="false"></label>' +
    '<output>' + count(rows.length) + '</output>'
  bleed.before(filter)

  const scroll = bleed.querySelector('.table-scroll')
  const table = scroll.querySelector('table')
  const head = table.tHead
  const floating = document.createElement('div')
  floating.className = 'floating-head'
  floating.hidden = true
  const copy = document.createElement('table')
  copy.append(head.cloneNode(true))
  floating.append(copy)
  document.body.append(floating)
  const cells = [...head.rows[0].cells]
  const copies = [...copy.rows[0].cells]
  const place = () => {
    const box = scroll.getBoundingClientRect()
    const show = head.getBoundingClientRect().bottom < 0 && box.bottom > head.offsetHeight
    floating.hidden = !show
    if (!show) return
    floating.style.left = box.left + scroll.clientLeft + 'px'
    floating.style.width = scroll.clientWidth + 'px'
    copy.style.width = table.offsetWidth + 'px'
    cells.forEach((cell, i) => {
      copies[i].style.width = cell.getBoundingClientRect().width + 'px'
    })
    floating.scrollLeft = scroll.scrollLeft
  }
  addEventListener('scroll', place, { passive: true })
  addEventListener('resize', place)
  scroll.addEventListener('scroll', place, { passive: true })

  filter.querySelector('input').addEventListener('input', (event) => {
    const query = event.target.value.trim().toLowerCase()
    let shown = 0
    rows.forEach((row, i) => {
      row.hidden = !texts[i].includes(query)
      if (!row.hidden) shown += 1
    })
    bodies.forEach((body) => {
      body.hidden = !body.querySelector('tr:not(.group):not([hidden])')
    })
    filter.querySelector('output').textContent = count(shown)
    place()
  })
})()
</script>`

/**
 * The crop page's body: the table the app reads, grouped by class. What the app prints beside a
 * figure is in the headers' hovers for the shared notes and on the crop's name for its own
 */
const cropsBody = (table, csl) => {
  const link = (id) => `<a href="./CITATIONS.html#${esc(id)}">${esc(citationLabel(csl, id))}</a>`

  const groupRow = ({ dliClass, name, spec, rows }) => {
    const cites = spec.maxDesignRsrCitations.map(link).join(', ')
    const ceiling = Math.round(spec.maxDesignRsr * 100)
    const floor = spec.minMolM2Day === null ? 'No class floor' : `Class floor ${spec.minMolM2Day}`
    return `<tr class="group"><th colspan="12" id="class-${esc(dliClass)}">${esc(name)}: ${cropCount(rows.length)}. ${floor}, ${classTarget(spec)}, ceiling ${ceiling}% (${cites})</th></tr>`
  }

  // a ceiling's sources show in the row only where they differ from the class's, which the
  // group row already shows
  // a crop with a note of its own carries it on its name, as a hover
  const ownNotes = new Map(
    table.notes.filter((note) => note.number !== null).map((note) => [note.number, note]),
  )
  const cropRow = (row, spec) => {
    const notes = row.noteNumbers.map((n) => ownNotes.get(n))
    const name =
      notes.length === 0
        ? esc(row.name)
        : `<span class="noted" title="${esc(notes.map((note) => `${noteSubject(note)}: ${note.text}`).join('  '))}">${esc(row.name)}</span>`
    const others =
      row.otherNames.length > 0
        ? `<br><span class="dim">${esc(row.otherNames.join(', '))}</span>`
        : ''
    const sources = new Set([
      ...row.lightCitations,
      ...(sameIds(row.ceilingCitations, spec.maxDesignRsrCitations) ? [] : row.ceilingCitations),
      ...row.survivalCitations,
    ])
    const cells = [
      `${name}${others}`,
      `<i>${esc(row.acceptedName)}</i>`,
      esc(row.family),
      `${row.floor}`,
      `${row.targetLow} to ${row.targetHigh}`,
      `${esc(row.lightTier)},&nbsp;${esc(row.lightBasis)}`,
      `${Math.round(row.ceiling * 100)}%`,
      `${esc(row.ceilingTier)},&nbsp;${esc(row.ceilingBasis)}`,
      row.shadeBenefit ? 'in heat' : '',
      maturityText(row.maturity),
      `${row.inRowCm} × ${row.betweenRowsCm} cm`,
      [...sources].map(link).join(', '),
    ]
    return `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`
  }

  const bodies = table.classes.map((entry) =>
    [
      '<tbody>',
      groupRow(entry),
      ...entry.rows.map((row) => cropRow(row, entry.spec)),
      '</tbody>',
    ].join('\n'),
  )

  return `<div class="crops"><p class="note">${esc(STANDING_NOTE)}</p>
<table>
<thead><tr>${HEADERS.map(([text, tip]) => (tip ? `<th title="${esc(tip)}">${esc(text)}</th>` : `<th>${esc(text)}</th>`)).join('')}</tr></thead>
${bodies.join('\n')}
</table>
<h1>Crop light figures</h1>
<p><a href="./crop-light.csv">Download the table as CSV</a>, with the notes included. Curated from USDA and land-grant Extension publications, FAO ECOCROP and FAO Irrigation and Drainage Paper 56 Table 22.</p>
</div>
${FILTER_SCRIPT}`
}

/** Throws on the first `./page.html#id` link in the html to a page with no heading of that id */
const checkLinks = (from, html, idsByPage) => {
  for (const [, file, id] of html.matchAll(/href="\.\/([^"#/]+)#([^"]*)"/g)) {
    if (!idsByPage.get(file)?.has(id))
      throw new Error(`${from} links to ./${file}#${id}, and ${file} has no heading with that id`)
  }
}

const main = async () => {
  const available = new Set(readdirSync(new URL('docs/', ROOT)))
  const missing = PUBLISHED.filter((entry) => !available.has(entry.file))
  if (missing.length > 0)
    throw new Error(
      `docs listed for publication but not present: ${missing.map((e) => e.file).join(', ')}`,
    )
  const names = new Set(PUBLISHED.map((entry) => entry.file))
  const stray = GENERATED.filter((entry) => !names.has(entry.after))
  if (stray.length > 0)
    throw new Error(
      `generated pages placed after a document that isn't published: ${stray.map((e) => e.file).join(', ')}`,
    )

  mkdirSync(OUT, { recursive: true })
  let bytes = 0
  const emit = (name, text) => {
    writeFileSync(new URL(name, OUT), text)
    bytes += Buffer.byteLength(text)
    console.log(`  docs/${name}  ${(Buffer.byteLength(text) / 1e3).toFixed(0)} kB`)
  }

  // each page's heading ids, which the crop page's links into it are checked against
  const idsByPage = new Map()
  for (const entry of PUBLISHED) {
    const source = readFileSync(new URL(`docs/${entry.file}`, ROOT), 'utf8')
    const { html: rendered, ids } = render(source)
    const body = `<p class="note">${esc(STANDING_NOTE)}</p>\n${wrapTables(relink(rendered, names))}`
    const html = page({ title: entry.title, body, home: './', description: entry.blurb })
    const name = entry.file.replace(/\.md$/, '.html')
    idsByPage.set(name, ids)
    emit(name, html)
  }

  const { CROP_ROWS } = await import(new URL('src/data/catalog/rows.ts', ROOT).href)
  const { cropLightTable, cropLightCsv } = await import(
    new URL('src/data/crop-light-table.ts', ROOT).href
  )
  const table = cropLightTable(CROP_ROWS)
  const csl = new Map(
    JSON.parse(readFileSync(new URL('docs/CITATIONS.csl.json', ROOT), 'utf8')).map((item) => [
      item.id,
      item,
    ]),
  )
  const registry = JSON.parse(readFileSync(new URL('docs/CITATIONS.registry.json', ROOT), 'utf8'))
  const cropsHtml = page({
    title: CROPS.title,
    body: wrapTables(cropsBody(table, csl)),
    home: './',
    description: CROPS.blurb,
    aside: sourcesAsOf(table, csl, registry),
  })
  checkLinks(CROPS.file, cropsHtml, idsByPage)
  emit(CROPS.file, cropsHtml)
  emit('crop-light.csv', cropLightCsv(table))

  const listed = PUBLISHED.flatMap((entry) => [
    entry,
    ...GENERATED.filter((generated) => generated.after === entry.file),
  ])
  const list = listed
    .map(
      (entry) =>
        `<li><a href="./${entry.file.replace(/\.md$/, '.html')}">${esc(entry.title)}</a><p>${esc(entry.blurb)}</p></li>`,
    )
    .join('\n        ')
  const index = page({
    title: 'How this works, and where the numbers come from',
    home: '/',
    description:
      "The modeling documents behind the Agrivoltaic Garden Planner: what it computes, what each figure rests on, and which claims it can't yet source.",
    body: `<h1>How this works, and where the numbers come from</h1>
      <p class="note">${esc(STANDING_NOTE)}</p>
      <p>The Agrivoltaic Garden Planner computes the light a solar array leaves on the ground of a
      garden at a real address, and ranks crops against what it measures there. These are the
      documents behind it. Claims the project can't source are listed as gaps in the citation
      corpus.</p>
      <ul class="index">
        ${list}
      </ul>
      <p><a href="/">Open the tool</a>. No sign-up, nothing stored on a server.</p>`,
  })
  writeFileSync(new URL('index.html', OUT), index)
  bytes += Buffer.byteLength(index)
  console.log(
    `docs/index.html written; ${String(listed.length)} documents, ${(bytes / 1e3).toFixed(0)} kB total`,
  )
}

await main()
