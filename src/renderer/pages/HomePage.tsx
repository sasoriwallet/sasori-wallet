import { useCallback, useEffect, useRef, useState } from 'react'
import { api, unwrap, toPageError } from '../services/api'
import { AddressDisplay } from '../components/AddressDisplay'
import { TransactionRow } from '../components/TransactionRow'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'
import { TransactionDetailModal, summaryToDetail } from '../components/TransactionDetailModal'
import type { TransactionDetail, TransactionSummary, WalletBalances } from '@shared/types'
import wamLogo from '../assets/wam-logo.png'
import pixelSend from '../assets/pixel/send.svg'
import pixelReceive from '../assets/pixel/receive.svg'

const BALANCE_REFRESH_MS = 3000
const ACTIVITY_REFRESH_MS = 10000

export function HomePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [balances, setBalances] = useState<WalletBalances | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<TransactionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<PageError | null>(null)
  const [selectedTx, setSelectedTx] = useState<TransactionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const balanceInFlight = useRef(false)
  const activityInFlight = useRef(false)
  const detailRequest = useRef(0)

  const refreshBalances = useCallback(async (opts: { manual?: boolean } = {}) => {
    if (balanceInFlight.current) return
    balanceInFlight.current = true
    if (opts.manual) setLoading(true)
    try {
      const b = await unwrap(api.wallet.getBalances())
      setBalances(b)
      setError(null)
    } catch (err) {
      // Keep the last real balance during a temporary RPC stall. A stalled
      // wallet RPC is not evidence that the blockchain is disconnected; the
      // NodeStatus badge is the authoritative chain-connection indicator.
      if (!balances) setError(toPageError(err, 'Could not load wallet balance.'))
    } finally {
      if (opts.manual) setLoading(false)
      balanceInFlight.current = false
    }
  }, [balances])

  const refreshActivity = useCallback(async () => {
    if (activityInFlight.current) return
    activityInFlight.current = true
    try {
      const [a, tx] = await Promise.all([unwrap(api.wallet.getReceiveAddress()), unwrap(api.tx.history(5))])
      setAddress(a)
      setTransactions(tx)
    } catch {
      // Activity/address refresh is best-effort while the local node is busy.
    } finally {
      activityInFlight.current = false
    }
  }, [])

  const load = useCallback(async () => {
    await Promise.all([refreshBalances({ manual: true }), refreshActivity()])
  }, [refreshActivity, refreshBalances])

  async function openTransaction(tx: TransactionSummary) {
    const requestId = ++detailRequest.current
    setSelectedTx(summaryToDetail(tx)); setDetailError(null); setDetailLoading(true)
    try {
      const detail = await Promise.race([
        unwrap(api.tx.detail(tx.txid)),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Transaction detail refresh timed out.')), 5000))
      ])
      if (requestId === detailRequest.current) setSelectedTx(detail)
    } catch (err) { if (requestId === detailRequest.current) setDetailError(toPageError(err, 'Could not refresh transaction details.').message) }
    finally { if (requestId === detailRequest.current) setDetailLoading(false) }
  }

  useEffect(() => {
    void refreshBalances()
    void refreshActivity()
    const balanceTimer = window.setInterval(() => void refreshBalances(), BALANCE_REFRESH_MS)
    const activityTimer = window.setInterval(() => void refreshActivity(), ACTIVITY_REFRESH_MS)
    return () => {
      window.clearInterval(balanceTimer)
      window.clearInterval(activityTimer)
    }
  }, [refreshActivity, refreshBalances])

  return (
    <div className="page home-page">
      {error && <ErrorBanner {...error} />}

      <section className="wallet-hero">
        <div>
          <div className="pixel-eyebrow">WAM MAINNET // YOUR WALLET</div>
          <div className="hero-balance-row">
            <img src={wamLogo} alt="WAM" className="wam-logo" />
            <div>
              <div className="hero-balance">{balances?.availableWam ?? '0.00000000'} <span>WAM</span></div>
              <div className="hero-usd">Available balance</div>
              <div className="hero-pending">PENDING <strong>{balances?.pendingWam ?? '0.00000000'} WAM</strong></div>
            </div>
          </div>
        </div>
        <button className="pixel-icon-button" onClick={() => void load()} disabled={loading} title="Refresh balance">↻</button>
      </section>

      <section className="action-grid">
        <button className="wallet-action wallet-action--send" onClick={() => onNavigate('send')}>
          <span className="wallet-action__icon"><img src={pixelSend} alt="" /></span>
          <span><strong>Send</strong><small>Send WAM to another address</small></span>
          <span className="wallet-action__arrow">→</span>
        </button>
        <button className="wallet-action wallet-action--receive" onClick={() => onNavigate('receive')}>
          <span className="wallet-action__icon"><img src={pixelReceive} alt="" /></span>
          <span><strong>Receive</strong><small>Show your WAM address</small></span>
          <span className="wallet-action__arrow">→</span>
        </button>
      </section>

      <section className="wallet-panel address-panel">
        <div className="panel-heading"><div><span className="pixel-eyebrow">RECEIVING ADDRESS</span><h2>My WAM address</h2></div><button className="text-button-pixel" onClick={() => onNavigate('receive')}>View</button></div>
        {address ? <AddressDisplay address={address} /> : <span className="muted">Loading address…</span>}
      </section>

      <section className="wallet-panel">
        <div className="panel-heading"><div><span className="pixel-eyebrow">WALLET ACTIVITY</span><h2>Recent transactions</h2></div><button className="text-button-pixel" onClick={() => onNavigate('transactions')}>View all →</button></div>
        {transactions.length === 0 && <div className="pixel-empty">No transactions yet.</div>}
        <div className="tx-list">{transactions.map((tx) => <TransactionRow key={`${tx.txid}-${tx.timestamp}-${tx.direction}`} tx={tx} onClick={() => void openTransaction(tx)} />)}</div>
      </section>

      <div className="balance-mini-grid">
        <div><span>AVAILABLE</span><strong>{balances?.availableWam ?? '—'}</strong><small>WAM</small></div>
        <div><span>PENDING</span><strong>{balances?.pendingWam ?? '—'}</strong><small>WAM</small></div>
        <div><span>TOTAL</span><strong>{balances?.totalWam ?? '—'}</strong><small>WAM</small></div>
      </div>

      <TransactionDetailModal transaction={selectedTx} loading={detailLoading} detailError={detailError} onClose={() => { detailRequest.current++; setSelectedTx(null); setDetailLoading(false); setDetailError(null) }} />
    </div>
  )
}
