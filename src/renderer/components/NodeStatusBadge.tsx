import type { NodeStatus } from '@shared/types'

const LABELS: Record<NodeStatus['state'], { dot: string; text: string }> = {
  connected: { dot: '🟢', text: 'Connected' },
  syncing: { dot: '🟡', text: 'Synchronizing' },
  disconnected: { dot: '🔴', text: 'Disconnected' }
}

export function NodeStatusBadge({ status }: { status: NodeStatus | null }) {
  if (!status) {
    return <span className="node-status node-status--unknown">Checking node…</span>
  }
  const { dot, text } = LABELS[status.state]

  return (
    <div className="node-status">
      <span className="node-status__dot">{dot}</span>
      <span className="node-status__text">{text}</span>
      {status.state === 'syncing' && status.syncPercent != null && (
        <span className="node-status__detail">
          {status.currentBlock.toLocaleString()} / {status.networkBlock?.toLocaleString() ?? '?'} ({status.syncPercent}%)
        </span>
      )}
      {status.state === 'connected' && (
        <span className="node-status__detail">block {status.currentBlock.toLocaleString()}</span>
      )}
      {status.state === 'disconnected' && status.errorMessage && (
        <span className="node-status__detail node-status__detail--error">{status.errorMessage}</span>
      )}
    </div>
  )
}
