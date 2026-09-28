import { useState } from 'react'
import { QRCodeImage } from '../components/QRCodeImage'
import sasoriImage from '../assets/sasori-logo.png'

const DONATION_ADDRESS = 'wam1qa2rjw9q8fgxnckjnjfy8005u974nmuvd2l3yh5'

export function DonatePage() {
  const [copied, setCopied] = useState(false)

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="page donate-page">
      <div className="donate-hero">
        <div className="donate-hero__backdrop" aria-hidden="true" />
        <div className="donate-threads" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="donate-hero__content">
          <div className="donate-avatar">
            <img src={sasoriImage} alt="Sasori" />
          </div>
          <div>
            <div className="eyebrow">SASORI WALLET</div>
            <h1>Support the creator</h1>
            <p>
              If you enjoy Sasori Wallet, you can support its development with a WAM donation.
              Every contribution helps keep the project moving and gives me more time to improve it.
            </p>
          </div>
        </div>

        <div className="donate-hero__badge">
          <span className="pulse-dot" />
          WAM MAINNET
        </div>
      </div>

      <section className="donate-grid">
        <div className="donate-card donate-card--address">
          <div className="donate-card__title-row">
            <div className="donate-icon">W</div>
            <div>
              <h2>Donation address</h2>
              <p>Send WAM directly to the address below.</p>
            </div>
          </div>

          <div className="donate-address-box">
            <code>{DONATION_ADDRESS}</code>
            <button className="copy-button" onClick={copyAddress} aria-label="Copy donation address">
              {copied ? '✓' : '⧉'}
            </button>
          </div>

          <button className="donate-primary" onClick={copyAddress}>
            <span>{copied ? 'Address copied' : 'Copy donation address'}</span>
            <span className="button-arrow">→</span>
          </button>

          <p className="donate-note">Only send WAM to this address.</p>
        </div>

        <div className="donate-card donate-card--qr">
          <div className="qr-glow" aria-hidden="true" />
          <div className="qr-frame">
            <QRCodeImage value={DONATION_ADDRESS} size={210} />
          </div>
          <h2>Scan to donate</h2>
          <p>Use your WAM wallet to scan this code.</p>
        </div>
      </section>

      <section className="support-strip">
        <div className="support-item">
          <span className="support-item__icon">✦</span>
          <div><strong>Development</strong><span>New features & improvements</span></div>
        </div>
        <div className="support-item">
          <span className="support-item__icon">⌁</span>
          <div><strong>Bug fixes</strong><span>A smoother wallet experience</span></div>
        </div>
        <div className="support-item">
          <span className="support-item__icon">◇</span>
          <div><strong>Community</strong><span>Keeping the project alive</span></div>
        </div>
      </section>

      <div className="donate-thanks">
        <span />
        <p>Thank you for supporting Sasori Wallet.</p>
        <span />
      </div>
    </div>
  )
}
