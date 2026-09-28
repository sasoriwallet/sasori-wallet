import { useEffect, useState } from 'react'
import { WalletProvider, useWallet } from './state/WalletContext'
import { NodeStatusBadge } from './components/NodeStatusBadge'
import { HomePage } from './pages/HomePage'
import { SendPage } from './pages/SendPage'
import { ReceivePage } from './pages/ReceivePage'
import { CheckAddressPage } from './pages/CheckAddressPage'
import { SettingsPage } from './pages/SettingsPage'
import { TransactionsPage } from './pages/TransactionsPage'
import { DonatePage } from './pages/DonatePage'
import { FirstRunWizard } from './pages/FirstRunWizard'
import { api, unwrap, toPageError } from './services/api'
import pixelCoin from './assets/pixel/coin.svg'
import pixelLock from './assets/pixel/lock.svg'
import pixelReceive from './assets/pixel/receive.svg'
import sasoriImage from './assets/sasori-logo.png'

type Page = 'home' | 'send' | 'receive' | 'check' | 'transactions' | 'settings' | 'donate'

type NavItem = { id: Page; label: string; icon?: string }

const NAV: NavItem[] = [
  { id: 'home', label: 'Home' },
  { id: 'settings', label: 'Settings' },
  { id: 'donate', label: 'Donate' }
]

const ICONS: Record<string, string> = { home: pixelCoin, settings: pixelLock, donate: pixelReceive }

function LockScreen() {
  const { refreshLockState } = useWallet()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function unlock() {
    if (!password) return
    setBusy(true); setError('')
    try {
      await unwrap(api.wallet.unlock(password, 300))
      setPassword('')
      await refreshLockState()
    } catch (err) {
      setError(toPageError(err, 'Incorrect wallet password.').message)
    } finally { setBusy(false) }
  }

  return (
    <div className="lock-screen">
      <div className="lock-screen__scanlines" />
      <div className="lock-card">
        <div className="lock-card__logo"><img src={sasoriImage} alt="Sasori Wallet" /></div>
        <div className="pixel-eyebrow">SASORI WALLET // LOCKED</div>
        <h1>Wallet locked</h1>
        <p>Enter your wallet password to access your WAM funds.</p>
        <div className="lock-card__form">
          <input autoFocus type="password" value={password} placeholder="Wallet password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void unlock()} />
          <button className="pixel-button pixel-button--primary pixel-button--block" disabled={busy || !password} onClick={() => void unlock()}>
            <img src={pixelLock} alt="" /> {busy ? 'UNLOCKING…' : 'UNLOCK WALLET'}
          </button>
        </div>
        {error && <div className="pixel-alert pixel-alert--error">{error}</div>}
        <div className="lock-card__hint">Your password is used by the WAM wallet encryption system and is never stored in the renderer.</div>
      </div>
    </div>
  )
}


