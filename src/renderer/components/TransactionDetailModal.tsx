import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import type { TransactionDetail, TransactionSummary } from '@shared/types'
import { AddressDisplay } from './AddressDisplay'

export function TransactionDetailModal({
  transaction,
  loading,
  onClose,
  onCopy,
  detailError
}: {
  transaction: TransactionDetail | null
  loading?: boolean
  onClose: () => void
  onCopy?: (txid: string) => void
  detailError?: string | null
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setCopied(false)
  }, [transaction?.txid])

  useEffect(() => {
    if (!transaction) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [transaction, onClose])

  if (!transaction) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(transaction.txid)
      setCopied(true)
      onCopy?.(transaction.txid)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard permissions can be unavailable in some Electron contexts.
    }
  }

  const modal = (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <section className="modal" role="dialog" aria-modal="true" aria-label="Transaction details" onMouseDown={(e) => e.stopPropagation()}>
        <div className="card__header">
          <span>Transaction Detail</span>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close transaction details">✕</button>
        </div>

        <div className="tx-detail-status">
          <span className={`tx-detail-dot tx-detail-dot--${transaction.direction}`} />
          <strong>{transaction.direction === 'received' ? 'Received' : transaction.direction === 'sent' ? 'Sent' : 'Self transfer'}</strong>
          {loading && <span className="muted">Refreshing details…</span>}
          {detailError && <span className="tx-detail-error">{detailError}</span>}
        </div>

        <div className="tx-detail-amount">{transaction.direction === 'sent' ? '-' : transaction.direction === 'received' ? '+' : ''}{transaction.amountWam} WAM</div>

        <div className="kv-grid">
          <span className="muted">TXID</span>
          <AddressDisplay address={transaction.txid} full />
          <span className="muted">Confirmations</span>
          <span>{transaction.confirmations}</span>
          {transaction.address && <><span className="muted">Address</span><AddressDisplay address={transaction.address} full /></>}
          <span className="muted">Time</span>
          <span>{new Date(transaction.timestamp).toLocaleString()}</span>
          {transaction.blockHeight != null && <><span className="muted">Block</span><span>{transaction.blockHeight}</span></>}
          {transaction.blockHash && <><span className="muted">Block hash</span><AddressDisplay address={transaction.blockHash} full /></>}
          {transaction.feeWam && <><span className="muted">Fee</span><span>{transaction.feeWam} WAM</span></>}
        </div>

        <div className="button-row">
          <button type="button" onClick={copy}>{copied ? '✓ Copied' : 'Copy TXID'}</button>
        </div>
      </section>
    </div>
  )

  return createPortal(modal, document.body)
}

export function summaryToDetail(tx: TransactionSummary): TransactionDetail {
  return { ...tx, blockHash: null, blockHeight: null, rawHex: null }
}
