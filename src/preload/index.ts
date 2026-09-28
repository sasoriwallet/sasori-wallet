import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CheckAddressResult,
  NodeStatus,
  Result,
  RpcEndpointConfig,
  SendConfirmResult,
  SendPrepareRequest,
  SendPrepareResult,
  TransactionDetail,
  TransactionSummary,
  WalletBalances,
  WalletLockState,
  WalletRestoreResult,
  WamNetwork
} from '@shared/types'
import type { AddressValidationResult } from '@shared/wamAddress'

function invoke<T>(channel: string, ...args: unknown[]): Promise<Result<T>> {
  return ipcRenderer.invoke(channel, ...args)
}

/**
 * This is the ENTIRE surface the renderer can reach. No filesystem, no
 * `require`, no Node globals -- only these specific, argument-typed calls.
 * contextIsolation + this bridge is what keeps a compromised or buggy
 * renderer (e.g. from a malicious QR payload or a XSS-like bug in a
 * third-party UI dependency) from being able to touch the filesystem or the
 * RPC credentials directly.
 */
const api = {
  settings: {
    get: () => invoke<AppSettings>('settings:get'),
    setNetwork: (network: WamNetwork) => invoke<null>('settings:setNetwork', network),
    setRpcConfig: (network: WamNetwork, config: RpcEndpointConfig) => invoke<null>('settings:setRpcConfig', network, config),
    setExplorerUrl: (url: string) => invoke<null>('settings:setExplorerUrl', url)
  },
  node: {
    getStatus: () => invoke<NodeStatus>('node:getStatus'),
    getSetupProgress: () => invoke<{ percent: number; message: string; state: string }>('node:getSetupProgress'),
    ensureReady: () => invoke<{ ready: true }>('node:ensureReady'),
    setupManaged: () => invoke<{ dataDir: string; nodeDir: string; nodeVersion: string; walletName: string; usedExistingNode: boolean }>('node:setupManaged')
  },
  wallet: {
    ensureLoaded: () => invoke<{ created: boolean }>('wallet:ensureLoaded'),
    createNew: (passphrase: string) => invoke<{ walletName: string; address: string }>('wallet:createNew', passphrase),
    restoreFromFile: () => invoke<WalletRestoreResult | null>('wallet:restoreFromFile'),
    getBalances: () => invoke<WalletBalances>('wallet:getBalances'),
    getReceiveAddress: () => invoke<string>('wallet:getReceiveAddress'),
    generateNewAddress: (label: string) => invoke<string>('wallet:generateNewAddress', label),
    getLockState: () => invoke<WalletLockState>('wallet:getLockState'),
    encrypt: (passphrase: string) => invoke<null>('wallet:encrypt', passphrase),
    unlock: (passphrase: string, timeoutSeconds: number) => invoke<null>('wallet:unlock', passphrase, timeoutSeconds),
    lock: () => invoke<null>('wallet:lock'),
    backup: () => invoke<{ path: string } | null>('wallet:backup'),
    rescan: () => invoke<null>('wallet:rescan')
  },
  address: {
    validateLocal: (address: string) => invoke<AddressValidationResult>('address:validateLocal', address),
    check: (address: string) => invoke<CheckAddressResult>('address:check', address)
  },
  tx: {
    history: (count?: number) => invoke<TransactionSummary[]>('tx:history', count),
    detail: (txid: string) => invoke<TransactionDetail>('tx:detail', txid),
    prepareSend: (request: SendPrepareRequest) => invoke<SendPrepareResult>('tx:prepareSend', request),
    confirmSend: (reviewToken: string) => invoke<SendConfirmResult>('tx:confirmSend', reviewToken)
  },
  shell: {
    openExternal: (url: string) => invoke<null>('shell:openExternal', url)
  }
}

export type WamWalletApi = typeof api

contextBridge.exposeInMainWorld('wam', api)