function NodeStartupScreen({
  error,
  connected,
  onRetry
}: {
  error: string | null
  connected: boolean
  onRetry: () => void
}) {
  const { nodeStatus } = useWallet()
  const [setupProgress, setSetupProgress] = useState<{ percent: number; message: string; state: string } | null>(null)
  const syncing = nodeStatus?.state === 'syncing'
  const percent = syncing && nodeStatus?.syncPercent != null
    ? Math.max(0, Math.min(100, nodeStatus.syncPercent))
    : connected
      ? 100
      : setupProgress?.percent ?? 8
  const message = connected
    ? 'Connected to WAM Mainnet — wallet is ready.'
    : setupProgress?.message ?? (syncing
      ? `Synchronizing WAM Mainnet… ${percent.toFixed(2)}%`
      : 'Starting the local WAM Mainnet node…')

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const progress = await unwrap(api.node.getSetupProgress())
        if (!cancelled) setSetupProgress(progress)
      } catch { /* startup progress is best-effort */ }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 500)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [])

  return (
    <div className="node-startup-screen">
      <div className="node-startup-grid" aria-hidden="true" />
      <div className="node-startup-card">
        <div className="pixel-loader-orb" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span /><span />
        </div>
        <div className="node-startup-brand">SASORI WALLET <b>0.0.1v</b></div>
        <div className="pixel-eyebrow">WAM MAINNET // LOCAL NODE</div>
        <h1>Starting your wallet</h1>
        <p className="node-startup-copy">
          Sasori is waiting for the local WAM node and wallet to become ready. This can take a few minutes on first startup.
        </p>

        <div className="node-startup-meter">
          <div className="node-startup-meter__bar">
            <span style={{ width: `${percent}%` }} />
          </div>
          <strong>{syncing ? `${percent.toFixed(0)}%` : connected ? 'READY' : 'WAIT'}</strong>
        </div>

        <div className="node-startup-status">
          <span className={`node-startup-led node-startup-led--${connected ? 'green' : syncing ? 'gold' : 'red'}`} />
          <span>{connected ? 'CONNECTED' : syncing ? 'SYNCING WAM MAINNET' : 'STARTING WAM NODE'}</span>
          <span className="node-startup-status__message">{message}</span>
        </div>

        <div className="pixel-loader-bars" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 80}ms` }} />)}
        </div>

        {nodeStatus?.currentBlock != null && nodeStatus.currentBlock > 0 && (
          <div className="node-startup-chain">
            <span>LOCAL BLOCK <b>{nodeStatus.currentBlock.toLocaleString()}</b></span>
            <span>NETWORK <b>{nodeStatus.networkBlock?.toLocaleString() ?? '—'}</b></span>
          </div>
        )}

        {error ? (
          <>
            <div className="pixel-alert pixel-alert--error">{error}</div>
            <button className="primary first-run-main-button" onClick={onRetry}>Retry connection</button>
          </>
        ) : (
          <div className="node-startup-note">KEEP SASORI OPEN · YOUR WALLET DATA STAYS LOCAL</div>
        )}
      </div>
    </div>
  )
}


function Shell() {
  const [page, setPage] = useState<Page>('home')
  const [startupReady, setStartupReady] = useState(false)
  const [startupConnected, setStartupConnected] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const { nodeStatus, settings, contextError, refreshSettings, refreshLockState, lockState } = useWallet()

  const needsSetup = settings != null && !settings.managedNodeSetupComplete

  useEffect(() => {
    if (!settings?.managedNodeSetupComplete) {
      setStartupReady(false)
      setStartupError(null)
      return
    }
    let cancelled = false
    setStartupReady(false)
    setStartupConnected(false)
    setStartupError(null)
    void unwrap(api.node.ensureReady())
      .then(async () => {
        if (cancelled) return
        await refreshLockState()
        if (cancelled) return
        setStartupConnected(true)
        window.setTimeout(() => { if (!cancelled) setStartupReady(true) }, 900)
      })
      .catch((err) => { if (!cancelled) setStartupError(toPageError(err, 'The local WAM node is not ready yet.').message) })
    return () => { cancelled = true }
  }, [settings?.managedNodeSetupComplete, refreshLockState])

  if (settings == null) {
    return <div className="app-loading"><img className="app-loading__logo" src={sasoriImage} alt="Sasori Wallet" /><div className="app-loading__brand">SASORI WALLET</div><div className="app-loading__version">0.0.1v</div><div className="app-loading__pixel-bars" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 80}ms` }} />)}</div><div className="app-loading__note">INITIALIZING LOCAL WALLET</div></div>
  }

  if (needsSetup) return <FirstRunWizard onComplete={refreshSettings} />
  if (!startupReady) return <NodeStartupScreen connected={startupConnected} error={startupError} onRetry={() => {
    setStartupError(null)
    setStartupReady(false)
    setStartupConnected(false)
    void unwrap(api.node.ensureReady())
      .then(async () => {
        await refreshLockState()
        setStartupConnected(true)
        window.setTimeout(() => setStartupReady(true), 900)
      })
      .catch((err) => setStartupError(toPageError(err, 'The local WAM node is not ready yet.').message))
  }} />
  if (lockState?.encrypted && lockState.locked) return <LockScreen />

  return (
    <div className="app-shell pixel-theme">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-logo"><img src={sasoriImage} alt="Sasori Wallet" /></div>
          <div>
            <div className="sidebar__brand">SASORI</div>
            <div className="sidebar__network">WAM MAINNET</div>
          </div>
        </div>

        <div className="sidebar__rule" />
        <div className="sidebar__label">MENU</div>
        <ul>
          {NAV.map((item) => (
            <li key={item.id}>
              <button className={item.id === page ? 'nav-item nav-item--active' : 'nav-item'} onClick={() => setPage(item.id)}>
                <span className="nav-item__icon"><img src={ICONS[item.id]} alt="" /></span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="sidebar__footer">
          <NodeStatusBadge status={nodeStatus} />
          <div className="sidebar__footer-meta">
            <span>SASORI WALLET</span>
            <span>v0.0.1v</span>
          </div>
        </div>
      </aside>

      <main className="content">
        {contextError && <div className="global-status-error">{contextError}</div>}
        <div className="topbar">
          <div className="topbar__title">{NAV.find((item) => item.id === page)?.label ?? 'Wallet'}</div>
          <div className="topbar__network"><span className="pulse-dot" /> WAM MAINNET</div>
        </div>
        <div className="content__inner">
          {page === 'home' && <HomePage onNavigate={(p) => setPage(p as Page)} />}
          {page === 'send' && <SendPage />}
          {page === 'receive' && <ReceivePage />}
          {page === 'check' && <CheckAddressPage />}
          {page === 'transactions' && <TransactionsPage />}
          {page === 'settings' && <SettingsPage />}
          {page === 'donate' && <DonatePage />}
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return <WalletProvider><Shell /></WalletProvider>
}
