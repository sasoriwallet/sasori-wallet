import { randomUUID } from 'crypto'
import { WamRpcClient } from '../rpc/WamRpcClient'
import { assertAddressOnNetwork } from '@shared/wamAddress'
import { parseWamToWamoshi, rpcAmountToWamoshi, formatWamoshi, wamoshiToRpcAmount } from '@shared/amount'
import type {
  CheckAddressResult,
  SendConfirmResult,
  SendPrepareRequest,
  SendPrepareResult,
  TransactionDetail,
  TransactionSummary,
  WamNetwork
} from '@shared/types'

interface PreparedSend {
  hex: string
  toAddress: string
  amountWam: string
  feeWam: string
  expiresAt: number
}

const REVIEW_TTL_MS = 5 * 60_000

/**
 * Holds prepared-but-unsigned/unbroadcast transactions between the "Review"
 * and "Confirm & Send" steps. Never persisted to disk, never contains a
 * private key (the node holds those) -- only an unsigned raw transaction
 * hex, which is useless without the wallet's keys.
 */
const pendingReviews = new Map<string, PreparedSend>()

function pruneExpiredReviews() {
  const now = Date.now()
  for (const [token, review] of pendingReviews) {
    if (review.expiresAt < now) pendingReviews.delete(token)
  }
}

export class TransactionService {
  constructor(private readonly rpc: WamRpcClient, private readonly network: WamNetwork, private readonly explorerBaseUrl: string) {}

  async prepareSend(request: SendPrepareRequest): Promise<SendPrepareResult> {
    pruneExpiredReviews()

    const localCheck = assertAddressOnNetwork(request.toAddress, this.network)
    if (!localCheck.valid) {
      throw new Error(localCheck.reason)
    }

    // Defense in depth: also ask the node itself, since it knows the true
    // consensus rules with certainty this wallet's researched constants do not.
    try {
      const nodeCheck = await this.rpc.validateAddress(request.toAddress)
      if (!nodeCheck.isvalid) {
        throw new Error('The WAM node reports this address is invalid.')
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('The WAM node reports')) throw err
      // If validateaddress itself is unreachable, fall through on the local
      // check alone rather than blocking sends entirely on a node hiccup --
      // but this is surfaced in the technical detail on failure elsewhere.
    }

    const amountWamoshi = parseWamToWamoshi(request.amountWam)

    const balances = await this.rpc.getBalances()
    const availableWamoshi = rpcAmountToWamoshi(balances.mine.trusted)
    if (amountWamoshi > availableWamoshi) {
      throw new Error('Insufficient WAM balance for this amount.')
    }

    const unfundedHex = await this.rpc.createRawTransaction([], { [request.toAddress]: Number(wamoshiToRpcAmount(amountWamoshi)) })

    let feeRateWamPerKb: number | undefined
    if (request.feeRateWamPerKb) {
      feeRateWamPerKb = Number(request.feeRateWamPerKb)
    }
    const funded = await this.rpc.fundRawTransaction(unfundedHex, feeRateWamPerKb)

    const feeWamoshi = rpcAmountToWamoshi(funded.fee)
    const totalWamoshi = amountWamoshi + feeWamoshi
    if (totalWamoshi > availableWamoshi) {
      throw new Error('Insufficient WAM balance to cover the amount plus the network fee.')
    }

    const decoded = await this.rpc.decodeRawTransaction(funded.hex)

    const reviewToken = randomUUID()
    pendingReviews.set(reviewToken, {
      hex: funded.hex,
      toAddress: request.toAddress,
      amountWam: wamoshiToRpcAmount(amountWamoshi),
      feeWam: wamoshiToRpcAmount(feeWamoshi),
      expiresAt: Date.now() + REVIEW_TTL_MS
    })

    return {
      reviewToken,
      toAddress: request.toAddress,
      amountWam: wamoshiToRpcAmount(amountWamoshi),
      feeWam: wamoshiToRpcAmount(feeWamoshi),
      totalWam: wamoshiToRpcAmount(totalWamoshi),
      remainingBalanceWam: wamoshiToRpcAmount(availableWamoshi - totalWamoshi),
      estimatedVBytes: Math.ceil(decoded.vin.length * 68 + decoded.vout.length * 33 + 11) // rough vsize estimate for display only; the real fee already came from the node
    }
  }

