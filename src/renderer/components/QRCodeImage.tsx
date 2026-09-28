import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function QRCodeImage({ value, size = 200 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError('Could not render QR code.')
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (error) return <div className="qr-error">{error}</div>
  if (!dataUrl) return <div className="qr-placeholder" style={{ width: size, height: size }} />
  return <img src={dataUrl} width={size} height={size} alt="QR code" className="qr-image" />
}
