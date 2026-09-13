import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface SceneBoundaryProps {
  readonly label: string
  readonly children: ReactNode
  onError?(label: string, message: string): void
}

interface SceneBoundaryState {
  readonly failed: boolean
}

// A three.js subtree cannot render DOM, so a failed branch degrades to nothing while the
// rest of the scene keeps rendering; the DOM-side notice lives in ui/ErrorBoundary
export class SceneBoundary extends Component<SceneBoundaryProps, SceneBoundaryState> {
  override state: SceneBoundaryState = { failed: false }

  static getDerivedStateFromError(): SceneBoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    void _info
    this.props.onError?.(this.props.label, error.message)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
