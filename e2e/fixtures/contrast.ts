import type { Locator, Page } from '@playwright/test'

/**
 * A runtime contrast audit.
 *
 * The bug this exists for was `.picker-option:hover` declaring only `background`. It
 * outranks `.picker-option-active` on specificity, and that rule was the one supplying
 * `color`, so hovering the already-active search result painted `--accent-text` on
 * `--bg`: #10241b on #14171b in dark, #ffffff on #f5f6f3 in light, about 1.1:1 both
 * ways. Nothing static can see that. It is a cascade interaction between two rules,
 * resolved through CSS custom properties, that only exists while a pointer is over one
 * particular element in one particular state, and only a real browser computing real
 * styles can report the two colours that actually met.
 *
 * So the audit is a browser-side walk: every element that renders its own text, its
 * resolved `color`, the effective background found by compositing every ancestor
 * background down the chain, and the WCAG 2.1 relative-luminance ratio between them.
 * It runs against whatever state the caller has put the page in, which is the point:
 * rest, hover, focus-visible and active are all just states to audit.
 */

/** WCAG 2.1 SC 1.4.3 */
export const MIN_NORMAL_TEXT = 4.5
/** WCAG 2.1 SC 1.4.3 large text, and SC 1.4.11 for non-text UI boundaries */
export const MIN_LARGE_TEXT = 3

export interface ContrastFinding {
  /** nearest testid, so a failure names something the rest of the suite already greps */
  readonly testId: string
  readonly path: string
  readonly text: string
  readonly foreground: string
  readonly background: string
  readonly ratio: number
  readonly required: number
  readonly fontPx: number
  readonly fontWeight: number
  /** how many elements shared this exact colour pair, class path and threshold */
  readonly count: number
}

export interface ContrastReport {
  readonly checked: number
  readonly violations: readonly ContrastFinding[]
  /** text over a gradient or image, where no single background colour is meaningful */
  readonly unresolved: readonly string[]
}

export interface AuditOptions {
  /** CSS selector to scope the walk; omitted means the whole body */
  readonly within?: string
}

/**
 * Runs in the page. Self-contained by necessity: `page.evaluate` ships the source, not
 * the closure
 */
