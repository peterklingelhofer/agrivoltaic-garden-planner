import { useState, type ReactElement } from 'react'
import { useAppStore } from '../state/store'
import type { StorageOutcome } from '../types/persist'
import { Action } from './controls'
import { Panel, Readout } from './Panel'
import { FORGET_COST, KEPT } from './storage-copy'

/**
 * Every state paints one of the four notice classes whose colours `e2e/contrast.spec.ts` checks,
 * and none of them dims its text
 */
const TONE: Readonly<Record<StorageOutcome, string>> = {
  unavailable: 'error',
  'quota-exceeded': 'error',
  failed: 'error',
  discarded: 'warn',
  repaired: 'warn',
  restored: 'ready',
  saved: 'ready',
  cleared: 'ready',
  idle: 'idle',
}

export const StoragePanel = (): ReactElement => {
  const storage = useAppStore((s) => s.storage)
  const saveDesign = useAppStore((s) => s.saveDesign)
  const clearDesign = useAppStore((s) => s.clearDesign)
  /**
   * Armed, then done: two presses rather than one.
   *
   * It was a single unconfirmed click, styled like every other button on the panel and sitting
   * immediately beside "Save now", which is the press a grower is reaching for when they are
   * thinking about their saved design. Component state rather than the store, because arming is
   * about this rendering of this panel: leaving the step and coming back should find it safe
   */
  const [armed, setArmed] = useState(false)

  return (
    <Panel
      id="storage"
      title="Saved design"
      subtitle={KEPT}
      actions={
        <>
          <Action testId="action-storage-save" tone="primary" onClick={saveDesign}>
            Save now
          </Action>
          <Action
            testId="action-storage-reset"
            disabled={armed}
            describedBy="readout-storage-forget-cost"
            onClick={() => setArmed(true)}
          >
            Forget saved design
          </Action>
        </>
      }
    >
      {/*
        The sentence exists whether or not the confirmation is showing, because `describedBy` on
        the button points at it: a screen reader is told the cost with the label, rather than only
        after the press that was supposed to be the safe one
      */}
      <p
        className={armed ? 'notice notice-error' : 'attribution'}
        id="readout-storage-forget-cost"
        data-testid="readout-storage-forget-cost"
      >
        {FORGET_COST}
      </p>
      {armed ? (
        <div className="row" data-testid="panel-storage-confirm">
          {/* the safe choice first and the destructive one plainly labelled: nobody who has
              read the sentence above presses the second button by accident */}
          <Action
            testId="action-storage-forget-cancel"
            tone="primary"
            onClick={() => setArmed(false)}
          >
            Keep it
          </Action>
          <Action
            testId="action-storage-forget-confirm"
            onClick={() => {
              setArmed(false)
              clearDesign()
            }}
          >
            Yes, forget everything
          </Action>
        </div>
      ) : null}
      <p
        className={`notice notice-${TONE[storage.outcome]}`}
        data-testid="status-storage"
        data-state={storage.outcome}
      >
        {storage.message}
      </p>
      <p className="attribution" data-testid="readout-storage-scope">
        No simulation result is stored: the light map, the annual solar (PV) energy, the crop
        ranking and the polyculture suggestions all start empty after a reload, because a stale
        number shown as a current one is worse than none
      </p>
      <div className="readouts">
        <Readout
          id="storage-size"
          label="Stored size"
          value={`${storage.bytes.toLocaleString()} bytes`}
        />
        <Readout
          id="storage-saved"
          label="Last saved"
          value={
            storage.savedAtUtcMillis === null
              ? 'not yet'
              : new Date(storage.savedAtUtcMillis).toLocaleTimeString()
          }
        />
      </div>
    </Panel>
  )
}
