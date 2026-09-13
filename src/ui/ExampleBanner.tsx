import { useState, type ReactElement } from 'react'
import { EXAMPLE_BANNER_BODY, EXAMPLE_BANNER_TITLE } from '../state/example'
import { showingExample, useAppStore } from '../state/store'
import { Action } from './controls'

/**
 * Says whose garden this is, and gets out of the way.
 *
 * It sits over the canvas rather than in the sidebar because the questions are already there
 * and the example is the thing the questions are asked about. The provenance line isn't
 * decoration either: the surface a DLI number is read off has to say where the number came
 * from, and for this one the answer is a bake, untouched by an author.
 *
 * "Gets out of the way" is new, and it was the complaint. There was no close: the only control
 * was the one that DELETES the example, so putting the notice away and throwing the garden away
 * were the same press. Measured at 360x640 the card was 226px and the legend under it 124px, so
 * between them they covered 88% of the canvas and the garden the card is about got 47px.
 *
 * Four things, in the order a reader wants them: a line that names it, a close that closes only the
 * notice, the press that starts a garden of their own, and the reading matter folded behind "About
 * this example". It folds at every width, so no first screen opens on 111 words of it over the
 * garden, and the button that clears the example sits outside the fold, since that is the one
 * control on the card a visitor arrives wanting
 */
export const ExampleBanner = (): ReactElement | null => {
  // asked of the design itself, with no flag: the moment anything replaces the example, this is
  // somebody's own garden and saying otherwise reads as the edit never having happened
  const showing = useAppStore(showingExample)
  const provenance = useAppStore((s) => s.exampleProvenance)
  const dismissed = useAppStore((s) => s.exampleNoticeDismissed)
  const dismissExampleNotice = useAppStore((s) => s.dismissExampleNotice)
  const clearExample = useAppStore((s) => s.clearExample)
  // ephemeral and local on purpose: it's which way a disclosure is facing, it's meaningless
  // once the notice is gone, and nothing else in the app can ask a useful question about it
  const [expanded, setExpanded] = useState(false)
  if (!showing || provenance === null || dismissed) return null

  return (
    <aside
      className="example-banner"
      data-testid="panel-example"
      data-expanded={expanded ? 'true' : undefined}
    >
      <div className="example-banner-head">
        <p className="example-banner-title">{EXAMPLE_BANNER_TITLE}</p>
        {/*
          Only ever the notice. The button beside it in the body is the one that touches the garden
        */}
        <button
          type="button"
          className="example-banner-close"
          data-testid="action-example-dismiss"
          aria-label="Close this notice and keep the example garden"
          onClick={dismissExampleNotice}
        >
          ×
        </button>
      </div>
      {/* the fold, at every width: what it hides is reading matter, and it starts hidden */}
      <button
        type="button"
        className="example-banner-more"
        data-testid="action-example-expand"
        aria-expanded={expanded}
        onClick={() => setExpanded((open) => !open)}
      >
        {expanded ? 'Less' : 'About this example'}
      </button>
      <div className="example-banner-body-wrap">
        <p className="example-banner-body">{EXAMPLE_BANNER_BODY}</p>
        {/*
          The provenance, one press away rather than in the first thing anybody reads.
          It's a record of how the raster beside it was produced and it stays on this surface for
          that reason: a DLI field with no provenance is indistinguishable from an invented one. But
          "65 x 88 cells at 0.4 m, baked on the CPU reference backend ... quantized to within 0.005
          mol/m2/d" is monospace machinery in the top-left corner of a first visit, which is where
          the eye lands first. The banner says whose garden this is. This says how it was made,
          to whoever asks
        */}
        <details className="example-banner-provenance">
          <summary data-testid="action-example-provenance">How this example was made</summary>
          <p className="example-banner-detail" data-testid="readout-example-provenance">
            {provenance.notes[0]}. {provenance.siteLabel}, {provenance.weather}. Stored to within{' '}
            {provenance.quantizationErrorMolM2Day.toFixed(3)} mol/m²/d. Baked{' '}
            {provenance.generatedAtUtc.slice(0, 10)} by {provenance.generator}
          </p>
        </details>
      </div>
      {/*
        Outside the fold, because it's the one thing on this card a reader arrives wanting: the
        eighteen year old pressed it as the only invitation on screen. Folding it away with the
        provenance would leave the card with nothing to do but be read
      */}
      <Action testId="action-example-clear" tone="primary" onClick={clearExample}>
        Clear the example and start my own
      </Action>
    </aside>
  )
}
