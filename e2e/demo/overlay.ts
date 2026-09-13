import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The film crew: a caption bar, a visible pointer, a click flash and a chapter card, drawn over
 * the running app for the demo recording and for nothing else.
 *
 * Everything here is drawn INTO the page rather than composited afterward, for one reason:
 * Playwright's video is a screencast of the page, and a screencast doesn't include the mouse
 * cursor. A viewer watching a real recording of this app therefore sees controls operating
 * themselves with nothing on screen to say what was pressed. The pointer below is that missing
 * cursor, and the ring and the outline are the missing click.
 *
 * It lives in a shadow root attached to `documentElement`, which keeps two promises the app
 * would otherwise have to make: the app's stylesheet can't reach in and restyle the captions,
 * and these nodes can't reach out and restyle the app. `pointer-events: none` throughout, so
 * nothing here can ever swallow a click meant for the product being demonstrated
 */

export type CaptionAt = 'top' | 'bottom'

export interface DemoBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface DemoApi {
  readonly caption: (text: string, at: CaptionAt) => void
  readonly card: (title: string, subtitle: string, shown: boolean) => void
  readonly chip: (text: string, fraction: number) => void
  readonly mark: (box: DemoBox | null) => void
  readonly press: (x: number, y: number) => void
}

declare global {
  interface Window {
    readonly __demo: DemoApi
  }
}

/**
 * Injected before any of the app's own scripts run, and therefore before there's a document to
 * hang anything off. That's why nothing is built here: `addInitScript` fires at document start,
 * where `documentElement` can still be null, and an eager build threw there and left the whole
 * API undefined, which the recording only discovered on its first caption. The nodes are built
 * on first use instead, by which time the app has been waited for.
 *
 * Written as one self-contained function with no reference to anything in this module's scope:
 * Playwright ships it by stringifying it, so a closure over a constant up here would arrive in
 * the browser as an undefined variable. Types are erased before that happens and so are safe
 */
