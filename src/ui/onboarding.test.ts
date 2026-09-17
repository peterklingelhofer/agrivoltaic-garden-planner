import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'bun:test'
import { Glob } from 'bun'
import { OBJECTIVE_PRESETS } from '../state/onboarding'
import { designScenarioFixture } from '../state/testkit'
import {
  AMBITION_OPTIONS,
  ANSWER_QUESTIONS,
  beatenBy,
  beatenSentence,
  EXPERIENCE_OPTIONS,
  EXPOSURE_OPTIONS,
  feetToMetres,
  formatAreaBothUnits,
  formatBothUnits,
  metresToFeet,
  MOUNTING_OPTIONS,
  NOT_A_DETERMINATION,
  OBJECTIVE_LABELS,
  CONFIDENCE_CEILING,
  PORTFOLIO_NOTE,
  QUALITY_HELP,
  QUALITY_LABEL,
  roundTenth,
  SCOPE_STATEMENT,
  showsFigures,
  STEP_COPY,
  clearanceNote,
  cropSentence,
  groundLightNote,
  lightLeftSentence,
  shadeBudgetNote,
} from './onboarding'
import type { Fraction } from '../types/units'
import { fraction } from '../types/units'
import type { ScenarioFlags } from '../types/onboarding'

const MODULES: Record<string, string> = {}
for (const path of new Glob('src/ui/*.tsx').scanSync('.')) {
  MODULES[`/${path}`] = readFileSync(path, 'utf8')
}

describe('metres and feet, neither forced on anyone', () => {
  it('round-trips both ways, exactly, at the 1959 international foot', () => {
    expect(feetToMetres(1)).toBeCloseTo(0.3048, 12)
    for (const metres of [0.5, 1, 2.4, 6, 8, 12.7, 30]) {
      expect(feetToMetres(metresToFeet(metres)), `${String(metres)} m`).toBeCloseTo(metres, 12)
    }
    for (const feet of [2, 6.5, 20, 26.2, 100]) {
      expect(metresToFeet(feetToMetres(feet)), `${String(feet)} ft`).toBeCloseTo(feet, 12)
    }
  })

  it('survives the rounding the fields display, so a typed figure comes back unchanged', () => {
    for (const feet of [2, 6.5, 12.5, 20, 26.2, 100]) {
      // what the field does: feet in, metres stored, feet redisplayed at one decimal
      expect(roundTenth(metresToFeet(feetToMetres(feet))), `${String(feet)} ft`).toBe(feet)
    }
    for (const metres of [0.5, 1.2, 6, 8.4, 30]) {
      expect(roundTenth(feetToMetres(roundTenth(metresToFeet(metres))))).toBeCloseTo(metres, 1)
    }
  })

  it('prints both units together rather than making anyone convert', () => {
    expect(formatBothUnits(6)).toBe('6.0 m (19.7 ft)')
    expect(formatAreaBothUnits(48)).toBe('48.0 m² (517 sq ft)')
  })
})

/**
 * The wall this wizard exists to remove. A question a novice cannot answer without reading
 * a paper is not a question, it is a quiz, and the mapping from an answer onto tilt, pitch,
 * ground cover ratio, clearance and DLI is the engine's job rather than the grower's
 */
const JARGON =
  /\b(tilt|pitch|azimuth|ground cover ratio|gcr|dli|daily light integral|rsr|shade ratio|albedo|bifacial|land equivalent ratio|ler|irradiance|insolation|photovoltaic|agrivoltaic|clearance|homogeneity|tracker|inverter|nameplate|kwp)\b/i

const copyOf = (): readonly (readonly [string, string])[] => [
  ...Object.entries(STEP_COPY).flatMap(
    ([step, copy]) =>
      [
        [`${step} title`, copy.title],
        [`${step} help`, copy.help],
      ] as const,
  ),
  ...[...AMBITION_OPTIONS, ...EXPOSURE_OPTIONS, ...MOUNTING_OPTIONS, ...EXPERIENCE_OPTIONS].flatMap(
    (option) =>
      [
        [`${option.value} label`, option.label],
        [`${option.value} help`, option.help ?? ''],
      ] as const,
  ),
  ...OBJECTIVE_PRESETS.flatMap(
    (preset) =>
      [
        [`${preset.id} label`, preset.label],
        [`${preset.id} help`, preset.help],
      ] as const,
  ),
  ...Object.entries(OBJECTIVE_LABELS).map(([key, label]) => [`objective ${key}`, label] as const),
  // the questions the steps label their own controls from, which the sweep below does not see
  // in the panel source: they are a table, quoted wherever an answer is reported back
  ...Object.entries(ANSWER_QUESTIONS).map(([field, text]) => [`question ${field}`, text] as const),
]

