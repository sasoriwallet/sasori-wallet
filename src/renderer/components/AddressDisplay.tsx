import { useState } from 'react'

function shorten(address: string): string {
  if (address.length <= 18) return address
  return `${address.slice(0, 7)}...${address.slice(-6)}`
}

export function AddressDisplay({ address, full = false }: { address: string; full?: boolean }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <span className="address-display">
      <code className="address-text">{full ? address : shorten(address)}</code>
      <button className="icon-button" onClick={copy} title="Copy address" aria-label="Copy address">
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  )
}
