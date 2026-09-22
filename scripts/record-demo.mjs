#!/usr/bin/env node
/**
 * Records the explainer film, then makes it watchable.
 *
 * Two steps, kept apart on purpose. Playwright drives the app and screencasts the page, which
 * gives a silent VP8 WebM with variable frame timing: correct, and the wrong thing to attach to
 * an email. ffmpeg then normalizes it to constant-rate H.264 in an MP4 that plays everywhere,
 * including inside the mail clients and slide decks this is actually going to be opened in.
 *
 * The captions are already burned into the picture, because they're drawn into the page before
 * the screencast sees it. The SRT written beside the video is therefore the voiceover script,
 * with the timecode of every line, so a narration can be recorded over the finished cut without
 * anybody having to guess where a sentence starts.
 *
 * Nothing here is a build dependency. ffmpeg is invoked from the host and Playwright is already
 * a devDependency. The app itself never learns this file exists
 *
 * Usage:
 *   bun run demo                 both cuts, recorded and encoded
 *   bun run demo --cut=short     just the short one
 *   bun run demo --encode-only   re-encode whatever was last recorded
 *   bun run demo --share-only    just rebuild the under-25 MB copies from the finished MP4s
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'demo')
const CUTS = ['short', 'full']
/** The test titles in `e2e/demo/demo.spec.ts`, which is how one cut is recorded without the other */
const TITLE = { short: 'the short cut', full: 'the full walkthrough' }

const args = process.argv.slice(2)
const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? null
const has = (name) => args.includes(`--${name}`)

/**
 * Quality, as a constant-rate factor. 20 is visually transparent and produced a 97 MB file for
 * under six minutes, which is past what most people can put in an email. 23 is close to half
 * that and the UI text still reads cleanly, because almost every frame of this is static
 */
const crf = Number(flag('crf') ?? 23)

/**
 * The hard gate the share copy has to clear, in megabytes. Discord's limit without Nitro
 */
const SHARE_LIMIT_MB = 20

/**
 * What the encoder actually aims at.
 *
 * Under the limit by a megabyte and a half, because two-pass rate control governs only the video
 * stream: MP4 headers, the audio track and muxing overhead all land on top
 * of the number given to x264. A file that comes out at 20.1 MB is exactly as useless as one at
 * 104, so the headroom isn't fussiness
 */
const SHARE_MB = Number(flag('share-mb') ?? SHARE_LIMIT_MB - 1.5)

const wanted = flag('cut') === null ? CUTS : [flag('cut')]
for (const cut of wanted) {
  if (!CUTS.includes(cut)) {
    console.error(`unknown cut "${cut}": expected one of ${CUTS.join(', ')}`)
    process.exit(1)
  }
}

