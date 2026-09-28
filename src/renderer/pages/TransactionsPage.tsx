import { useCallback, useEffect, useRef, useState } from 'react'
import { api, unwrap, toPageError } from '../services/api'
import type { TransactionDetail, TransactionSummary } from '@shared/types'
import { TransactionRow } from '../components/TransactionRow'
import { TransactionDetailModal, summaryToDetail } from '../components/TransactionDetailModal'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'

const AUTO_REFRESH_MS = 3_000

export function TransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionSummary[]>([])
  const [detail, setDetail] = useState<TransactionDetail | null>(null)
  const [error, setError] = useState<PageError | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const loadInFlight = useRef(false)
  const detailRequest = useRef(0)

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (loadInFlight.current) return
    loadInFlight.current = true
    if (!opts.silent) setLoading(true)
    try {
      const next = await unwrap(api.tx.history(100))
      setTransactions([...next].sort((a, b) => b.timestamp - a.timestamp))
      setError(null)
    } catch (err) { setError(toPageError(err, 'Could not load transaction history.')) }
    finally { if (!opts.silent) setLoading(false); loadInFlight.current = false }
  }, [])

  useEffect(() => { void load(); const id = window.setInterval(() => void load({ silent: true }), AUTO_REFRESH_MS); return () => window.clearInterval(id) }, [load])

  async function openDetail(tx: TransactionSummary) {
    const requestId = ++detailRequest.current
    setDetailError(null)
    setDetail(summaryToDetail(tx))
    setDetailLoading(true)
    try {
      const detailPromise = unwrap(api.tx.detail(tx.txid))
      const timeout = new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('The node did not return extra transaction details in time.')), 5_000))
      const value = await Promise.race([detailPromise, timeout])
      if (requestId === detailRequest.current) setDetail(value)
    } catch (err) { if (requestId === detailRequest.current) setDetailError(toPageError(err, 'Extra transaction details are unavailable.').message) }
    finally { if (requestId === detailRequest.current) setDetailLoading(false) }
  }

  const close = () => { detailRequest.current++; setDetail(null); setDetailLoading(false); setDetailError(null) }

  return (
    <div className="page">
      <div className="page-heading"><div><div className="eyebrow">WALLET ACTIVITY</div><h1>Transactions</h1><p className="muted">Your latest activity, newest first.</p></div><button className="refresh-button" onClick={() => void load()} disabled={loading}>{loading ? <span className="spinner" /> : '↻'} Refresh</button></div>
      {error && <ErrorBanner {...error} />}
      <section className="card transactions-card">
        <div className="card__header"><span>Activity</span><span className="live-chip"><span /> Live · 3s</span></div>
        {loading && transactions.length === 0 && <div className="skeleton-list"><span /><span /><span /></div>}
        {!loading && transactions.length === 0 && <div className="empty-state"><div className="empty-icon">◷</div><strong>No transactions yet</strong><span>New WAM activity will appear here automatically.</span></div>}
        <div className="tx-list">{transactions.map((tx) => <TransactionRow key={`${tx.txid}-${tx.timestamp}-${tx.direction}`} tx={tx} onClick={() => void openDetail(tx)} />)}</div>
      </section>
      <TransactionDetailModal
        transaction={detail}
        loading={detailLoading}
        detailError={detailError}
        onClose={close}
      />
    </div>
  )
}
