import type { RpcEndpointConfig } from '@shared/types'

interface JsonRpcSuccess<T> {
  result: T
  error: null
  id: string
}
interface JsonRpcFailure {
  result: null
  error: { code: number; message: string }
  id: string
}

export class RpcError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'RpcError'
  }
}

/**
 * Empty by default on purpose. Sasori must receive an explicit wallet name
 * from settings after the user creates or imports a wallet. This prevents a
 * fresh installation from silently selecting a wallet such as 'mine'.
 */
export const WALLET_NAME = ''

/**
 * Thin client over a Bitcoin-Core-style JSON-RPC endpoint. WAM Coin's own
 * documentation says it inherits ~250,000 lines of Bitcoin Core, including
 * "UTXO management and wallet code", so the standard Bitcoin Core RPC
 * surface (method names, param order, JSON-RPC 1.0 single-endpoint style) is
 * the best-founded assumption available without a compiled node to query
 * `help` against directly. The WAM-specific methods (getsupplyinfo etc.) are
 * taken verbatim from the project's own README.
 *
 * Bitcoin-Core-style daemons route RPCs to one of two endpoints:
 *   - the base endpoint (http://host:port/) for node/blockchain-level calls
 *     (getblockchaininfo, validateaddress, scantxoutset, createwallet, ...)
 *   - a per-wallet endpoint (http://host:port/wallet/<name>) for anything
 *     that reads or touches a specific wallet's keys/UTXOs (getbalances,
 *     getnewaddress, listtransactions, fundrawtransaction, ...)
 * Earlier this client only ever hit the base endpoint, which happens to
 * still work by implicit single-wallet auto-routing IF the node has exactly
 * one wallet loaded -- but breaks as soon as that stops being true (a second
 * wallet exists, a differently-named wallet was already loaded, etc). Every
 * wallet-scoped method below now explicitly requests the wallet endpoint.
 *
 * This client deliberately does NOT cache or globally store credentials --
 * it is handed a fresh RpcEndpointConfig by the caller (see settingsStore.ts)
 * on every construction, so there is exactly one place in the app that reads
 * the saved password off disk.
 */
export class WamRpcClient {
  private readonly baseUrl: string
  private readonly walletUrl: string
  private readonly walletName: string
  private readonly authHeader: string
  private requestCounter = 0

  getWalletName(): string { return this.walletName }

  constructor(config: RpcEndpointConfig, walletName: string = WALLET_NAME) {
    const protocol = config.useHttps ? 'https' : 'http'
    this.baseUrl = `${protocol}://${config.host}:${config.port}`
    this.walletName = walletName
    this.walletUrl = `${this.baseUrl}/wallet/${encodeURIComponent(walletName)}`
    this.authHeader = 'Basic ' + Buffer.from(`${config.username}:${config.password}`).toString('base64')
  }