const audit = ({ within }: { within: string | null }): ContrastReport => {
  interface Rgba {
    r: number
    g: number
    b: number
    a: number
  }

  const parse = (value: string): Rgba | null => {
    const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
    if (!match) return null
    const parts = (match[1] ?? '').split(/[,/\s]+/).filter((part) => part.length > 0)
    const numbers = parts.map((part) =>
      part.endsWith('%') ? Number(part.slice(0, -1)) / 100 : Number(part),
    )
    if (numbers.length < 3 || numbers.some((n) => !Number.isFinite(n))) return null
    return {
      r: numbers[0] as number,
      g: numbers[1] as number,
      b: numbers[2] as number,
      a: numbers.length > 3 ? (numbers[3] as number) : 1,
    }
  }

  const hex = (colour: Rgba): string =>
    `#${[colour.r, colour.g, colour.b]
      .map((v) =>
        Math.round(Math.min(255, Math.max(0, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')}`

  // WCAG 2.1 relative luminance, verbatim
  const channel = (value: number): number => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }

  const luminance = (colour: Rgba): number =>
    0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b)

  const contrast = (one: Rgba, two: Rgba): number => {
    const a = luminance(one)
    const b = luminance(two)
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  }

  const over = (front: Rgba, back: Rgba): Rgba => ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  })

  const chainOf = (element: Element): Element[] => {
    const out: Element[] = []
    let node: Element | null = element
    while (node) {
      out.push(node)
      node = node.parentElement
    }
    return out.reverse()
  }

  interface Backdrop {
    readonly colour: Rgba
    /** every ancestor opacity multiplied together, which is what dims the text */
    readonly opacity: number
    readonly imaged: boolean
  }

  /**
   * The effective background: composite every ancestor's background-color from the root
   * down, each scaled by the opacity applied to it and everything above it. A gradient
   * still visible behind the text means no single colour is the background, and the
   * element is reported as unresolved rather than guessed at.
   *
   * "Still visible" is the whole subtlety. A fully opaque background-color hides
   * everything painted before it, gradients included, so it clears the flag; a
   * background-image on the same element paints over that colour, so it sets it again.
   * Without the reset, every panel drawn over the canvas host is unresolvable, because
   * that host carries the pre-paint sky gradient no matter what is stacked on top of it
   */
  const backdropOf = (element: Element): Backdrop => {
    const chain = chainOf(element)
    const styles = chain.map((node) => getComputedStyle(node))
    const cumulative: number[] = []
    let running = 1
    for (const style of styles) {
      const own = Number(style.opacity)
      running *= Number.isFinite(own) ? own : 1
      cumulative.push(running)
    }
    let accumulated: Rgba = { r: 255, g: 255, b: 255, a: 1 }
    let imaged = false
    for (let index = 0; index < chain.length; index += 1) {
      const style = styles[index] as CSSStyleDeclaration
      const background = parse(style.backgroundColor)
      const alpha = background === null ? 0 : background.a * (cumulative[index] as number)
      if (background !== null && alpha > 0) {
        accumulated = over({ ...background, a: alpha }, accumulated)
        if (alpha === 1) imaged = false
      }
      if (style.backgroundImage !== 'none') imaged = true
    }
    return {
      colour: accumulated,
      opacity: cumulative[cumulative.length - 1] ?? 1,
      imaged,
    }
  }

  const describe = (element: Element): string => {
    const parts: string[] = []
    let node: Element | null = element
    for (let depth = 0; node && depth < 4; depth += 1) {
      const classes = [...node.classList].slice(0, 3).join('.')
      parts.push(classes ? `${node.tagName.toLowerCase()}.${classes}` : node.tagName.toLowerCase())
      node = node.parentElement
    }
    return parts.reverse().join(' > ')
  }

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'OPTION', 'OPTGROUP', 'CANVAS'])

  const visible = (element: Element): boolean => {
    const withChecks = element as Element & {
      checkVisibility?: (options: Record<string, boolean>) => boolean
    }
    if (typeof withChecks.checkVisibility === 'function') {
      if (
        !withChecks.checkVisibility({
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
          checkOpacity: true,
          checkVisibilityCSS: true,
        })
      ) {
        return false
      }
    }
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  const ownText = (element: Element): string => {
    let text = ''
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? ''
    }
    return text.replace(/\s+/g, ' ').trim()
  }

  const root = within ? document.querySelector(within) : document.body
  if (!root) {
    return { checked: 0, violations: [], unresolved: [`no element matched ${String(within)}`] }
  }

  const candidates: Element[] = [root, ...root.querySelectorAll('*')]
  const grouped = new Map<string, ContrastFinding & { count: number }>()
  const unresolved = new Set<string>()
  let checked = 0

  for (const element of candidates) {
    if (SKIP.has(element.tagName)) continue
    const text = ownText(element)
    if (text.length === 0) continue
    // WCAG 1.4.3 exempts text that is part of an inactive control
    if (element.closest(':disabled, [aria-disabled="true"]')) continue
    if (!visible(element)) continue

    const style = getComputedStyle(element)
    const foreground = parse(style.color)
    if (!foreground) continue
    const backdrop = backdropOf(element)
    if (backdrop.imaged) {
      unresolved.add(describe(element))
      continue
    }

    const painted = over({ ...foreground, a: foreground.a * backdrop.opacity }, backdrop.colour)
    const fontPx = Number.parseFloat(style.fontSize)
    const fontWeight = Number(style.fontWeight) || 400
    // WCAG 2.1: large scale is 18pt (24px), or 14pt (18.66px) when bold
    const large = fontPx >= 24 || (fontPx >= 18.66 && fontWeight >= 700)
    const required = large ? 3 : 4.5
    const ratio = contrast(painted, backdrop.colour)
    checked += 1
    if (ratio >= required) continue

    const path = describe(element)
    const key = `${path}|${hex(painted)}|${hex(backdrop.colour)}|${String(required)}`
    const existing = grouped.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    grouped.set(key, {
      testId: element.closest('[data-testid]')?.getAttribute('data-testid') ?? '(no testid)',
      path,
      text: text.slice(0, 60),
      foreground: hex(painted),
      background: hex(backdrop.colour),
      ratio: Math.round(ratio * 100) / 100,
      required,
      fontPx,
      fontWeight,
      count: 1,
    })
  }

  return {
    checked,
    violations: [...grouped.values()].sort((a, b) => a.ratio - b.ratio),
    unresolved: [...unresolved],
  }
}