/** Every label, legend and placeholder the questions put in front of someone being asked */
const promptsInSource = (): readonly (readonly [string, string])[] => {
  // the questions live in two files: what to grow and what the space is for on the wants step,
  // the rest beside the steps that ask them
  const source = `${MODULES['/src/ui/AnswerPanels.tsx'] ?? ''}\n${MODULES['/src/ui/WantsPanel.tsx'] ?? ''}`
  expect(source.length, 'the questions source was not found').toBeGreaterThan(0)
  return [...source.matchAll(/\b(label|legend|placeholder)="([^"]+)"/g)].map(
    (match) => [`${String(match[1])}="${String(match[2])}"`, String(match[2])] as const,
  )
}

describe('every question is answerable without knowing any agrivoltaics', () => {
  it('keeps the jargon out of the questions and their answers', () => {
    for (const [where, text] of copyOf()) expect(text, where).not.toMatch(JARGON)
  })

  it('keeps the jargon out of every field the questions label', () => {
    const prompts = promptsInSource()
    expect(prompts.length).toBeGreaterThan(4)
    for (const [where, text] of prompts) expect(text, where).not.toMatch(JARGON)
  })

  it('asks for a growing ambition rather than a shade tolerance', () => {
    expect(STEP_COPY.growing.title).toMatch(/grow/i)
    expect(AMBITION_OPTIONS.map((option) => option.value)).toEqual([
      'leafy-and-herbs',
      'mixed-vegetables',
      'fruiting-and-berries',
    ])
  })

  it('asks whether the space can be watered rather than whether it is water-limited', () => {
    expect(ANSWER_QUESTIONS.irrigationAvailable).toMatch(/water it through a dry spell/i)
    const source = MODULES['/src/ui/AnswerPanels.tsx'] ?? ''
    // asked from the table rather than from a second copy of the sentence in the panel
    expect(source).toMatch(/ANSWER_QUESTIONS\.irrigationAvailable/)
    expect(source).not.toMatch(/water[- ]limit/i)
  })
})

/**
 * The names say what a design tries for and the figures say what it got, and on a real plot an
 * "Energy first" kept more daylight than "Balanced" and made more electricity. A card beaten
 * on both counts says so on its face, and the suggested one says why it is still marked
 */
describe('a layout beaten on both figures says so', () => {
  const withFigures = (
    archetype: Parameters<typeof designScenarioFixture>[0],
    shade: number,
    kwh: number,
  ) => {
    const base = designScenarioFixture(archetype)
    return {
      ...base,
      light: { ...base.light, meanShadeRatio: fraction(shade) },
      production: { ...base.production, annualAcKwh: kwh as typeof base.production.annualAcKwh },
    }
  }
  const balanced = withFigures('balanced', 0.08, 97_000)
  const energy = withFigures('energy-first', 0.05, 140_000)
  const food = withFigures('food-first', 0.02, 61_000)
  const control = withFigures('no-array-control', 0, 0)
  const all = [balanced, energy, food, control]

  it('finds the layouts with panels that keep as much daylight and make as much power', () => {
    expect(beatenBy(balanced, all).map((entry) => entry.candidate.archetype)).toEqual([
      'energy-first',
    ])
    // the open sky keeps every point of daylight and never counts: it makes nothing
    expect(beatenBy(food, all)).toEqual([])
    expect(beatenBy(energy, all)).toEqual([])
  })

  it('needs a clear margin on one figure, not a rounding difference', () => {
    const near = withFigures('vertical-east-west', 0.08, 97_500)
    expect(beatenBy(balanced, [balanced, near])).toEqual([])
    expect(
      beatenBy(balanced, [balanced, withFigures('vertical-east-west', 0.08, 103_000)]),
    ).toHaveLength(1)
  })

  it('says why the suggested one is still marked', () => {
    expect(beatenSentence([], false, [])).toBeNull()
    expect(beatenSentence([energy], false, [])).toMatch(
      /^A layout: energy-first keeps as much daylight/,
    )
    expect(beatenSentence([energy], true, ['energy-first'])).toMatch(
      /too close to call, so the layout named for what you asked for won/,
    )
    expect(beatenSentence([energy], true, [])).toMatch(/counts shade/)
  })
})

