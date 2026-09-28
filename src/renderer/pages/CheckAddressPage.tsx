import { useEffect, useRef, useState } from 'react'
import { api, unwrap, toPageError } from '../services/api'
import type { CheckAddressResult } from '@shared/types'
import { AddressDisplay } from '../components/AddressDisplay'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'
import { useWallet } from '../state/WalletContext'

export function CheckAddressPage() {
  const { settings } = useWallet()
  const [input, setInput] = useState('')
  const [result, setResult] = useState<CheckAddressResult | null>(null)
  const [error, setError] = useState<PageError | null>(null)
  const [busy, setBusy] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const activeRef = useRef(false)
  const mountedRef = useRef(true)

  async function check(silent = false) {
    const address = input
    if (activeRef.current || !address.trim()) return
    activeRef.current = true
    if (!silent) { setBusy(true); setError(null) }
    try {
      const local = await unwrap(api.address.validateLocal(address))
      if (!local.valid) {
        if (!silent) setError({ message: local.reason ?? 'Invalid WAM address.' })
        return
      }
      const checked = await unwrap(api.address.check(address))
      if (!mountedRef.current) return
      setResult(checked)
      setLastUpdated(Date.now())
      if (!silent) setError(null)
    } catch (err) {
      if (mountedRef.current && !silent) setError(toPageError(err, 'Could not check that address.'))
    } finally {
      if (mountedRef.current && !silent) setBusy(false)
      activeRef.current = false
    }
  }

  useEffect(() => () => { mountedRef.current = false }, [])
  useEffect(() => {
    if (!result || !input.trim()) return
    const id = window.setInterval(() => { void check(true) }, 5_000)
    return () => window.clearInterval(id)
  }, [result, input])

  const handleInput = (value: string) => {
    setInput(value)
    setError(null)
    if (!value.trim()) { setResult(null); setLastUpdated(null) }
  }

  return (
    <div className="page check-page">
      <div className="page-heading"><div><div className="eyebrow">READ-ONLY LOOKUP</div><h1>Check Address</h1><p className="muted">Watch a WAM address without importing it into your wallet.</p></div><div className="live-chip"><span /> Live lookup</div></div>
      {error && <ErrorBanner {...error} />}
      <div className="lookup-layout">
        <section className="card lookup-card">
          <div className="card__header"><span>Address</span><span className="muted">No private keys involved</span></div>
          <input aria-label="WAM address" spellCheck={false} autoComplete="off" placeholder="wam1…" value={input} onChange={(e) => handleInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void check() }} />
          <div className="lookup-actions"><button className="primary" onClick={() => void check()} disabled={busy || !input.trim()}>{busy ? <><span className="spinner" /> Checking…</> : 'Check balance'}</button>{result && <button onClick={() => void check()} disabled={busy}>Refresh</button>}</div>
          <p className="hint">Spaces and invalid characters are rejected safely. Nothing is imported or modified.</p>
        </section>
        {result ? <section className="card lookup-result">
          <div className="card__header"><span>Live balance</span><span className="live-status"><span className="live-status__dot" /> {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleTimeString()}` : 'Updating'}</span></div>
          <div className="lookup-total">{result.balanceWam}<small> WAM</small></div>
          <div className="metric-row"><div><span>Confirmed</span><strong>{result.confirmedWam}</strong></div><div><span>Pending</span><strong>{result.pendingWam}</strong></div><div><span>UTXOs</span><strong>{result.utxoCount}</strong></div></div>
          <div className="lookup-address"><span>Address</span><AddressDisplay address={result.address} full /></div>
          {settings?.explorerBaseUrl && <button onClick={() => api.shell.openExternal(`${settings.explorerBaseUrl.replace(/\/$/, '')}/address/${result.address}`)}>Open in Explorer</button>}
        </section> : <section className="card lookup-empty"><div className="empty-icon">⌕</div><strong>Enter a WAM address</strong><span>Balance, confirmations and UTXO count will appear here.</span></section>}
      </div>
    </div>
  )
}
