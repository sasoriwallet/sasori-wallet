import React from 'react'

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Renderer error', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="app-fatal">
        <div className="card app-fatal__card">
          <div className="app-fatal__mark">!</div>
          <h1>Sasori Wallet stopped rendering</h1>
          <p className="muted">The wallet backend and your wallet data were not changed by this UI error.</p>
          <details>
            <summary>Technical details</summary>
            <code>{this.state.error.message}</code>
          </details>
          <button className="primary" onClick={() => window.location.reload()}>Reload wallet UI</button>
        </div>
      </div>
    )
  }
}
