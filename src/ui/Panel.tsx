import type { ReactElement, ReactNode } from 'react'
import type { AsyncState } from '../state/slices'

export interface PanelProps {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly actions?: ReactNode
  /** Added to the panel box itself, for a panel whose own box has to behave differently */
  readonly className?: string
  /**
   * Whether the title is printed. A question step holds one panel whose title is the step's
   * own question, and printing it twice, once as the step header and once as an eyebrow under
   * it, said the same words twice for nothing. Such a panel is the step's whole body, and
   * the step's own section is already the landmark with that name, so the panel stops being a
   * second one (axe's `landmark-unique`): the hidden heading still names it for a reader
   */
  readonly titleVisible?: boolean
  readonly children: ReactNode
}

export const Panel = ({
  id,
  title,
  subtitle,
  actions,
  className,
  titleVisible = true,
  children,
}: PanelProps): ReactElement => (
  <section
    className={`panel${className ? ` ${className}` : ''}`}
    data-testid={`panel-${id}`}
    aria-label={titleVisible ? title : undefined}
  >
    {/* the header stays even with the title hidden, so the actions keep their row */}
    {titleVisible || actions ? (
      <header className="panel-head">
        <h2 className={titleVisible ? undefined : 'visually-hidden'}>{title}</h2>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
    ) : (
      <h2 className="visually-hidden">{title}</h2>
    )}
    {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
    <div className="panel-body">{children}</div>
  </section>
)

export interface AsyncNoticeProps<T> {
  readonly state: AsyncState<T>
  readonly testId: string
  readonly idleLabel: string
}

export const AsyncNotice = <T,>({
  state,
  testId,
  idleLabel,
}: AsyncNoticeProps<T>): ReactElement | null => {
  if (state.status === 'ready') return null
  return (
    <p className={`notice notice-${state.status}`} data-testid={testId} data-state={state.status}>
      {state.status === 'error'
        ? state.message
        : state.status === 'loading'
          ? 'Working...'
          : idleLabel}
    </p>
  )
}

export const Readout = ({
  id,
  label,
  value,
}: {
  readonly id: string
  readonly label: string
  readonly value: ReactNode
}): ReactElement => (
  <div className="readout">
    <span className="readout-label">{label}</span>
    <span className="readout-value" data-testid={`readout-${id}`}>
      {value}
    </span>
  </div>
)
