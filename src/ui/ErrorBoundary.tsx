import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Action } from './controls'

export interface ErrorBoundaryProps {
  readonly label: string
  readonly testId: string
  readonly children: ReactNode
}

interface ErrorBoundaryState {
  readonly message: string | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { message: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { message: error.message }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void info
    void error
  }

  /**
   * One plain sentence and a way out, whichever part threw: the message a developer wants is
   * behind a fold, because a raw `error.message` where a panel used to be reads as the app
   * shouting at whoever is in front of it. The design is written to this browser as it is
   * edited (`src/state/persist.ts`), so a reload is safe to promise
   */
  override render(): ReactNode {
    if (this.state.message === null) return this.props.children
    return (
      <section className="panel panel-failed" data-testid={this.props.testId} data-state="error">
        <header className="panel-head">
          <h2>{this.props.label}</h2>
        </header>
        <p className="notice notice-error">
          Something in the app broke. Reload the page; your garden is saved in this browser.
        </p>
        <Action testId="action-app-reload" onClick={() => location.reload()}>
          Reload
        </Action>
        <details className="wizard-advanced" data-testid="details-app-error">
          <summary>Details for a bug report</summary>
          <p className="notice-detail">{this.state.message}</p>
        </details>
      </section>
    )
  }
}
