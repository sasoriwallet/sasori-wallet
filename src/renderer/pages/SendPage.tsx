import { useRef, useState } from 'react'
import jsQR from 'jsqr'
import { api, unwrap, toPageError } from '../services/api'
import type { SendConfirmResult, SendPrepareResult } from '@shared/types'
import { AddressDisplay } from '../components/AddressDisplay'
import { useWallet } from '../state/WalletContext'
import { ErrorBanner, type PageError } from '../components/ErrorBanner'

type Stage = 'form' | 'review' | 'sending' | 'sent'

/** Parses a scanned/pasted payment string. Supports a bare address, or a BIP21-style `wam:<address>?amount=<n>` URI. */
function parsePaymentString(raw: string): { address: string; amount?: string } {
  const trimmed = raw.trim()
  const match = trimmed.match(/^wam:([^?]+)(?:\?(.*))?$/i)
  if (!match) return { address: trimmed }
  const address = match[1]
  const params = new URLSearchParams(match[2] ?? '')
  const amount = params.get('amount') ?? undefined
  return { address, amount: amount ?? undefined }
}

export function SendPage() {
  const { settings } = useWallet()
  const [stage, setStage] = useState<Stage>('form')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [addressError, setAddressError] = useState<string | null>(null)
  const [review, setReview] = useState<SendPrepareResult | null>(null)
  const [sentResult, setSentResult] = useState<SendConfirmResult | null>(null)
  const [error, setError] = useState<PageError | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)



  async function validateAddressLive(value: string) {
    setToAddress(value)
    setError(null)
    if (!value.trim()) {
      setAddressError(null)
      return
    }
    try {
      const result = await unwrap(api.address.validateLocal(value))
      setAddressError(result.valid ? null : result.reason ?? 'Invalid address')
    } catch (err) {
      setAddressError(null)
      setError(toPageError(err, 'Could not validate the address.'))
    }
  }

  async function onScanFile(file: File) {
    setError(null)
    try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(bitmap, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(imageData.data, imageData.width, imageData.height)
    if (!code) {
      setError({ message: 'No QR code found in that image.' })
      return
    }
    const parsed = parsePaymentString(code.data)
    await validateAddressLive(parsed.address)
    if (parsed.amount) setAmount(parsed.amount)
    } catch (err) {
      setError(toPageError(err, 'Could not read that QR image.'))
    }
  }

  async function review_() {
    setBusy(true)
    setError(null)
    try {
      const result = await unwrap(api.tx.prepareSend({ toAddress, amountWam: amount }))
      setReview(result)
      setStage('review')
    } catch (err) {
      setError(toPageError(err, 'Could not prepare this transaction.'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmSend() {
    if (!review) return
    setStage('sending')
    setError(null)
    try {
      const result = await unwrap(api.tx.confirmSend(review.reviewToken))
      setSentResult(result)
      setStage('sent')
    } catch (err) {
      setError(toPageError(err, 'The transaction could not be sent.'))
      setStage('review')
    }
  }

  function resetForm() {
    setStage('form')
    setToAddress('')
    setAmount('')
    setReview(null)
    setSentResult(null)
    setError(null)
  }

  return (
    <div className="page">
      <h1>Send</h1>
      {error && <ErrorBanner {...error} />}

      {stage === 'form' && (
        <div className="card">
          <label>
            Recipient address
            <input placeholder="wam1..." value={toAddress} onChange={(e) => { void validateAddressLive(e.target.value) }} />
          </label>
          {addressError && <p className="error-text">{addressError}</p>}


          <label>
            Amount
            <input placeholder="0.00 WAM" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && onScanFile(e.target.files[0])}
          />
          <button onClick={() => fileInputRef.current?.click()}>Scan QR from image</button>

          <button
            className="primary"
            onClick={review_}
            disabled={busy || !toAddress || !amount || Boolean(addressError)}
          >
            {busy ? 'Preparing…' : 'Review Transaction'}
          </button>
        </div>
      )}

      {stage === 'review' && review && (
        <div className="card">
          <div className="card__header">Review Transaction</div>
          <div className="kv-grid">
            <span className="muted">Recipient</span>
            <AddressDisplay address={review.toAddress} full />
            <span className="muted">Amount</span>
            <span>{review.amountWam} WAM</span>
            <span className="muted">Fee</span>
            <span>{review.feeWam} WAM</span>
            <span className="muted">Total</span>
            <span>{review.totalWam} WAM</span>
            <span className="muted">Remaining balance</span>
            <span>{review.remainingBalanceWam} WAM</span>
          </div>
          <div className="button-row">
            <button onClick={resetForm}>Cancel</button>
            <button className="primary" onClick={confirmSend}>
              Confirm & Send
            </button>
          </div>
        </div>
      )}

      {stage === 'sending' && (
        <div className="card">
          <p>Signing transaction…</p>
          <p className="muted">Broadcasting transaction…</p>
        </div>
      )}

      {stage === 'sent' && sentResult && (
        <div className="card">
          <div className="card__header">Transaction Sent</div>
          <p className="muted">TXID</p>
          <AddressDisplay address={sentResult.txid} full />
          <div className="button-row">
            <button onClick={() => navigator.clipboard.writeText(sentResult.txid)}>Copy TXID</button>
            {(sentResult.explorerUrl || settings?.explorerBaseUrl) && (
              <button
                onClick={() =>
                  api.shell.openExternal(sentResult.explorerUrl ?? `${settings!.explorerBaseUrl.replace(/\/$/, '')}/tx/${sentResult.txid}`)
                }
              >
                Open in Explorer
              </button>
            )}
            <button className="primary" onClick={resetForm}>
              Send another
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