/** Runs a command and hands back its stdout, for the ones that are asked a question */
const capture = (command, commandArgs) => {
  const result = spawnSync(command, commandArgs, { cwd: ROOT, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

const run = (command, commandArgs, env = {}) => {
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    console.error(`\n${command} exited with ${String(result.status ?? 'a signal')}`)
    process.exit(result.status ?? 1)
  }
}

/* --------------------------------- the recording --------------------------------- */

// `share-only` skips the camera too, and has to be named here as well as where it's
// handled: the guard below is what decides whether a fifteen-minute recording happens, and a
// flag that meant "just re-encode" but was only read afterward started a full re-record
if (!has('encode-only') && !has('share-only')) {
  mkdirSync(OUT, { recursive: true })
  const select = wanted.length === 1 ? ['-g', TITLE[wanted[0]]] : []
  console.log(`\nRecording ${wanted.join(' and ')} against live upstreams. This takes a while.\n`)
  run('bunx', ['playwright', 'test', '--project=demo', ...select], { DEMO: '1' })
}

/* ------------------------------------ the cut ------------------------------------ */

/** How Playwright slugs each test title into a directory name under `outputDir` */
const SLUG = { short: 'the-short-cut', full: 'the-full-walkthrough' }

/**
 * This cut's screencast. The timeline records the path, and the search below is the backstop.
 *
 * The backstop is narrowed to THIS cut's directory and refuses to guess between candidates: when
 * both cuts are recorded in a single run, taking the first match hands the same webm to both
 * encodes and ships one film twice. A wrong film is worse than no film, so an ambiguous match is an
 * error
 */
const findVideo = (timeline, cut) => {
  if (typeof timeline.video === 'string' && existsSync(timeline.video)) return timeline.video
  const raw = join(OUT, 'raw')
  if (!existsSync(raw)) return null
  const found = readdirSync(raw, { recursive: true })
    .map((entry) => join(raw, String(entry)))
    .filter((path) => path.endsWith('.webm') && path.includes(SLUG[cut]))
  if (found.length > 1) {
    console.error(`several screencasts match the ${cut} cut:\n  ${found.join('\n  ')}`)
    process.exit(1)
  }
  return found[0] ?? null
}

const stamp = (ms) => {
  const total = Math.max(0, Math.round(ms))
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const millis = total % 1000
  const pad = (value, width) => String(value).padStart(width, '0')
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`
}

const srtOf = (cues) =>
  cues
    .map(
      (cue, index) =>
        `${String(index + 1)}\n${stamp(cue.startMs)} --> ${stamp(cue.endMs)}\n${cue.text}\n`,
    )
    .join('\n')

/**
 * The same lines as prose, with the chapters folded back in where they fall.
 *
 * This is the artifact a person actually works from: read it aloud against the finished MP4 and
 * the words land where the picture already went
 */
const scriptOf = (timeline) => {
  const marks = timeline.chapters.map((chapter) => ({ ...chapter, kind: 'chapter' }))
  const lines = timeline.cues.map((cue) => ({ ...cue, kind: 'cue', atMs: cue.startMs }))
  const ordered = [...marks, ...lines].sort((left, right) => left.atMs - right.atMs)
  const body = ordered
    .map((entry) =>
      entry.kind === 'chapter'
        ? `\n## ${stamp(entry.atMs).slice(3, 8)} ${entry.title}\n\n_${entry.subtitle}_\n`
        : `**${stamp(entry.atMs).slice(3, 8)}** ${entry.text}\n`,
    )
    .join('\n')
  const minutes = (timeline.durationMs / 60_000).toFixed(1)
  return [
    `# Agrivoltaic garden model: ${timeline.cut} cut`,
    '',
    `Recorded run, ${minutes} minutes. Every line below is already burned into the picture as a`,
    'caption; the timecodes are here so a voiceover can be laid over the finished file without',
    'recutting it. Regenerate with `bun run demo`.',
    body,
  ].join('\n')
}

/**
 * The share copy: the same film, under the size a chat client will accept.
 *
 * Two-pass encoding, because here the SIZE is the requirement and the quality is whatever fits: CRF
 * hits a look and lets the bytes land where they may, which is the wrong way round when the file
 * has to clear a hard 20 MB gate. Encoded from the finished MP4, so a share copy can be made at any
 * time without re-recording the raw screencast, and 720p because the alternative at these bitrates
 * is 1080p that has been smeared into uselessness. Almost every frame is a still UI, so the rate
 * control spends its budget on the few seconds of camera movement, which is where it belongs
 */
const compress = (cut) => {
  const source = join(OUT, `agrivoltaic-designer-${cut}.mp4`)
  if (!existsSync(source)) {
    console.error(`no ${cut} cut to compress: encode it first`)
    process.exit(1)
  }
  const out = join(OUT, `agrivoltaic-designer-${cut}-compressed.mp4`)
  const seconds = Number(
    capture('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      source,
    ]),
  )
  if (!(seconds > 0)) {
    console.error(`couldn't read the duration of ${source}`)
    process.exit(1)
  }
  // the track is silent, so it only has to exist. At 32 kbps that nothing would be 6 percent of the
  // full cut's whole budget, which is real money at this size
  const audioKbps = 16
  const videoKbps = Math.floor((SHARE_MB * 1024 * 1024 * 8) / seconds / 1000) - audioKbps
  const passlog = join(OUT, `.pass-${cut}`)
  const common = [
    '-y',
    '-i',
    source,
    '-vf',
    // 720p and 24 fps. Resolution is what keeps the SIDEBAR readable and costs almost nothing on
    // a static frame, so it's the last thing to give up. Frame rate is what the orbits cost, and
    // dropping a fifth of the frames hands those bits to the ones that are left
    'scale=1280:-2,fps=24,format=yuv420p',
    '-c:v',
    'libx264',
    '-b:v',
    `${String(videoKbps)}k`,
    '-preset',
    'slow',
    '-passlogfile',
    passlog,
  ]
  console.log(
    `\nCompressing the ${cut} cut to under ${String(SHARE_MB)} MB at ${String(videoKbps)} kbps`,
  )
  run('ffmpeg', [...common, '-pass', '1', '-an', '-f', 'null', '/dev/null'])
  run('ffmpeg', [
    ...common,
    '-pass',
    '2',
    '-c:a',
    'aac',
    '-b:a',
    `${String(audioKbps)}k`,
    '-movflags',
    '+faststart',
    out,
  ])
  for (const leftover of ['-0.log', '-0.log.mbtree'])
    rmSync(`${passlog}${leftover}`, { force: true })
  const megabytes = statSync(out).size / 1024 / 1024
  console.log(`  ${out.slice(OUT.length + 1)}: ${megabytes.toFixed(1)} MB`)
  // checked out loud, because the only thing this file has to do is be small
  if (megabytes > SHARE_LIMIT_MB) {
    console.error(
      `  WARNING: over the ${String(SHARE_LIMIT_MB)} MB limit by ${(megabytes - SHARE_LIMIT_MB).toFixed(1)} MB`,
    )
  }
}