const install = (): void => {
  interface Parts {
    readonly host: HTMLElement
    readonly layer: HTMLElement
    readonly fill: HTMLElement
    readonly caption: HTMLElement
    readonly eyebrow: HTMLElement
    readonly line: HTMLElement
    readonly mark: HTMLElement
    readonly pointer: HTMLElement
    readonly card: HTMLElement
    readonly cardTitle: HTMLElement
    readonly cardSub: HTMLElement
  }

  const HOST_ID = 'demo-overlay-host'

  /* The app's own accent, dark-scheme variant: it has to read against the dark caption pill
     rather than against the light page the recording is made in */
  const STYLE = `
    * { box-sizing: border-box; margin: 0 }
    .layer {
      position: fixed; inset: 0; pointer-events: none;
      font-family: ui-sans-serif, -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .rail { position: absolute; top: 0; left: 0; right: 0; height: 3px; background: rgba(20, 30, 24, 0.12) }
    .rail i { display: block; height: 100%; width: 0; background: #2f6f4f; transition: width 700ms cubic-bezier(0.22, 1, 0.36, 1) }
    /*
       The caption. Top by default because the guided setup docks across the foot of the window
       and the dock is usually the thing being talked about; beats about the sidebar move it down.

       Centered on 40 percent rather than on 50, which is the middle of the CANVAS rather than the
       middle of the window: the sidebar owns the right fifth of the screen, and a caption centered
       on the window sat under the light legend pinned to the top right of the canvas
    */
    .caption {
      position: absolute; left: 40%; transform: translate(-50%, 14px);
      max-width: min(880px, 56vw); padding: 15px 26px 17px; border-radius: 16px;
      background: rgba(14, 20, 16, 0.86); color: #f4f8f5;
      font-size: 25px; line-height: 1.38; font-weight: 450; letter-spacing: 0.1px;
      text-align: center; text-wrap: balance;
      box-shadow: 0 18px 44px rgba(8, 14, 10, 0.34);
      opacity: 0; transition: opacity 340ms ease, transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .caption .eyebrow {
      display: block; margin-bottom: 7px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase;
      color: #7fc9a2;
    }
    .caption .eyebrow:empty { display: none }
    .caption[data-at="top"] { top: 78px }
    .caption[data-at="bottom"] { bottom: 46px }
    .caption[data-shown="true"] { opacity: 1; transform: translate(-50%, 0) }

    /* The outline tracks between targets rather than blinking from one to the next, so the eye
       is carried to the control instead of having to find it again */
    .mark {
      position: absolute; border: 3px solid #2f6f4f; border-radius: 10px;
      box-shadow: 0 0 0 5px rgba(47, 111, 79, 0.22), 0 6px 20px rgba(47, 111, 79, 0.24);
      opacity: 0;
      transition: opacity 220ms ease, top 420ms cubic-bezier(0.22, 1, 0.36, 1),
        left 420ms cubic-bezier(0.22, 1, 0.36, 1), width 420ms ease, height 420ms ease;
    }
    .mark[data-shown="true"] { opacity: 1 }

    .pointer {
      position: absolute; top: 0; left: 0; width: 26px; height: 26px; margin: -13px 0 0 -13px;
      border-radius: 50%; background: rgba(255, 255, 255, 0.92);
      border: 2.5px solid #1b2a21; box-shadow: 0 4px 14px rgba(8, 14, 10, 0.4);
      opacity: 0; transition: opacity 260ms ease, transform 620ms cubic-bezier(0.22, 1, 0.36, 1);
    }
    .pointer[data-shown="true"] { opacity: 1 }
    .pointer::after { content: ""; position: absolute; inset: 7px; border-radius: 50%; background: #1b2a21 }

    .flash {
      position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px;
      border-radius: 50%; border: 3px solid #2f6f4f;
    }

    .card {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 18px;
      background: rgba(10, 16, 12, 0.9); color: #f4f8f5;
      opacity: 0; transition: opacity 520ms ease;
    }
    .card[data-shown="true"] { opacity: 1 }
    .card h1 { font-size: 62px; line-height: 1.1; font-weight: 600; letter-spacing: -0.6px; text-align: center }
    .card p { font-size: 26px; font-weight: 400; color: #b9cfc2; max-width: 900px; text-align: center; text-wrap: balance }

    @keyframes flash { to { transform: scale(3.4); opacity: 0 } }
  `

  const build = (): Parts => {
    const host = document.createElement('div')
    host.id = HOST_ID
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none'
    document.documentElement.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `
      <style>${STYLE}</style>
      <div class="layer">
        <div class="rail"><i></i></div>
          <div class="mark"></div>
        <div class="pointer"></div>
        <div class="caption"><b class="eyebrow"></b><span class="line"></span></div>
        <div class="card"><h1></h1><p></p></div>
      </div>
    `
    const find = (selector: string): HTMLElement => {
      const node = shadow.querySelector(selector)
      if (node === null) throw new Error(`the demo overlay is missing ${selector}`)
      return node as HTMLElement
    }
    return {
      host,
      layer: find('.layer'),
      fill: find('.rail i'),
      caption: find('.caption'),
      eyebrow: find('.caption .eyebrow'),
      line: find('.caption .line'),
      mark: find('.mark'),
      pointer: find('.pointer'),
      card: find('.card'),
      cardTitle: find('.card h1'),
      cardSub: find('.card p'),
    }
  }

  let parts: Parts | null = null
  // rebuilt rather than reused if the document it was in has gone, which is what a reload is
  const ensure = (): Parts => {
    if (parts?.host.isConnected === true) return parts
    parts = build()
    return parts
  }

  const api: DemoApi = {
    caption: (text, at) => {
      const ui = ensure()
      ui.caption.dataset.at = at
      // empty text retires the bar rather than leaving an empty pill behind
      ui.caption.dataset.shown = text === '' ? 'false' : 'true'
      ui.line.textContent = text
    },
    card: (title, subtitle, shown) => {
      const ui = ensure()
      ui.cardTitle.textContent = title
      ui.cardSub.textContent = subtitle
      ui.card.dataset.shown = shown ? 'true' : 'false'
    },
    /** The chapter label rides in the caption pill, and the rail is the only standalone furniture */
    chip: (text, fraction) => {
      const ui = ensure()
      ui.eyebrow.textContent = text
      ui.fill.style.width = `${String(Math.round(Math.max(0, Math.min(1, fraction)) * 100))}%`
    },
    mark: (box) => {
      const ui = ensure()
      if (box === null) {
        ui.mark.dataset.shown = 'false'
        ui.pointer.dataset.shown = 'false'
        return
      }
      // the outline hugs the control with a little air, so a 3px border never sits on the text
      const pad = 5
      ui.mark.style.left = `${String(box.x - pad)}px`
      ui.mark.style.top = `${String(box.y - pad)}px`
      ui.mark.style.width = `${String(box.width + pad * 2)}px`
      ui.mark.style.height = `${String(box.height + pad * 2)}px`
      ui.mark.dataset.shown = 'true'
      ui.pointer.style.transform = `translate(${String(box.x + box.width / 2)}px, ${String(box.y + box.height / 2)}px)`
      ui.pointer.dataset.shown = 'true'
    },
    press: (x, y) => {
      const ui = ensure()
      const ring = document.createElement('div')
      ring.className = 'flash'
      ring.style.left = `${String(x)}px`
      ring.style.top = `${String(y)}px`
      ring.style.animation = 'flash 520ms cubic-bezier(0.22, 1, 0.36, 1) forwards'
      ui.layer.append(ring)
      globalThis.setTimeout(() => ring.remove(), 700)
    },
  }
  Object.defineProperty(window, '__demo', { value: api, configurable: true })
}

