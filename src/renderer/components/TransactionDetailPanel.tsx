import type { TransactionDetail } from '@shared/types'
import { AddressDisplay } from './AddressDisplay'

export function TransactionDetailPanel({ transaction, loading, detailError, onClose }: { transaction: TransactionDetail; loading?: boolean; detailError?: string | null; onClose: () => void }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(transaction.txid) } catch { /* UI remains usable */ }
  }
  return <section className="card tx-detail-panel">
    <div className="card__header"><div><div className="eyebrow">SELECTED TRANSACTION</div><strong>Transaction details</strong></div><button className="icon-button" onClick={onClose} aria-label="Close details">✕</button></div>
    <div className="tx-detail-hero"><div><span className={`tx-detail-dot tx-detail-dot--${transaction.direction}`} /><span>{transaction.direction === 'received' ? 'Received' : transaction.direction === 'sent' ? 'Sent' : 'Self transfer'}</span></div><strong>{transaction.direction === 'sent' ? '-' : transaction.direction === 'received' ? '+' : ''}{transaction.amountWam} WAM</strong></div>
    {loading && <div className="detail-loading"><span className="spinner" /> Refreshing blockchain details…</div>}
    {detailError && <div className="detail-warning">{detailError}</div>}
    <div className="kv-grid">
      <span className="muted">TXID</span><AddressDisplay address={transaction.txid} full />
      <span className="muted">Confirmations</span><span>{transaction.confirmations}</span>
      {transaction.address && <><span className="muted">Address</span><AddressDisplay address={transaction.address} full /></>}
      <span className="muted">Time</span><span>{new Date(transaction.timestamp).toLocaleString()}</span>
      {transaction.blockHeight != null && <><span className="muted">Block</span><span>{transaction.blockHeight}</span></>}
      {transaction.feeWam && <><span className="muted">Fee</span><span>{transaction.feeWam} WAM</span></>}
    </div>
    <button onClick={() => void copy()}>Copy TXID</button>
  </section>
}