export const auditContrast = (page: Page, options: AuditOptions = {}): Promise<ContrastReport> =>
  page.evaluate(audit, { within: options.within ?? null })

export const formatFindings = (label: string, report: ContrastReport): string =>
  [
    `${label}: ${String(report.violations.length)} contrast violation(s) over ${String(report.checked)} text elements`,
    ...report.violations.map(
      (finding) =>
        `  ${finding.testId} [${finding.path}] "${finding.text}" ` +
        `${finding.foreground} on ${finding.background} = ${finding.ratio.toFixed(2)}:1 ` +
        `(needs ${String(finding.required)}:1 at ${String(finding.fontPx)}px/${String(finding.fontWeight)}` +
        `${finding.count > 1 ? `, ${String(finding.count)} elements` : ''})`,
    ),
  ].join('\n')

/* ---------------------------------------------------------------------------------- */
/* Focus indicators, WCAG 2.1 SC 1.4.11 and 2.4.7                                       */
/* ---------------------------------------------------------------------------------- */

export interface FocusFinding {
  readonly testId: string
  readonly path: string
  readonly reason: string
  readonly ratio: number | null
}

interface FocusSnapshot {
  readonly probe: number
  readonly testId: string
  readonly path: string
  readonly outlineStyle: string
  readonly outlineWidth: number
  readonly outlineColour: string
  readonly boxShadow: string
  readonly background: string
  readonly border: string
  readonly colour: string
  readonly backdrop: string
}

const TABBABLE =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

/** Tags every tabbable element and records how it looks BEFORE anything has focus */
const markTabbables = ({ selector }: { selector: string }): FocusSnapshot[] => {
  const parse = (value: string): number[] | null => {
    const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
    if (!match) return null
    const parts = (match[1] ?? '').split(/[,/\s]+/).filter((part) => part.length > 0)
    const numbers = parts.map(Number)
    return numbers.length >= 3 && numbers.every((n) => Number.isFinite(n)) ? numbers : null
  }
  const composite = (element: Element): string => {
    let accumulated = [255, 255, 255]
    let node: Element | null = element.parentElement
    const chain: Element[] = []
    while (node) {
      chain.push(node)
      node = node.parentElement
    }
    for (const ancestor of chain.reverse()) {
      const rgba = parse(getComputedStyle(ancestor).backgroundColor)
      if (!rgba) continue
      const alpha = rgba.length > 3 ? (rgba[3] as number) : 1
      if (alpha === 0) continue
      accumulated = accumulated.map(
        (value, index) => (rgba[index] as number) * alpha + value * (1 - alpha),
      )
    }
    return `rgb(${accumulated.map((v) => Math.round(v)).join(', ')})`
  }
  const describe = (element: Element): string => {
    const classes = [...element.classList].slice(0, 3).join('.')
    return classes ? `${element.tagName.toLowerCase()}.${classes}` : element.tagName.toLowerCase()
  }
  const out: FocusSnapshot[] = []
  let probe = 0
  for (const element of document.querySelectorAll(selector)) {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    const style = getComputedStyle(element)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    element.setAttribute('data-focus-probe', String(probe))
    out.push({
      probe,
      testId: element.getAttribute('data-testid') ?? '(no testid)',
      path: describe(element),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
      outlineColour: style.outlineColor,
      boxShadow: style.boxShadow,
      background: style.backgroundColor,
      border: `${style.borderColor} ${style.borderWidth} ${style.borderStyle}`,
      colour: style.color,
      backdrop: composite(element),
    })
    probe += 1
  }
  return out
}

