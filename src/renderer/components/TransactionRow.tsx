import type { TransactionSummary } from '@shared/types'

export function TransactionRow({ tx, onClick }: { tx: TransactionSummary; onClick: () => void }) {
  const sign = tx.direction === 'sent' ? '-' : tx.direction === 'received' ? '+' : ''
  const directionLabel = tx.direction === 'sent' ? 'Sent' : tx.direction === 'received' ? 'Received' : 'Self'

  return (
    <button className="tx-row" onClick={onClick}>
      <div className="tx-row__amount" data-direction={tx.direction}>
        {sign}
        {tx.amountWam} WAM
      </div>
      <div className="tx-row__meta">
        <span>{directionLabel}</span>
        <span className="muted">{new Date(tx.timestamp).toLocaleString()}</span>
      </div>
      <div className="tx-row__status">{tx.confirmations > 0 ? `${tx.confirmations} confirmations` : 'Unconfirmed'}</div>
    </button>
  )
}
