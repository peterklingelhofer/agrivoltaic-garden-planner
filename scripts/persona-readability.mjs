// Flesch-Kincaid grade and hard-word share for the text dumps the driver saved.
//   node scripts/persona-readability.mjs <file.json|file.txt>...   (json: reads visibleText regions and `note`)
import { readFileSync } from 'node:fs'

const syllables = (word) => {
  const w = word.toLowerCase().replace(/[^a-z]/g, '')
  if (w.length <= 3) return w.length === 0 ? 0 : 1
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
  const groups = stripped.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

export const score = (text) => {
  const clean = text.replace(/\|/g, '. ').replace(/\s+/g, ' ').trim()
  const sentences = clean.split(/(?<=[.!?:])\s+(?=[A-Z0-9"'(])/).filter((s) => /[a-z]/i.test(s))
  const words = clean.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []
  if (words.length === 0) return null
  const syl = words.reduce((t, w) => t + syllables(w), 0)
  const hard = words.filter(
    (w) =>
      syllables(w) >= 3 &&
      !/^(everything|anything|another|already|together|whatever|whichever|electricity)$/i.test(w),
  )
  const wps = words.length / Math.max(1, sentences.length)
  const spw = syl / words.length
  const fk = 0.39 * wps + 11.8 * spw - 15.59
  const freq = new Map()
  for (const w of hard) freq.set(w.toLowerCase(), (freq.get(w.toLowerCase()) ?? 0) + 1)
  const hardest = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([w]) => w)
  return {
    words: words.length,
    sentences: sentences.length,
    wordsPerSentence: Number(wps.toFixed(1)),
    fkGrade: Number(fk.toFixed(1)),
    hardWordShare: Number(((hard.length / words.length) * 100).toFixed(1)),
    hardest,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const file of process.argv.slice(2)) {
    const raw = readFileSync(file, 'utf8')
    let regions = {}
    if (file.endsWith('.json')) {
      const d = JSON.parse(raw)
      regions = { ...(d.visibleText ?? {}) }
      if (d.note) regions.note = d.note
    } else regions = { text: raw }
    for (const [region, text] of Object.entries(regions)) {
      const s = score(text)
      if (s) console.log(JSON.stringify({ file: file.split('/').slice(-1)[0], region, ...s }))
    }
  }
}