const readFocused = (): FocusSnapshot | null => {
  const element = document.activeElement
  if (!element || element === document.body || !(element instanceof HTMLElement)) return null
  const probe = element.getAttribute('data-focus-probe')
  if (probe === null) return null
  const parse = (value: string): number[] | null => {
    const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
    if (!match) return null
    const parts = (match[1] ?? '').split(/[,/\s]+/).filter((part) => part.length > 0)
    const numbers = parts.map(Number)
    return numbers.length >= 3 && numbers.every((n) => Number.isFinite(n)) ? numbers : null
  }
  const composite = (node: Element): string => {
    let accumulated = [255, 255, 255]
    const chain: Element[] = []
    let walker: Element | null = node.parentElement
    while (walker) {
      chain.push(walker)
      walker = walker.parentElement
    }
    for (const ancestor of chain.reverse()) {
      const rgba = parse(getComputedStyle(ancestor).backgroundColor)
      if (!rgba) continue
      const alpha = rgba.length > 3 ? (rgba[3] as number) : 1
      if (alpha === 0) continue
      accumulated = accumulated.map(
        (value, index) => (rgba[index] as number) * alpha + value * (1 - alpha),
      )
    }
    return `rgb(${accumulated.map((v) => Math.round(v)).join(', ')})`
  }
  const describe = (target: Element): string => {
    const classes = [...target.classList].slice(0, 3).join('.')
    return classes ? `${target.tagName.toLowerCase()}.${classes}` : target.tagName.toLowerCase()
  }
  const style = getComputedStyle(element)
  return {
    probe: Number(probe),
    testId: element.getAttribute('data-testid') ?? '(no testid)',
    path: describe(element),
    outlineStyle: style.outlineStyle,
    outlineWidth: Number.parseFloat(style.outlineWidth) || 0,
    outlineColour: style.outlineColor,
    boxShadow: style.boxShadow,
    background: style.backgroundColor,
    border: `${style.borderColor} ${style.borderWidth} ${style.borderStyle}`,
    colour: style.color,
    backdrop: composite(element),
  }
}

const rgbaOf = (value: string): { r: number; g: number; b: number; a: number } | null => {
  const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim())
  if (!match) return null
  const parts = (match[1] ?? '').split(/[,/\s]+/).filter((part) => part.length > 0)
  const numbers = parts.map(Number)
  if (numbers.length < 3 || numbers.some((n) => !Number.isFinite(n))) return null
  return {
    r: numbers[0] as number,
    g: numbers[1] as number,
    b: numbers[2] as number,
    a: numbers.length > 3 ? (numbers[3] as number) : 1,
  }
}

const relativeLuminance = (colour: { r: number; g: number; b: number }): number => {
  const channel = (value: number): number => {
    const srgb = value / 255
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(colour.r) + 0.7152 * channel(colour.g) + 0.0722 * channel(colour.b)
}

export const contrastOf = (one: string, two: string): number | null => {
  const a = rgbaOf(one)
  const b = rgbaOf(two)
  if (!a || !b) return null
  const flatten = (front: typeof a, back: typeof b): typeof a => ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  })
  const top = relativeLuminance(flatten(a, b))
  const bottom = relativeLuminance(b)
  return (Math.max(top, bottom) + 0.05) / (Math.min(top, bottom) + 0.05)
}

/**
 * Tabs through every focusable control and checks that focus is both VISIBLE and
 * distinguishable. Something must change when a control takes focus, and whatever
 * changes must clear 3:1 against what it sits on, which is the same failure mode as the
 * picker bug: a state that repaints one property and leaves the rest of the pair behind
 */