if (has('share-only')) {
  for (const cut of wanted) compress(cut)
  console.log(`\nDone. Everything is in ${OUT}, which is gitignored.\n`)
  process.exit(0)
}

for (const cut of wanted) {
  const timelinePath = join(OUT, `timeline-${cut}.json`)
  if (!existsSync(timelinePath)) {
    console.error(`no timeline for the ${cut} cut: record it first with bun run demo --cut=${cut}`)
    process.exit(1)
  }
  const timeline = JSON.parse(readFileSync(timelinePath, 'utf8'))
  const source = findVideo(timeline, cut)
  if (source === null) {
    console.error(`no video found for the ${cut} cut`)
    process.exit(1)
  }

  const mp4 = join(OUT, `agrivoltaic-designer-${cut}.mp4`)
  console.log(`\nEncoding the ${cut} cut -> ${mp4}`)
  run('ffmpeg', [
    '-y',
    '-i',
    source,
    // a silent stereo track. The film has no narration, and a video-only MP4 is the kind of
    // file that a mail client or a slide deck decides isn't a video at all
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=stereo',
    '-shortest',
    // constant rate, because the screencast's timing isn't, and a variable-rate WebM scrubs
    // badly in exactly the players this is going to be scrubbed in
    '-vf',
    'fps=30,format=yuv420p',
    '-c:v',
    'libx264',
    '-crf',
    String(crf),
    '-preset',
    'slow',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    mp4,
  ])

  writeFileSync(join(OUT, `agrivoltaic-designer-${cut}.srt`), srtOf(timeline.cues))
  writeFileSync(join(OUT, `agrivoltaic-designer-${cut}-script.md`), `${scriptOf(timeline)}\n`)
  console.log(
    `  ${String(timeline.cues.length)} caption lines, ${(timeline.durationMs / 60_000).toFixed(1)} minutes`,
  )
  // every run leaves a copy that can actually be sent to somebody. --no-share skips it
  if (!has('no-share')) compress(cut)
}

console.log(`\nDone. Everything is in ${OUT}, which is gitignored.\n`)
