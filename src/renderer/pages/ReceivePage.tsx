import { useEffect, useState } from 'react'
import { api, unwrap, toPageError } from '../services/api'
import { AddressDisplay } from '../components/AddressDisplay'
import { QRCodeImage } from '../components/QRCodeImage'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'

export function ReceivePage() {
  const [address, setAddress] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [extraAddresses, setExtraAddresses] = useState<string[]>([])
  const [error, setError] = useState<PageError | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    unwrap(api.wallet.getReceiveAddress())
      .then(setAddress)
      .catch((err) => setError(toPageError(err, 'Could not load your address.')))
  }, [])

  async function generateAnother() {
    setBusy(true)
    setError(null)
    try {
      const addr = await unwrap(api.wallet.generateNewAddress(label || 'receiving'))
      setExtraAddresses((prev) => [addr, ...prev])
      setLabel('')
    } catch (err) {
      setError(toPageError(err, 'Could not generate a new address.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Receive</h1>
      {error && <ErrorBanner {...error} />}

      <div className="card card--center">
        <div className="card__header">Your WAM Address</div>
        {address ? (
          <>
            <QRCodeImage value={address} />
            <AddressDisplay address={address} full />
            <div className="button-row">
              <button onClick={() => navigator.clipboard.writeText(address).catch((err) => setError(toPageError(err, 'Could not copy the address.')))}>Copy</button>
              <button onClick={() => navigator.share?.({ text: address }).catch(() => {})}>Share</button>
            </div>
          </>
        ) : (
          <p className="muted">Loading…</p>
        )}
        <p className="warning-text">Only send WAM Coin to this address.</p>
      </div>

      <div className="card">
        <div className="card__header">Generate another receiving address</div>
        <div className="inline-form">
          <input placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="primary" onClick={generateAnother} disabled={busy}>
            {busy ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {extraAddresses.length > 0 && (
          <ul className="address-list">
            {extraAddresses.map((a) => (
              <li key={a}>
                <AddressDisplay address={a} full />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