export const installOverlay = async (page: Page): Promise<void> => {
  await page.addInitScript(install)
}

/* --------------------------------- the director --------------------------------- */

/** How long the pointer takes to travel, matched to the transition in the sheet above */
const POINTER_MS = 640
/** Between the ring and the click landing, so the flash reads as the cause */
const PRESS_MS = 150
/** After a click, so the change it caused is on screen before the next caption talks over it */
const SETTLE_MS = 520
const CARD_MS = 2900

/**
 * A caption's reading time, in the absence of a voice track.
 *
 * Paced to SPEECH rather than to silent reading, and deliberately: this recording ships with no
 * narration, and the timecoded script it emits beside itself exists so a voice can be laid over
 * it later without the picture having to be recut. Silent reading is about twice this fast, so
 * the video is a little slow to read and exactly right to talk over
 */
const MS_PER_WORD = 395
const MIN_DWELL_MS = 2400
const MAX_DWELL_MS = 13_000

export const dwellFor = (text: string): number => {
  const words = text.split(/\s+/).filter((word) => word !== '').length
  return Math.max(MIN_DWELL_MS, Math.min(MAX_DWELL_MS, words * MS_PER_WORD + 800))
}

export interface Cue {
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}

export interface Chapter {
  readonly atMs: number
  readonly title: string
  readonly subtitle: string
}

/**
 * The thing that drives the app for the camera.
 *
 * It makes no assertions about the product beyond the ones it needs to
 * find a control at all: a demo that failed on a changed figure would be a demo nobody could
 * record. What it does own is the clock. Every caption it shows is recorded against milliseconds
 * since the recording began, which is what makes an SRT possible from a run that was never
 * scripted to a fixed length
 */
export class Director {
  readonly page: Page
  private readonly t0: number
  private readonly totalChapters: number
  private readonly cues: Cue[] = []
  private readonly chapters: Chapter[] = []
  private open: { readonly startMs: number; readonly text: string } | null = null
  private chapterCount = 0

  constructor(page: Page, t0: number, totalChapters: number) {
    this.page = page
    this.t0 = t0
    this.totalChapters = totalChapters
  }

  private now = (): number => Date.now() - this.t0

  /** Puts a caption up and starts its cue. The previous one ends here, so cues never overlap */
  say = async (text: string, at: CaptionAt = 'top'): Promise<void> => {
    const startMs = this.now()
    this.closeCue(startMs)
    this.open = { startMs, text }
    await this.page.evaluate(
      ([body, where]) => window.__demo.caption(String(body), where === 'bottom' ? 'bottom' : 'top'),
      [text, at] as const,
    )
  }

  private closeCue = (endMs: number): void => {
    if (this.open === null) return
    // a cue under a second is a flicker rather than a line, and only happens when a beat is cut
    if (endMs - this.open.startMs > 900) {
      this.cues.push({ startMs: this.open.startMs, endMs, text: this.open.text })
    }
    this.open = null
  }

  hush = async (): Promise<void> => {
    this.closeCue(this.now())
    await this.page.evaluate(() => window.__demo.caption('', 'top'))
  }

  chapter = async (title: string, subtitle: string): Promise<void> => {
    await this.hush()
    await this.page.evaluate(() => window.__demo.mark(null))
    this.chapters.push({ atMs: this.now(), title, subtitle })
    this.chapterCount += 1
    await this.page.evaluate(
      ([heading, sub]) => window.__demo.card(String(heading), String(sub), true),
      [title, subtitle] as const,
    )
    await this.page.waitForTimeout(CARD_MS)
    await this.page.evaluate(() => window.__demo.card('', '', false))
    await this.page.evaluate(
      ([label, fraction]) => window.__demo.chip(String(label), Number(fraction)),
      [title, this.chapterCount / this.totalChapters] as const,
    )
    await this.page.waitForTimeout(560)
  }

