import { WamRpcClient } from '../rpc/WamRpcClient'
import { rpcAmountToWamoshi, formatWamoshi } from '@shared/amount'
import type { WalletBalances, WalletLockState } from '@shared/types'

/**
 * Wraps the wallet-lifecycle RPCs. WAM inherits Bitcoin Core's wallet
 * subsystem, and modern Bitcoin Core defaults to *descriptor* wallets rather
 * than a BIP-39 mnemonic phrase -- `createwallet` produces a wallet backed by
 * an internally generated HD seed, not a recovery phrase you write down.
 * Per the task's own instruction not to invent a BIP-39 flow unless it is
 * confirmed, this service does NOT generate or display a mnemonic. Instead:
 *   - "backup" means calling `backupwallet`, which dumps the wallet's actual
 *     key material (the descriptor-wallet equivalent of wallet.dat) to a file.
 *   - "restore" means loading that file back via the node's own wallet
 *     directory + `loadwallet`, not re-deriving keys from words.
 * If WAM's fork *does* add BIP-39 support, that would show up as an
 * additional RPC (e.g. a custom `getmnemonic`/`restorefromseed`-style call)
 * that isn't in the README's documented RPC list -- until that is confirmed,
 * this is the only backup mechanism this wallet implements.
 */
export class WalletService {
  constructor(private readonly rpc: WamRpcClient) {}

  async ensureWalletLoaded(): Promise<{ created: boolean }> {
    // The wallet name is supplied by Sasori's settings. Never create or guess
    // a wallet here: fresh installs must explicitly choose Create or Import.
    const walletName = this.rpc.getWalletName()
    if (!walletName) throw new Error('No wallet has been selected. Create a new wallet or import a wallet backup first.')
    const wallets = await this.rpc.listWallets()
    if (wallets.includes(walletName)) return { created: false }
    await this.rpc.loadWallet(walletName)
    return { created: false }
  }

  /** First-run wallet creation. Returns a fresh receiving address. */
  async createNewWallet(walletName: string, passphrase: string): Promise<string> {
    if (!walletName) throw new Error('A wallet name is required.')
    if (passphrase.length < 8) throw new Error('Choose a wallet password of at least 8 characters.')
    await this.rpc.createWallet(walletName, passphrase)
    return this.rpc.getNewAddress('primary', 'bech32')
  }

  async getPrimaryReceiveAddress(): Promise<string> {
    // Keep one stable primary receiving address. Calling getnewaddress on
    // every refresh was silently generating a new address every few seconds.
    try {
      const existing = await this.rpc.getAddressesByLabel('primary')
      const addresses = Object.keys(existing)
      if (addresses.length > 0) return addresses[0]
    } catch {
      // Older WAM wallet builds may return an RPC error when a label does not
      // exist yet. In that case, create the one primary address below.
    }
    return this.rpc.getNewAddress('primary', 'bech32')
  }

  async generateNewReceiveAddress(label: string): Promise<string> {
    return this.rpc.getNewAddress(label, 'bech32')
  }

  async getBalances(timeoutMs = 15_000): Promise<WalletBalances> {
    // Wallet RPCs can legitimately take much longer than a normal RPC call
    // while the local daemon is rescanning/indexing the wallet. Keep the UI
    // from reporting a false disconnect during that period.
    const balances = await this.rpc.getBalances(timeoutMs)

    const availableWamoshi = rpcAmountToWamoshi(balances.mine.trusted)
    const pendingWamoshi = rpcAmountToWamoshi(balances.mine.untrusted_pending)
    const immatureWamoshi = rpcAmountToWamoshi(balances.mine.immature)
    const totalWamoshi = availableWamoshi + pendingWamoshi + immatureWamoshi

    return {
      availableWam: formatWamoshi(availableWamoshi),
      pendingWam: formatWamoshi(pendingWamoshi),
      immatureWam: formatWamoshi(immatureWamoshi),
      totalWam: formatWamoshi(totalWamoshi)
    }
  }

  async getLockState(): Promise<WalletLockState> {
    const info = await this.rpc.getWalletInfo()
    const encrypted = typeof info.unlocked_until === 'number'
    return { encrypted, locked: encrypted && info.unlocked_until === 0 }
  }

  async encrypt(passphrase: string): Promise<void> {
    if (passphrase.length < 8) {
      throw new Error('Choose a passphrase of at least 8 characters.')
    }
    await this.rpc.encryptWallet(passphrase)
    // encryptwallet shuts the daemon's wallet down to re-read the keystore;
    // callers should expect a brief reconnect window after this succeeds.
  }

  async unlock(passphrase: string, timeoutSeconds: number): Promise<void> {
    await this.rpc.walletPassphrase(passphrase, timeoutSeconds)
  }

  async lock(): Promise<void> {
    await this.rpc.walletLock()
  }

  async backupTo(destinationAbsolutePath: string): Promise<void> {
    await this.rpc.backupWallet(destinationAbsolutePath)
  }

  async rescan(): Promise<void> {
    await this.rpc.rescanBlockchain(0)
  }
}
