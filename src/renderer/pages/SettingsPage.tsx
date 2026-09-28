import { useEffect, useState } from 'react'
import { api, unwrap, toPageError } from '../services/api'
import type { RpcEndpointConfig, WalletLockState, WamNetwork } from '@shared/types'
import { useWallet } from '../state/WalletContext'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'

const NETWORKS: WamNetwork[] = ['mainnet', 'testnet', 'regtest']

function emptyConfig(): RpcEndpointConfig {
  return { host: '127.0.0.1', port: 0, username: '', password: '', useHttps: false }
}

export function SettingsPage() {
  const { settings, refreshSettings, refreshNodeStatus } = useWallet()
  const [activeNetwork, setActiveNetwork] = useState<WamNetwork>('regtest')
  const [configs, setConfigs] = useState<Record<WamNetwork, RpcEndpointConfig>>({
    mainnet: emptyConfig(),
    testnet: emptyConfig(),
    regtest: emptyConfig()
  })
  const [explorerUrl, setExplorerUrl] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<PageError | null>(null)
  const [lockState, setLockState] = useState<WalletLockState | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [saving, setSaving] = useState(false)
  const [securityBusy, setSecurityBusy] = useState(false)

  useEffect(() => {
    if (!settings) return
    setActiveNetwork(settings.network)
    setConfigs(settings.rpc)
    setExplorerUrl(settings.explorerBaseUrl)
  }, [settings])

  useEffect(() => {
    unwrap(api.wallet.getLockState())
      .then(setLockState)
      .catch(() => setLockState(null))
  }, [])

  function updateConfig(network: WamNetwork, patch: Partial<RpcEndpointConfig>) {
    setConfigs((prev) => ({ ...prev, [network]: { ...prev[network], ...patch } }))
  }

  async function saveNetworkAndRpc() {
    setStatus(null)
    setSaving(true)
    setError(null)
    try {
      await unwrap(api.settings.setNetwork(activeNetwork))
      await unwrap(api.settings.setRpcConfig(activeNetwork, configs[activeNetwork]))
      await unwrap(api.settings.setExplorerUrl(explorerUrl))
      await refreshSettings()
      await refreshNodeStatus()
      setStatus('Saved.')
    } catch (err) {
      setError(toPageError(err, 'Could not save settings.'))
    } finally {
      setSaving(false)
    }
  }

  async function encryptWallet() {
    setSecurityBusy(true)
    setError(null)
    try {
      await unwrap(api.wallet.encrypt(passphrase))
      setPassphrase('')
      setLockState(await unwrap(api.wallet.getLockState()))
      setStatus('Wallet password enabled. Sasori will require it when the wallet opens.')
    } catch (err) {
      setError(toPageError(err, 'Could not encrypt the wallet.'))
    } finally { setSecurityBusy(false) }
  }

  async function unlockWallet() {
    setSecurityBusy(true)
    setError(null)
    try {
      await unwrap(api.wallet.unlock(passphrase, 300))
      setPassphrase('')
      setLockState(await unwrap(api.wallet.getLockState()))
      setStatus('Wallet unlocked for 5 minutes.')
    } catch (err) {
      setError(toPageError(err, 'Could not unlock the wallet.'))
    } finally { setSecurityBusy(false) }
  }

  async function lockWallet() {
    setSecurityBusy(true); setError(null)
    try { await unwrap(api.wallet.lock()); setLockState(await unwrap(api.wallet.getLockState())); setStatus('Wallet locked.') }
    catch (err) { setError(toPageError(err, 'Could not lock the wallet.')) }
    finally { setSecurityBusy(false) }
  }

  async function backupWallet() {
    setError(null)
    try {
      const result = await unwrap(api.wallet.backup())
      setStatus(result ? `Backed up to ${result.path}` : null)
    } catch (err) {
      setError(toPageError(err, 'Backup failed.'))
    }
  }

  async function rescan() {
    if (!confirm('Rescanning re-reads the blockchain for this wallet\'s transactions. It can take a while and will not delete any wallet data. Continue?')) {
      return
    }
    setError(null)
    try {
      await unwrap(api.wallet.rescan())
      setStatus('Rescan started.')
    } catch (err) {
      setError(toPageError(err, 'Could not start rescan.'))
    }
  }

  async function loadWalletFile() {
    setError(null)
    try {
      const result = await unwrap(api.wallet.restoreFromFile())
      if (!result) return // user cancelled the file picker
      setStatus(`Loaded wallet file -- now using wallet "${result.walletName}".`)
      await refreshSettings()
    } catch (err) {
      setError(toPageError(err, 'Could not load that wallet file.'))
    }
  }

  const config = configs[activeNetwork]

  return (
    <div className="page">
      <h1>Settings</h1>
      {status && <div className="banner banner--info">{status}</div>}
      {error && <ErrorBanner {...error} />}

      <div className="card">
        <div className="card__header">Network</div>
        <div className="radio-group">
          {NETWORKS.map((n) => (
            <label key={n} className={activeNetwork === n ? 'radio radio--selected' : 'radio'}>
              <input type="radio" checked={activeNetwork === n} onChange={() => setActiveNetwork(n)} />
              {n.toUpperCase()}
            </label>
          ))}
        </div>

        <div className="card__header">Node connection ({activeNetwork})</div>
        <p className="muted">Nothing here is pre-filled with a guessed value — enter the real values from your node's wam.conf.</p>
        <label>
          RPC host
          <input value={config.host} onChange={(e) => updateConfig(activeNetwork, { host: e.target.value })} />
        </label>
        <label>
          RPC port
          <input
            type="number"
            value={config.port || ''}
            onChange={(e) => updateConfig(activeNetwork, { port: Number(e.target.value) })}
          />
        </label>
        <label>
          RPC username
          <input value={config.username} onChange={(e) => updateConfig(activeNetwork, { username: e.target.value })} />
        </label>
        <label>
          RPC password
          <input type="password" value={config.password} onChange={(e) => updateConfig(activeNetwork, { password: e.target.value })} />
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={config.useHttps} onChange={(e) => updateConfig(activeNetwork, { useHttps: e.target.checked })} />
          Connect over HTTPS
        </label>

        <div className="card__header">Explorer</div>
        <label>
          Explorer base URL (used for "Open in Explorer" links)
          <input
            placeholder="https://explorer.example.org"
            value={explorerUrl}
            onChange={(e) => setExplorerUrl(e.target.value)}
          />
        </label>

        <button className="primary" onClick={saveNetworkAndRpc} disabled={saving}>
          {saving ? 'Saving…' : 'Save Connection Settings'}
        </button>
      </div>

      <div className="card">
        <div className="card__header">Wallet Security</div>
        {lockState ? (
          <p>
            Wallet is {lockState.encrypted ? 'encrypted' : 'not encrypted'}
            {lockState.encrypted ? `, currently ${lockState.locked ? 'locked' : 'unlocked'}` : ''}.
          </p>
        ) : (
          <p className="muted">Connect to a node to see wallet security status.</p>
        )}

        <label>
          Passphrase
          <input type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        </label>
        <div className="button-row">
          {!lockState?.encrypted && (
            <button className="primary" onClick={encryptWallet} disabled={!passphrase || securityBusy}>
              {securityBusy ? 'Working…' : 'Encrypt Wallet'}
            </button>
          )}
          {lockState?.encrypted && lockState.locked && (
            <button className="primary" onClick={unlockWallet} disabled={!passphrase || securityBusy}>
              {securityBusy ? 'Working…' : 'Unlock (5 min)'}
            </button>
          )}
          {lockState?.encrypted && !lockState.locked && <button onClick={lockWallet} disabled={securityBusy}>{securityBusy ? 'Working…' : 'Lock Now'}</button>}
        </div>
      </div>

      <div className="card">
        <div className="card__header">Backup & Advanced</div>
        {settings?.walletName?.[activeNetwork] && (
          <p className="muted">Active wallet on this network: {settings.walletName[activeNetwork]}</p>
        )}
        <p className="warning-text">Anyone with this backup may be able to control your funds. Keep it private.</p>
        <div className="button-row">
          <button className="primary" onClick={backupWallet}>
            Backup Wallet
          </button>
          <button onClick={loadWalletFile}>Load Wallet File (.dat)</button>
          <button onClick={rescan}>Rescan Blockchain</button>
        </div>
      </div>
    </div>
  )
}