  private locate = (target: Locator | string): Locator =>
    typeof target === 'string' ? this.page.getByTestId(target) : target

  /**
   * Draws the eye to a control without operating it, for the beats that only point at something.
   *
   * Best effort, and never fatal. A highlight is decoration: the beat it belongs to is about the
   * caption and about whatever the app is doing underneath, and neither of those stops being true
   * because an outline couldn't be drawn. The `try` covers a real race: the planting step can
   * re-render its own options between the check that the element exists and the attempt to scroll
   * to it
   */
  point = async (target: Locator | string): Promise<void> => {
    const locator = this.locate(target).first()
    try {
      await locator.scrollIntoViewIfNeeded({ timeout: 5000 })
      const box = await locator.boundingBox({ timeout: 5000 })
      if (box === null) return
      await this.page.evaluate((seen) => window.__demo.mark(seen), box)
      await this.page.waitForTimeout(POINTER_MS)
    } catch {
      // the panel moved. The film carries on
    }
  }

  click = async (target: Locator | string): Promise<void> => {
    const locator = this.locate(target).first()
    await expect(locator).toBeVisible()
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (box === null) throw new Error('the demo tried to click something with no box')
    await this.page.evaluate((seen) => window.__demo.mark(seen), box)
    await this.page.waitForTimeout(POINTER_MS)
    await this.page.evaluate(([x, y]) => window.__demo.press(Number(x), Number(y)), [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ] as const)
    await this.page.waitForTimeout(PRESS_MS)
    await locator.click()
    await this.page.waitForTimeout(SETTLE_MS)
  }

  /**
   * A radio drawn as a card. The input itself carries the test id and is styled away, so the
   * pointer is sent to the label around it: that is the thing on screen, and it's what a
   * viewer watching this film sees being pressed
   */
  choose = async (testId: string): Promise<void> => {
    const input = this.page.getByTestId(testId).first()
    const label = input.locator('xpath=ancestor::label[1]')
    await this.click((await label.count()) > 0 ? label.first() : input)
  }

  /**
   * Selected and retyped a character at a time, because a field that fills instantly reads as a
   * stub rather than as somebody using the product.
   *
   * Selected, and emphatically NOT cleared first. These are controlled number fields with a
   * minimum, so an empty string is NaN,
   * which the field clamps to its own minimum and then holds against every keystroke that
   * follows. A recording made that way asked for a 0.6 by 0.5 meter garden, and the engine
   * correctly refused to place a bed in it, eight minutes into an otherwise good take
   */
  write = async (target: Locator | string, value: string): Promise<void> => {
    const locator = this.locate(target).first()
    await this.click(locator)
    await locator.press('ControlOrMeta+a')
    await locator.pressSequentially(value, { delay: 62 })
    await this.page.waitForTimeout(420)
  }

  /**
   * A slow drag across the canvas, which orbits the camera.
   *
   * Two jobs, both real: it shows the garden as a solid object rather than a picture, and it
   * gives the long waits something to be. The design search runs a year of hourly weather over
   * every candidate layout, and that is tens of seconds of honest work with nothing moving
   */
  orbit = async (degrees = 26, seconds = 3.4): Promise<void> => {
    const size = this.page.viewportSize()
    if (size === null) return
    const y = Math.round(size.height * 0.3)
    const from = Math.round(size.width * 0.5)
    const steps = Math.max(12, Math.round(seconds * 24))
    await this.page.mouse.move(from, y)
    await this.page.mouse.down()
    await this.page.mouse.move(from + degrees * 8, y, { steps })
    await this.page.mouse.up()
    await this.page.waitForTimeout(260)
  }

  hold = (ms: number): Promise<void> => this.page.waitForTimeout(ms)

  /** The remainder of a caption's reading time, once whatever it was talking over has finished */
  settle = async (text: string, sinceMs: number): Promise<void> => {
    const left = dwellFor(text) - (this.now() - sinceMs)
    if (left > 0) await this.page.waitForTimeout(left)
  }

  elapsed = (): number => this.now()

  finish = (): { readonly cues: readonly Cue[]; readonly chapters: readonly Chapter[] } => {
    this.closeCue(this.now())
    return { cues: this.cues, chapters: this.chapters }
  }
}
