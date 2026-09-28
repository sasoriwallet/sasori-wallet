import type { WalletBalances } from '@shared/types'

export function BalanceCard({
  balances,
  loading,
  onRefresh
}: {
  balances: WalletBalances | null
  loading: boolean
  onRefresh: () => void
}) {
  return (
    <div className="balance-card">
      <div className="balance-card__header">
        <span className="balance-card__label">WAM Balance</span>
        <button className="icon-button" onClick={onRefresh} disabled={loading} title="Refresh balance" aria-label="Refresh balance">
          {loading ? '…' : '↻'}
        </button>
      </div>
      <div className="balance-card__total">{balances ? balances.availableWam : '0.00000000'} <span>WAM</span></div>
      <div className="balance-card__breakdown">
        <div>
          <span className="muted">Available</span>
          <span>{balances?.availableWam ?? '—'}</span>
        </div>
        <div>
          <span className="muted">Pending</span>
          <span>{balances?.pendingWam ?? '—'}</span>
        </div>
        <div>
          <span className="muted">Total</span>
          <span>{balances?.totalWam ?? '—'}</span>
        </div>
      </div>
    </div>
  )
}