  /** The only method in this service that touches signing keys or the network -- and only after explicit user confirmation upstream in the IPC handler. */
  async confirmSend(reviewToken: string): Promise<SendConfirmResult> {
    pruneExpiredReviews()
    const review = pendingReviews.get(reviewToken)
    if (!review) {
      throw new Error('This transaction review has expired. Please review the transaction again before sending.')
    }
    pendingReviews.delete(reviewToken)

    const signed = await this.rpc.signRawTransactionWithWallet(review.hex)
    if (!signed.complete) {
      const detail = signed.errors?.map((e) => e.error).join('; ')
      throw new Error(`The node could not sign this transaction${detail ? `: ${detail}` : '.'} (Is the wallet unlocked?)`)
    }

    const txid = await this.rpc.sendRawTransaction(signed.hex)

    return {
      txid,
      explorerUrl: this.explorerBaseUrl ? `${this.explorerBaseUrl.replace(/\/$/, '')}/tx/${txid}` : null
    }
  }

  async getHistory(count = 50): Promise<TransactionSummary[]> {
    const raw = await this.rpc.listTransactions(count, 0)
    return raw
      .map((tx) => ({
        txid: tx.txid,
        direction: (tx.category === 'receive' || tx.category === 'generate' ? 'received' : tx.category === 'send' ? 'sent' : 'self') as TransactionSummary['direction'],
        amountWam: formatWamoshi(rpcAmountToWamoshi(Math.abs(tx.amount))),
        feeWam: tx.fee != null ? formatWamoshi(rpcAmountToWamoshi(Math.abs(tx.fee))) : null,
        confirmations: tx.confirmations,
        timestamp: tx.time * 1000,
        address: tx.address ?? null,
        label: tx.label ?? null
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, count)
  }

  async getTransactionDetail(txid: string): Promise<TransactionDetail> {
    const tx = await this.rpc.getTransaction(txid)
    const primary = tx.details[0]
    return {
      txid: tx.txid,
      direction: primary?.category === 'receive' ? 'received' : primary?.category === 'send' ? 'sent' : 'self',
      amountWam: formatWamoshi(rpcAmountToWamoshi(Math.abs(primary?.amount ?? 0))),
      feeWam: null,
      confirmations: tx.confirmations,
      timestamp: tx.time * 1000,
      address: primary?.address ?? null,
      label: null,
      blockHash: tx.blockhash ?? null,
      blockHeight: tx.blockheight ?? null,
      rawHex: tx.hex
    }
  }

  /**
   * Read-only lookup for an address NOT necessarily owned by this wallet.
   * Uses `scantxoutset`, which scans the UTXO set directly and does not
   * import the address or touch wallet state in any way -- matches the
   * spec's explicit requirement that this never become an import.
   */
  async checkAddress(address: string): Promise<CheckAddressResult> {
    const localCheck = assertAddressOnNetwork(address, this.network)
    if (!localCheck.valid) {
      throw new Error(localCheck.reason)
    }

    try {
      const info = await this.rpc.getAddressInfo(address)
      if (info.ismine) {
        const utxos = await this.rpc.listUnspent(0, 9_999_999, [address])
        let confirmedWamoshi = 0n
        let pendingWamoshi = 0n
        for (const utxo of utxos) {
          const value = rpcAmountToWamoshi(utxo.amount)
          if (utxo.confirmations > 0) confirmedWamoshi += value
          else pendingWamoshi += value
        }
        return {
          address, network: this.network,
          balanceWam: formatWamoshi(confirmedWamoshi + pendingWamoshi),
          confirmedWam: formatWamoshi(confirmedWamoshi),
          pendingWam: formatWamoshi(pendingWamoshi),
          utxoCount: utxos.length, txCount: null, lastActivity: null
        }
      }
    } catch {
      // Fall back to the read-only chainstate scan for external addresses.
    }

    const scan = await this.rpc.scanAddressUtxoSet(address)
    const confirmedWamoshi = rpcAmountToWamoshi(scan.total_amount)

    return {
      address, network: this.network,
      balanceWam: formatWamoshi(confirmedWamoshi),
      confirmedWam: formatWamoshi(confirmedWamoshi),
      pendingWam: '0.00000000',
      utxoCount: scan.unspents.length, txCount: null, lastActivity: null
    }
  }
}
