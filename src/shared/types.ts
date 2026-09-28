import type { WamNetwork } from './wamAddress'

export type { WamNetwork }

export type NodeConnectionState = 'connected' | 'syncing' | 'disconnected'

export interface NodeStatus {
  state: NodeConnectionState
  network: WamNetwork
  currentBlock: number
  networkBlock: number | null
  syncPercent: number | null
  /** Present when state === 'disconnected' */
  errorMessage?: string
  version?: string
}

export interface RpcEndpointConfig {
  host: string
  port: number
  username: string
  /** Never sent to the renderer once saved; see security notes in settingsStore.ts */
  password: string
  useHttps: boolean
}

export interface AppSettings {
  network: WamNetwork
  rpc: Record<WamNetwork, RpcEndpointConfig>
  /** Name of the wallet this app loads/creates on the node, per network. Lets "load my own wallet file" coexist with the app's own auto-created wallet without name collisions. */
  walletName: Record<WamNetwork, string>
  /** Stable primary receiving address shown on Home/Receive. */
  primaryReceiveAddress: Partial<Record<WamNetwork, string>>
  explorerBaseUrl: string
  /** True only after Sasori has successfully installed/started its managed Mainnet node. */
  managedNodeSetupComplete: boolean
}

export interface WalletBalances {
  availableWam: string
  pendingWam: string
  immatureWam: string
  totalWam: string
}

export interface ReceiveAddress {
  address: string
  label: string
  createdAt: number
}

export interface TransactionSummary {
  txid: string
  direction: 'sent' | 'received' | 'self'
  amountWam: string
  feeWam: string | null
  confirmations: number
  timestamp: number
  address: string | null
  label: string | null
}

export interface TransactionDetail extends TransactionSummary {
  blockHash: string | null
  blockHeight: number | null
  rawHex: string | null
}

export interface CheckAddressResult {
  address: string
  network: WamNetwork
  balanceWam: string
  confirmedWam: string
  pendingWam: string
  utxoCount: number
  txCount: number | null
  lastActivity: number | null
}

export interface SendPrepareRequest {
  toAddress: string
  amountWam: string
  /** If unset, the daemon's own fee estimation is used. */
  feeRateWamPerKb?: string
}

export interface SendPrepareResult {
  /** Opaque token the main process uses to find the exact prepared tx again in confirmSend(). Never contains signing material. */
  reviewToken: string
  toAddress: string
  amountWam: string
  feeWam: string
  totalWam: string
  remainingBalanceWam: string
  estimatedVBytes: number
}

export interface SendConfirmResult {
  txid: string
  explorerUrl: string | null
}

export interface WalletCreateResult {
  address: string
  backupReminderShown: false
}

export interface WalletRestoreResult {
  walletName: string
  address: string
}

export interface WalletLockState {
  encrypted: boolean
  locked: boolean
}

/** Discriminated error shape returned (not thrown across IPC, which loses type info) by every main-process operation. */
export interface OperationError {
  code: string
  userMessage: string
  technicalDetail?: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: OperationError }