describe('progressive disclosure hides detail and never a caveat', () => {
  it('shows the figures only to whoever asked for them', () => {
    expect(showsFigures('novice')).toBe(false)
    expect(showsFigures('some')).toBe(false)
    expect(showsFigures('experienced')).toBe(true)
  })

  it('says plainly how much of today light each layout leaves behind', () => {
    expect(lightLeftSentence(0 as Fraction)).toMatch(/100%/)
    expect(lightLeftSentence(0.32 as Fraction)).toMatch(/68%/)
    expect(cropSentence(24, 3, false)).toMatch(/24/)
    expect(cropSentence(24, 3, false)).toMatch(/3/)
    // the crops lost are what the panels cost, measured against the open sky that is baked first
    expect(cropSentence(24, 3, false)).toMatch(/open sky/i)
    expect(cropSentence(27, 0, true)).toMatch(/as it stands today/i)
    expect(cropSentence(27, 0, true)).not.toMatch(/\b0\b/)
  })

  it('never lets the land figure read as a multiple of anyone harvest', () => {
    expect(PORTFOLIO_NOTE).toMatch(/doesn't mean four times the food/i)
    expect(PORTFOLIO_NOTE).toMatch(/basket/i)
  })

  it('never presents a confidence scale that implies high is reachable', () => {
    expect(CONFIDENCE_CEILING).toMatch(/no higher than moderate/i)
  })

  it('labels a preview as a preview and never as the final word', () => {
    expect(QUALITY_LABEL.preview).toMatch(/preview/i)
    expect(QUALITY_HELP.preview).toMatch(/before you build from it/i)
    expect(QUALITY_LABEL.final).not.toMatch(/preview/i)
  })
})

describe('nothing the results render reads as a determination', () => {
  const FORBIDDEN =
    /\b(compliant|non-?compliant|pass|passes|passed|fail|failed|fails|approved|rejected)\b/i

  const flags = (meets: boolean, measuredRatio = 0.18): ScenarioFlags => ({
    meetsExpeditedClearance: meets,
    fiftyPercentEverywhere: meets,
    shade: {
      maxRatio: fraction(0.3),
      measuredRatio: fraction(measuredRatio),
      withinBudget: measuredRatio <= 0.3,
    },
    notes: [],
  })

  it('uses estimate language for both outcomes of both parameters', () => {
    for (const meets of [true, false]) {
      expect(clearanceNote(flags(meets))).not.toMatch(FORBIDDEN)
      expect(groundLightNote(flags(meets))).not.toMatch(FORBIDDEN)
    }
    expect(clearanceNote(flags(true))).toMatch(/fast-track rules for growing under panels/i)
    expect(groundLightNote(flags(false))).toMatch(/exception request/i)
  })

  /**
   * Whose rules, and what kind of rules. A term of art with no owner, on the card being chosen
   * between, leaves a first-time grower unable to tell a law from a grant scheme from this tool's
   * own opinion, and measures a grower outside Massachusetts against a Massachusetts yardstick
   * without saying which one. Both outcomes name the owner, because the one that says an exception
   * would be needed is the one that raises the question
   */
  it('names whose parameters these are, in both outcomes, in plain words as well', () => {
    for (const meets of [true, false]) {
      const note = clearanceNote(flags(meets))
      expect(note).toMatch(/massachusetts/i)
      expect(note).toMatch(/fast-track/i)
      // and the regime's own name survives, because that is the half that would be quoted or looked up
      expect(note).toMatch(/fast-track rules for growing under panels/i)
    }
  })

  /**
   * The per-card caveat, which was exact and opaque: "the geometry" is the shapes and the sun, and
   * "the programme" read as this software rather than as the scheme whose rules are quoted above
   * it. The phrase that matters if it is ever quoted back lives in the app-wide caveat instead, so
   * it has to survive there
   */
  it('keeps the words that matter in the caveat while saying it in plain ones', () => {
    expect(NOT_A_DETERMINATION).not.toMatch(FORBIDDEN)
    expect(NOT_A_DETERMINATION).not.toMatch(/geometry/i)
    expect(SCOPE_STATEMENT).toMatch(/determination/i)
  })

  /**
   * The shade budget is the grower's own answer, not a regime, so going over it is a plain
   * statement rather than a determination. Both numbers are named either way, because the case
   * worth explaining is a footprint sized inside the budget whose measured shade came out over
   */
  it('names both numbers whether the shade lands inside the budget or outside it', () => {
    const inside = shadeBudgetNote(flags(true, 0.18))
    const over = shadeBudgetNote(flags(true, 0.42))
    for (const note of [inside, over]) {
      expect(note).not.toMatch(FORBIDDEN)
      expect(note).toContain('30%')
    }
    expect(inside).toContain('18%')
    expect(inside).toMatch(/within/i)
    expect(over).toContain('42%')
    expect(over).toMatch(/more than the 30% the plants you asked for can tolerate/i)
    // and it says how a footprint sized inside the budget still ended up over it
    expect(over).toMatch(/footprint/i)
  })

  it('never lets the results view claim a determination in any string it renders', () => {
    const source = MODULES['/src/ui/ScenarioComparison.tsx'] ?? ''
    expect(source.length).toBeGreaterThan(0)
    for (const text of source.matchAll(/>([^<>{}]{8,})</g)) {
      expect(String(text[1]).trim(), String(text[1])).not.toMatch(FORBIDDEN)
    }
  })
})