  private async call<T>(method: string, params: unknown[] = [], opts: { wallet?: boolean; timeoutMs?: number } = {}): Promise<T> {
    const url = opts.wallet ? this.walletUrl : this.baseUrl
    const id = `wam-wallet-${++this.requestCounter}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: this.authHeader
        },
        body: JSON.stringify({ jsonrpc: '1.0', id, method, params }),
        signal: controller.signal
      })
    } catch (err) {
      clearTimeout(timeout)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new RpcError(-32000, `Timed out waiting for the node to respond to ${method}.`)
      }
      throw err // other network-level error; caller translates via rpcErrors.ts
    }
    clearTimeout(timeout)

    if (response.status === 401) {
      throw new RpcError(-32602, 'RPC authentication failed (check username/password in Settings).')
    }
    if (response.status === 404 && opts.wallet) {
      throw new RpcError(-18, `No wallet named "${this.walletName}" is loaded on the node.`)
    }
    if (!response.ok) {
      throw new RpcError(-32001, `The WAM node returned HTTP ${response.status} for ${method}.`)
    }

    let body: JsonRpcSuccess<T> | JsonRpcFailure
    try {
      body = (await response.json()) as JsonRpcSuccess<T> | JsonRpcFailure
    } catch {
      throw new RpcError(-32700, `The node returned a response this wallet could not parse (HTTP ${response.status}) for ${method}.`)
    }

    if (body.error) {
      throw new RpcError(body.error.code, body.error.message)
    }
    return body.result as T
  }

  // ---- Node / chain state (base endpoint) ----------------------------------

  getBlockchainInfo() {
    return this.call<{
      chain: string
      blocks: number
      headers: number
      verificationprogress: number
      initialblockdownload: boolean
      bestblockhash: string
    }>('getblockchaininfo')
  }

  getNetworkInfo() {
    return this.call<{ version: number; subversion: string; connections: number }>('getnetworkinfo')
  }

  // ---- WAM-specific RPCs (base endpoint; names confirmed from the README) -----

  getSupplyInfo() {
    return this.call<Record<string, unknown>>('getsupplyinfo')
  }

  getDevFeeInfo(blockHash?: string) {
    return this.call<Record<string, unknown>>('getdevfeeinfo', blockHash ? [blockHash] : [])
  }

  getRandomXInfo() {
    return this.call<Record<string, unknown>>('getrandomxinfo')
  }

  getEmissionSchedule() {
    return this.call<Record<string, unknown>>('getemissionschedule')
  }

  // ---- Wallet lifecycle (base endpoint -- these manage which wallets exist) ---

  listWallets() {
    return this.call<string[]>('listwallets')
  }

  createWallet(name: string, passphrase?: string) {
    // descriptor wallets are Bitcoin Core's modern default; disable_private_keys=false, blank=false
    return this.call<{ name: string; warning?: string }>('createwallet', [name, false, false, passphrase ?? '', false, true])
  }

  loadWallet(name: string) {
    // Loading an existing wallet can take minutes while the daemon opens and
    // indexes a large wallet.dat. Never fail after the renderer's short RPC
    // timeout and accidentally make startup look broken.
    return this.call<{ name: string; warning?: string }>('loadwallet', [name], { timeoutMs: 10 * 60_000 })
  }

  unloadWallet(name: string) {
    return this.call<{ warning?: string }>('unloadwallet', [name])
  }

  /**
   * Loads an existing wallet backup file (a .dat file -- legacy BDB or
   * modern SQLite format, the node handles both transparently) as a new
   * wallet under `name`. This is the RPC path for "I already have a wallet
   * file, just load it" instead of generating a fresh one. NOTE: `backupFile`
   * is a path the NODE process reads from ITS OWN filesystem -- this only
   * works cleanly when the wallet app and the node run on the same machine
   * (true for this app's normal local-node setup); for a remote node the
   * path would need to already exist on that remote machine.
   */
  restoreWallet(name: string, backupFilePath: string) {
    return this.call<{ name: string; warning?: string }>('restorewallet', [name, backupFilePath])
  }

  // ---- Everything below operates on THIS wallet -- routed to /wallet/<name> ---

  getWalletInfo(timeoutMs = 120_000) {
    return this.call<{
      walletname: string
      balance: number
      unconfirmed_balance: number
      immature_balance: number
      unlocked_until?: number
    }>('getwalletinfo', [], { wallet: true, timeoutMs })
  }

  encryptWallet(passphrase: string) {
    return this.call<string>('encryptwallet', [passphrase], { wallet: true })
  }

  walletPassphrase(passphrase: string, timeoutSeconds: number) {
    return this.call<null>('walletpassphrase', [passphrase, timeoutSeconds], { wallet: true })
  }

  walletLock() {
    return this.call<null>('walletlock', [], { wallet: true })
  }

  backupWallet(destinationPath: string) {
    return this.call<null>('backupwallet', [destinationPath], { wallet: true })
  }

  rescanBlockchain(startHeight = 0) {
    return this.call<{ start_height: number; stop_height: number }>('rescanblockchain', [startHeight], { wallet: true, timeoutMs: 60 * 60_000 })
  }

  getNewAddress(label: string, addressType: 'legacy' | 'bech32' = 'bech32') {
    return this.call<string>('getnewaddress', [label, addressType], { wallet: true })
  }

  getAddressesByLabel(label: string, timeoutMs = 30_000) {
    return this.call<Record<string, { purpose?: string }>>('getaddressesbylabel', [label], { wallet: true, timeoutMs })
  }

  getBalances(timeoutMs = 120_000) {
    return this.call<{
      mine: { trusted: number; untrusted_pending: number; immature: number }
    }>('getbalances', [], { wallet: true, timeoutMs })
  }

  getAddressInfo(address: string) {
    return this.call<{ ismine: boolean; iswatchonly?: boolean; solvable?: boolean }>('getaddressinfo', [address], { wallet: true })
  }

  listUnspent(minConf = 1, maxConf = 9_999_999, addresses?: string[]) {
    return this.call<
      Array<{ txid: string; vout: number; address: string; amount: number; confirmations: number; spendable: boolean }>
    >('listunspent', addresses ? [minConf, maxConf, addresses] : [minConf, maxConf], { wallet: true })
  }

  listTransactions(count = 50, skip = 0) {
    return this.call<
      Array<{
        address?: string
        category: 'send' | 'receive' | 'generate' | 'immature'
        amount: number
        fee?: number
        confirmations: number
        txid: string
        time: number
        label?: string
      }>
    >('listtransactions', ['*', count, skip], { wallet: true })
  }

  getTransaction(txid: string) {
    return this.call<{
      txid: string
      confirmations: number
      blockhash?: string
      blockheight?: number
      time: number
      hex: string
      details: Array<{ address?: string; category: string; amount: number }>
    }>('gettransaction', [txid], { wallet: true })
  }

  fundRawTransaction(hex: string, feeRateWamPerKb?: number) {
    return this.call<{ hex: string; fee: number; changepos: number }>(
      'fundrawtransaction',
      feeRateWamPerKb ? [hex, { fee_rate: feeRateWamPerKb }] : [hex],
      { wallet: true }
    )
  }

  signRawTransactionWithWallet(hex: string) {
    return this.call<{ hex: string; complete: boolean; errors?: Array<{ error: string }> }>(
      'signrawtransactionwithwallet',
      [hex],
      { wallet: true }
    )
  }

  // ---- Base endpoint again: none of these read/write a specific wallet -------

  validateAddress(address: string) {
    return this.call<{ isvalid: boolean; address?: string; scriptPubKey?: string }>('validateaddress', [address])
  }

  /**
   * Read-only balance lookup for an ARBITRARY address that is not (and must
   * not be) imported into the wallet. Bitcoin-Core-style daemons expose this
   * via `scantxoutset`, which scans the current UTXO set for a descriptor
   * without touching wallet state -- this is the mechanism the project spec
   * called for explicitly. Requires a synced node; can be slow on a large
   * UTXO set, hence the longer timeout.
   */
  async scanAddressUtxoSet(address: string) {
    return this.call<{
      success: boolean
      txouts: number
      height: number
      bestblock: string
      unspents: Array<{ txid: string; vout: number; amount: number; height: number }>
      total_amount: number
    }>('scantxoutset', ['start', [`addr(${address})`]], { timeoutMs: 60_000 })
  }

  estimateSmartFee(confTarget = 6) {
    return this.call<{ feerate?: number; errors?: string[] }>('estimatesmartfee', [confTarget])
  }

  createRawTransaction(inputs: Array<{ txid: string; vout: number }>, outputs: Record<string, number>) {
    return this.call<string>('createrawtransaction', [inputs, outputs])
  }

  decodeRawTransaction(hex: string) {
    return this.call<{
      txid: string
      vin: unknown[]
      vout: Array<{ value: number; scriptPubKey: { address?: string } }>
    }>('decoderawtransaction', [hex])
  }

  sendRawTransaction(hex: string) {
    return this.call<string>('sendrawtransaction', [hex])
  }
}
