import { useEffect, useState } from 'react'
import { api, unwrap, toPageError } from '../services/api'
import { AddressDisplay } from '../components/AddressDisplay'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'
import sasoriImage from '../assets/sasori-logo.png'

type Stage = 'starting' | 'choose' | 'importing' | 'creating' | 'ready'

export function FirstRunWizard({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState<Stage>('starting')
  const [error, setError] = useState<PageError | null>(null)
  const [progress, setProgress] = useState(0)
  const [nodeMessage, setNodeMessage] = useState('Preparing WAM Mainnet…')
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function setupNode() {
    setError(null)
    setStage('starting')
    setProgress(1)
    setNodeMessage('Preparing WAM Mainnet…')
    try {
      await unwrap(api.node.setupManaged())
      setProgress(100)
      setNodeMessage('WAM Mainnet node is ready.')
      setStage('choose')
    } catch (err) {
      setError(toPageError(err, 'Could not download, install, or start the WAM node.'))
      setProgress(0)
      setNodeMessage('Node setup failed. Check the details below and retry.')
    }
  }

  useEffect(() => {
    let cancelled = false
    void setupNode()
    const timer = window.setInterval(async () => {
      try {
        const status = await unwrap(api.node.getSetupProgress())
        if (!cancelled && stage === 'starting') {
          setProgress(status.percent)
          setNodeMessage(status.message)
        }
      } catch { /* setup may not have started yet */ }
    }, 400)
    return () => { cancelled = true; window.clearInterval(timer) }
    // setupNode intentionally runs once on first render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function createWallet() {
    setBusy(true)
    setError(null)
    setStage('creating')
    setProgress(0)
    setNodeMessage('Creating a new local WAM wallet…')
    try {
      if (password.length < 8) throw new Error('Choose a wallet password of at least 8 characters.')
      if (password !== confirmPassword) throw new Error('The wallet passwords do not match.')
      const result = await unwrap(api.wallet.createNew(password))
      setPassword('')
      setConfirmPassword('')
      setProgress(100)
      setWalletAddress(result.address)
      setStage('ready')
    } catch (err) {
      setError(toPageError(err, 'Could not create the wallet.'))
      setStage('choose')
      setProgress(100)
    } finally {
      setBusy(false)
    }
  }

  async function importWallet() {
    setBusy(true)
    setError(null)
    setStage('importing')
    setProgress(0)
    setNodeMessage('Opening your wallet backup…')
    try {
      const result = await unwrap(api.wallet.restoreFromFile())
      if (!result) {
        setStage('choose')
        setProgress(100)
        return
      }
      setProgress(100)
      setWalletAddress(result.address)
      setStage('ready')
    } catch (err) {
      setError(toPageError(err, 'That wallet.dat could not be imported. Your original file was not modified.'))
      setStage('choose')
      setProgress(100)
    } finally {
      setBusy(false)
    }
  }

  const setupLabel = stage === 'starting' ? `${Math.round(progress)}%` : stage === 'importing' ? 'SCANNING' : ''

  return (
    <div className="first-run-overlay">
      <div className="first-run-card">
        <div className="first-run-logo"><img src={sasoriImage} alt="Sasori Wallet" /></div>
        <div className="first-run-version">SASORI WALLET <span>0.0.1v</span></div>

        {stage === 'starting' && (
          <>
            <div className="first-run-pixel-loader" aria-hidden="true">
              <div className="first-run-loader-core"><span /><span /><span /><span /></div>
              <div className="first-run-loader-ring"><i /><i /><i /><i /><i /><i /></div>
            </div>
            <div className="eyebrow">FIRST RUN · WAM MAINNET</div>
            <h1>Setting up your wallet</h1>
            <p className="muted">Sasori is installing the official WAM node locally. Nothing is sent to a remote wallet server.</p>
            <div className="setup-progress-wrap">
              <div className="setup-progress"><span style={{ width: `${progress}%` }} /></div>
              <strong>{setupLabel}</strong>
            </div>
            <div className="setup-status"><span className="spinner" /> {nodeMessage}</div>
            <div className="first-run-pixel-bars" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ animationDelay: `${i * 70}ms` }} />)}</div>
            <div className="setup-steps">
              <span className={progress >= 45 ? 'done' : ''}>Download</span>
              <span className={progress >= 65 ? 'done' : ''}>Verify</span>
              <span className={progress >= 72 ? 'done' : ''}>Install</span>
              <span className={progress >= 100 ? 'done' : ''}>Start node</span>
            </div>
            {error && <ErrorBanner {...error} />}
            {error && <button className="primary first-run-main-button" onClick={() => void setupNode()}>Retry setup</button>}
          </>
        )}

        {stage === 'choose' && (
          <>
            <div className="eyebrow">STEP 2 · YOUR WALLET</div>
            <h1>Choose your wallet</h1>
            <p className="muted">Sasori never selects a wallet automatically. Create a fresh WAM wallet or import an existing <strong>wallet.dat</strong> backup.</p>
            {error && <ErrorBanner {...error} />}
            <div className="first-run-password-grid">
              <label>
                New wallet password (Create only)
                <input type="password" value={password} placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
              </label>
              <label>
                Confirm password (Create only)
                <input type="password" value={confirmPassword} placeholder="Repeat password" onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
              </label>
            </div>
            <p className="tiny-note">These password fields are used only when creating a new wallet. Imports use the existing wallet's encryption/password state. New wallets are encrypted by the WAM node with this password. Sasori does not store it — losing the password can permanently lock you out of an encrypted wallet.</p>
            <div className="first-run-choice-grid">
              <button className="primary first-run-main-button" onClick={createWallet} disabled={busy || password.length < 8 || password !== confirmPassword}>Create new wallet</button>
              <button className="secondary first-run-main-button" onClick={importWallet} disabled={busy}>Import wallet.dat</button>
            </div>
            <p className="tiny-note">Your imported backup is copied into Sasori's local data directory. Your original file is never moved, deleted, uploaded, or overwritten.</p>
          </>
        )}

        {stage === 'creating' && (
          <>
            <div className="eyebrow">STEP 3 · CREATING</div>
            <h1>Creating your wallet</h1>
            <p className="muted">Sasori is generating a new wallet directly in the local WAM node. No private keys are sent to a remote server.</p>
            <div className="import-loader"><div className="spinner spinner--large" /><strong>CREATING</strong></div>
            <div className="setup-progress"><span className="setup-progress-indeterminate" /></div>
          </>
        )}

        {stage === 'importing' && (
          <>
            <div className="eyebrow">STEP 3 · IMPORTING</div>
            <h1>Loading your wallet</h1>
            <p className="muted">Restoring your keys and scanning the chain for your balance. Keep Sasori open until this finishes.</p>
            <div className="import-loader"><div className="spinner spinner--large" /><strong>SCANNING</strong></div>
            <div className="setup-progress"><span className="setup-progress-indeterminate" /></div>
          </>
        )}

        {stage === 'ready' && walletAddress && (
          <>
            <div className="eyebrow">COMPLETE</div>
            <h1>Your wallet is ready</h1>
            <p className="muted">The WAM Mainnet node is running locally and your wallet has been restored.</p>
            <div className="first-run-address"><AddressDisplay address={walletAddress} full /></div>
            <button className="primary first-run-main-button" onClick={onComplete}>Open Sasori Wallet</button>
          </>
        )}
      </div>
    </div>
  )
}
