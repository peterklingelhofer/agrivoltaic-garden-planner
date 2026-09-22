/**
 * Renders the science and provenance documents into `dist/docs/` as part of the build.
 *
 *   node scripts/render-docs.mjs        # after `vite build`, so `dist/` exists
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

const SITE_TITLE = 'Agrivoltaic Garden Model'

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
:root { color-scheme: light dark; --ink:#16281f; --dim:#4a5d54; --bg:#fbfaf7; --panel:#fff; --line:#d9e0da; --link:#1c5f43; --code:#f0efe9 }
@media (prefers-color-scheme: dark) {
  :root { --ink:#e6ece8; --dim:#a3b3aa; --bg:#131714; --panel:#1a201c; --line:#2c3630; --link:#7fc9a5; --code:#222a25 }
}
* { box-sizing: border-box }
body { margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.65 ui-serif, Georgia, "Times New Roman", serif; }
.wrap { max-width: 46rem; margin:0 auto; padding: 2rem 1.25rem 6rem }
header.site { border-bottom:1px solid var(--line); margin-bottom:2rem; padding-bottom:1rem }
header.site a { color:var(--dim); text-decoration:none; font:600 0.8rem/1.4 ui-sans-serif, system-ui, sans-serif;
  letter-spacing:0.06em; text-transform:uppercase }
h1,h2,h3,h4 { font-family: ui-sans-serif, system-ui, sans-serif; line-height:1.25; margin:2.2rem 0 0.7rem }
h1 { font-size:1.9rem; margin-top:0 } h2 { font-size:1.35rem } h3 { font-size:1.1rem } h4 { font-size:1rem }
a { color:var(--link) }
p, li { overflow-wrap:break-word }
code { background:var(--code); padding:0.1em 0.35em; border-radius:3px;
  font:0.87em/1.5 ui-monospace, SFMono-Regular, Menlo, monospace }
pre { background:var(--code); padding:0.9rem 1rem; border-radius:6px; overflow-x:auto }
pre code { background:none; padding:0 }
blockquote { margin:1.2rem 0; padding:0.1rem 0 0.1rem 1rem; border-left:3px solid var(--line); color:var(--dim) }
/* wide tables scroll in their own box; the page itself must never scroll sideways */
.table-scroll { overflow-x:auto; margin:1.2rem 0; border:1px solid var(--line); border-radius:6px }
table { border-collapse:collapse; width:100%; font:0.86rem/1.5 ui-sans-serif, system-ui, sans-serif }
th, td { border-bottom:1px solid var(--line); padding:0.5rem 0.7rem; text-align:left; vertical-align:top }
th { background:var(--panel); font-weight:650; white-space:nowrap }
hr { border:0; border-top:1px solid var(--line); margin:2.5rem 0 }
.note { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:0.9rem 1.1rem;
  font:0.9rem/1.6 ui-sans-serif, system-ui, sans-serif; color:var(--dim); margin:0 0 2rem }
.index { list-style:none; padding:0; margin:2rem 0 0 }
.index li { border-top:1px solid var(--line); padding:1rem 0 }
.index a { font:650 1.05rem/1.4 ui-sans-serif, system-ui, sans-serif; text-decoration:none }
.index a:hover { text-decoration:underline }
.index p { margin:0.3rem 0 0; color:var(--dim); font:0.92rem/1.55 ui-sans-serif, system-ui, sans-serif }
`

const page = ({ title, body, home, description }) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} | ${esc(SITE_TITLE)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:type" content="article" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <style>${STYLE}</style>
  </head>
  <body>
    <div class="wrap">
      <header class="site"><a href="${home}">${esc(SITE_TITLE)}</a></header>
      ${body}
    </div>
  </body>
</html>
`

/** GitHub-flavored, because every table in these documents is a GFM table */
marked.setOptions({ gfm: true, breaks: false })

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
  html
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>')

const main = () => {
  const available = new Set(readdirSync(new URL('docs/', ROOT)))
  const missing = PUBLISHED.filter((entry) => !available.has(entry.file))
  if (missing.length > 0)
    throw new Error(
      `docs listed for publication but not present: ${missing.map((e) => e.file).join(', ')}`,
    )
  const names = new Set(PUBLISHED.map((entry) => entry.file))

  mkdirSync(OUT, { recursive: true })
  let bytes = 0
  for (const entry of PUBLISHED) {
    const source = readFileSync(new URL(`docs/${entry.file}`, ROOT), 'utf8')
    const body = `<p class="note">${esc(STANDING_NOTE)}</p>\n${wrapTables(relink(marked.parse(source), names))}`
    const html = page({ title: entry.title, body, home: './', description: entry.blurb })
    const name = entry.file.replace(/\.md$/, '.html')
    writeFileSync(new URL(name, OUT), html)
    bytes += Buffer.byteLength(html)
    console.log(`  docs/${name}  ${(Buffer.byteLength(html) / 1e3).toFixed(0)} kB`)
  }

  const list = PUBLISHED.map(
    (entry) =>
      `<li><a href="./${entry.file.replace(/\.md$/, '.html')}">${esc(entry.title)}</a><p>${esc(entry.blurb)}</p></li>`,
  ).join('\n        ')
  const index = page({
    title: 'How this works, and where the numbers come from',
    home: '/',
    description:
      "The modeling documents behind the Agrivoltaic Garden Model: what it computes, what each figure rests on, and which claims it can't yet source.",
    body: `<h1>How this works, and where the numbers come from</h1>
      <p class="note">${esc(STANDING_NOTE)}</p>
      <p>The Agrivoltaic Garden Model computes the light a solar array leaves on the ground of a
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
    `docs/index.html written; ${String(PUBLISHED.length)} documents, ${(bytes / 1e3).toFixed(0)} kB total`,
  )
}

main()