export const auditFocusIndicators = async (
  page: Page,
  steps: number,
): Promise<readonly FocusFinding[]> => {
  const before = await page.evaluate(markTabbables, { selector: TABBABLE })
  const unfocused = new Map(before.map((entry) => [entry.probe, entry]))
  const findings: FocusFinding[] = []
  const visited = new Set<number>()

  await page.evaluate(() => {
    document.body.focus()
    ;(document.activeElement as HTMLElement | null)?.blur()
  })

  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(readFocused)
    if (!focused) continue
    if (visited.has(focused.probe)) break
    visited.add(focused.probe)
    const rest = unfocused.get(focused.probe)
    if (!rest) continue

    const hasOutline =
      focused.outlineStyle !== 'none' &&
      focused.outlineWidth > 0 &&
      (rgbaOf(focused.outlineColour)?.a ?? 0) > 0
    const changed =
      focused.background !== rest.background ||
      focused.border !== rest.border ||
      focused.boxShadow !== rest.boxShadow ||
      focused.colour !== rest.colour

    if (!hasOutline && !changed) {
      findings.push({
        testId: focused.testId,
        path: focused.path,
        reason: 'focus changes nothing: no outline, background, border, shadow or colour',
        ratio: null,
      })
      continue
    }

    if (hasOutline) {
      // outline-offset is negative in this sheet, so the ring sits on the control itself;
      // clearing either the control or what surrounds it is enough to be seen
      const againstOwn = contrastOf(focused.outlineColour, focused.background) ?? 0
      const againstBackdrop = contrastOf(focused.outlineColour, focused.backdrop) ?? 0
      const best = Math.max(againstOwn, againstBackdrop)
      if (best < MIN_LARGE_TEXT) {
        findings.push({
          testId: focused.testId,
          path: focused.path,
          reason: `focus outline ${focused.outlineColour} against ${focused.background} / ${focused.backdrop}`,
          ratio: Math.round(best * 100) / 100,
        })
      }
      continue
    }

    if (focused.background !== rest.background) {
      const shift = contrastOf(focused.background, rest.background) ?? 0
      if (shift < MIN_LARGE_TEXT) {
        findings.push({
          testId: focused.testId,
          path: focused.path,
          reason: `focus repaints only the background, ${rest.background} -> ${focused.background}`,
          ratio: Math.round(shift * 100) / 100,
        })
      }
    }
  }

  return findings
}

export const formatFocusFindings = (label: string, findings: readonly FocusFinding[]): string =>
  [
    `${label}: ${String(findings.length)} focus indicator violation(s)`,
    ...findings.map(
      (finding) =>
        `  ${finding.testId} [${finding.path}] ${finding.reason}` +
        `${finding.ratio === null ? '' : ` = ${finding.ratio.toFixed(2)}:1 (needs 3:1)`}`,
    ),
  ].join('\n')

export interface ContrastCollector {
  add(label: string, report: ContrastReport): void
  addFocus(label: string, findings: readonly FocusFinding[]): void
  readonly total: () => number
  readonly report: () => string
  readonly audited: () => number
}

/**
 * A failing assertion per state would stop at the first bad pair and hide the rest. A
 * contrast report is only actionable if it is the whole list, so states accumulate and
 * the test asserts once
 */
export const contrastCollector = (): ContrastCollector => {
  const lines: string[] = []
  let total = 0
  let audited = 0
  return {
    add(label, report) {
      audited += report.checked
      total += report.violations.length
      if (report.violations.length > 0) lines.push(formatFindings(label, report))
    },
    addFocus(label, findings) {
      total += findings.length
      if (findings.length > 0) lines.push(formatFocusFindings(label, findings))
    },
    total: () => total,
    audited: () => audited,
    report: () => lines.join('\n'),
  }
}

/** Hovers a locator and audits only what it paints, which is the state that regressed */
export const auditHovered = async (
  page: Page,
  target: Locator,
  within: string,
): Promise<ContrastReport> => {
  await target.hover()
  // a hover style is a paint, so let the frame that applies it land before reading styles
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  return auditContrast(page, { within })
}
