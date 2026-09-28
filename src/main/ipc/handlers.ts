import { ipcMain, shell, dialog, BrowserWindow } from 'electron'
import path from 'path'
import { WamRpcClient, RpcError } from '../rpc/WamRpcClient'
import { WalletService } from '../wallet/WalletService'
import { TransactionService } from '../transaction/TransactionService'
import { getNodeStatus } from '../blockchain/SyncStatusService'
import * as settingsStore from '../security/settingsStore'
import { getManagedNodeProgress, startManagedNode } from '../node/NodeManager'
import { promises as fs } from 'fs'
import { translateRpcError } from '@shared/rpcErrors'
import { validateWamAddress } from '@shared/wamAddress'
import type { Result, WamNetwork, RpcEndpointConfig, SendPrepareRequest } from '@shared/types'

function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}
function fail<T>(err: unknown): Result<T> {
  return { ok: false, error: translateRpcError(err) }
}

async function activeRpcClient(): Promise<{ rpc: WamRpcClient; network: WamNetwork; walletName: string; explorerBaseUrl: string }> {
  const settings = await settingsStore.loadSettings()
  const config = settings.rpc[settings.network]
  if (!config.host || !config.port || !config.username) {
    throw new Error('CONFIG_INCOMPLETE:Set up your WAM node connection in Settings before using the wallet.')
  }
  const walletName = settings.walletName[settings.network]
  if (!walletName) throw new Error('WALLET_NOT_CONFIGURED:Create a new WAM wallet or import a wallet backup first.')
  return { rpc: new WamRpcClient(config, walletName), network: settings.network, walletName, explorerBaseUrl: settings.explorerBaseUrl }
}

/**
 * Tracks, per network, whether this app has confirmed its wallet is loaded
 * on the node during this run. A node restart forgets loaded wallets (this
 * WAM build doesn't appear to persist that across restarts the way modern
 * Bitcoin Core does), which previously surfaced as a raw "Requested wallet
 * does not exist or is not loaded" RPC error on every wallet-scoped call
 * until the user re-ran the first-run wizard. withWallet() below makes every
 * wallet-touching handler self-healing instead: it ensures the wallet is
 * loaded before the first call each run, and if the node still reports
 * "not loaded" (e.g. it was restarted behind the app's back), it retries
 * the load once and re-attempts the original call before giving up.
 */
const walletReady = new Set<string>() // keyed "network:walletName" -- a wallet name change (e.g. after loading a different file) must not reuse another wallet's readiness

const WALLET_NOT_FOUND_RPC_CODE = -18

async function withWallet<T>(rpc: WamRpcClient, network: WamNetwork, walletName: string, fn: () => Promise<T>): Promise<T> {
  const key = `${network}:${walletName}`
  if (!walletReady.has(key)) {
    await new WalletService(rpc).ensureWalletLoaded()
    walletReady.add(key)
  }
  try {
    return await fn()
  } catch (err) {
    if (err instanceof RpcError && err.code === WALLET_NOT_FOUND_RPC_CODE) {
      walletReady.delete(key)
      await new WalletService(rpc).ensureWalletLoaded()
      walletReady.add(key)
      return await fn()
    }
    throw err
  }
}

function clearWalletReadiness(network: WamNetwork): void {
  for (const key of walletReady) {
    if (key.startsWith(`${network}:`)) walletReady.delete(key)
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/** Registers every IPC handler. Called once from main/index.ts after app is ready. */
export function registerIpcHandlers(): void {
  // ---- Settings -----------------------------------------------------------

  ipcMain.handle('settings:get', async (): Promise<Result<unknown>> => {
    try {
      const settings = await settingsStore.loadSettings()
      return ok(settingsStore.redactForRenderer(settings))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('settings:setNetwork', async (_e, network: unknown): Promise<Result<null>> => {
    if (network !== 'mainnet' && network !== 'testnet' && network !== 'regtest') {
      return fail(new Error('Invalid network.'))
    }
    try {
      await settingsStore.saveActiveNetwork(network)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('settings:setRpcConfig', async (_e, network: unknown, config: unknown): Promise<Result<null>> => {
    if (network !== 'mainnet' && network !== 'testnet' && network !== 'regtest') {
      return fail(new Error('Invalid network.'))
    }
    const c = config as Partial<RpcEndpointConfig> | null
    if (!c || !isNonEmptyString(c.host) || typeof c.port !== 'number' || !isNonEmptyString(c.username) || typeof c.password !== 'string') {
      return fail(new Error('Incomplete RPC configuration.'))
    }
    try {
      // The renderer receives a masked password for security. If the user did
      // not change it, preserve the real encrypted credential instead of
      // accidentally saving the mask as the new RPC password.
      let password = c.password
      if (password === '••••••••') {
        const current = await settingsStore.loadSettings()
        password = current.rpc[network].password
      }
      await settingsStore.saveRpcConfig(network, {
        host: c.host,
        port: c.port,
        username: c.username,
        password,
        useHttps: Boolean(c.useHttps)
      })
      // Credentials/host changed -- don't assume the wallet is still loaded
      // on whatever node is now configured for this network.
      clearWalletReadiness(network)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('settings:setExplorerUrl', async (_e, url: unknown): Promise<Result<null>> => {
    if (typeof url !== 'string') return fail(new Error('Invalid explorer URL.'))
    try {
      await settingsStore.saveExplorerBaseUrl(url)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('node:getSetupProgress', async (): Promise<Result<unknown>> => ok(getManagedNodeProgress()))

  ipcMain.handle('node:ensureReady', async (): Promise<Result<{ ready: true }>> => {
    try {
      const initial = await settingsStore.loadSettings()
      if (!initial.managedNodeSetupComplete) {
        throw new Error('WAM Mainnet setup is not complete yet.')
      }

      // Starting/reconnecting the managed node is deliberately part of the
      // startup gate. A running app must never fall through to the wallet UI
      // while the local daemon is still coming online.
      await startManagedNode()

      const settings = await settingsStore.loadSettings()
      const config = settings.rpc.mainnet
      const walletName = settings.walletName.mainnet
      const rpc = new WamRpcClient(config, walletName)
      const deadline = Date.now() + 20 * 60_000
      let lastError: unknown = new Error('Waiting for the WAM wallet to become ready.')

      while (Date.now() < deadline) {
        try {
          // RPC can become available before the chain has finished syncing.
          // Do not let the renderer enter the wallet UI just because the HTTP
          // RPC endpoint answered once. Sasori stays on its pixel loading
          // screen until Mainnet reports that initial block download is done
          // and the local height has caught up with the advertised headers.
          const chain = await rpc.getBlockchainInfo()
          const chainReady = !chain.initialblockdownload && chain.blocks >= chain.headers && chain.headers > 0
          if (!chainReady) {
            lastError = new Error(`WAM Mainnet is still synchronizing (${chain.blocks.toLocaleString()} / ${chain.headers.toLocaleString()} blocks).`)
            await new Promise((resolve) => setTimeout(resolve, 2000))
            continue
          }

          await withWallet(rpc, 'mainnet', walletName, async () => {
            const service = new WalletService(rpc)
            await service.getBalances(5 * 60_000)
            await service.getPrimaryReceiveAddress()
            // A previously encrypted wallet should always enter Sasori locked.
            // This is done after the node/wallet is fully ready so startup cannot
            // race the first getwalletinfo call.
            const lockState = await service.getLockState()
            if (lockState.encrypted && !lockState.locked) await service.lock()
          })

          return ok({ ready: true })
        } catch (err) {
          lastError = err
          await new Promise((resolve) => setTimeout(resolve, 2000))
        }
      }

      throw new Error(`The WAM node is still starting or loading the wallet. ${lastError instanceof Error ? lastError.message : String(lastError)}`)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('node:setupManaged', async (): Promise<Result<unknown>> => {
    try {
      const setup = await startManagedNode()
      await settingsStore.saveActiveNetwork('mainnet')
      await settingsStore.saveRpcConfig('mainnet', setup.rpc)
      return ok({
        dataDir: setup.dataDir,
        nodeDir: setup.nodeDir,
        nodeVersion: setup.nodeVersion,
        walletName: setup.walletName,
        usedExistingNode: setup.usedExistingNode
      })
    } catch (err) {
      return fail(err)
    }
  })

  // ---- Node status ----------------------------------------------------------

  ipcMain.handle('node:getStatus', async (): Promise<Result<unknown>> => {
    try {
      const { rpc, network } = await activeRpcClient()
      return ok(await getNodeStatus(rpc, network))
    } catch (err) {
      // Config-incomplete is a normal first-run state, not an error toast.
      if (err instanceof Error && err.message.startsWith('CONFIG_INCOMPLETE')) {
        return ok({ state: 'disconnected', network: 'regtest', currentBlock: 0, networkBlock: null, syncPercent: null, errorMessage: 'No WAM node configured yet.' })
      }
      return fail(err)
    }
  })

  // ---- Wallet ---------------------------------------------------------------

  ipcMain.handle('wallet:ensureLoaded', async (): Promise<Result<{ created: boolean }>> => {
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      const result = await new WalletService(rpc).ensureWalletLoaded()
      walletReady.add(`${network}:${walletName}`)
      return ok(result)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:createNew', async (_event, passphrase: unknown): Promise<Result<{ walletName: string; address: string }>> => {
    if (typeof passphrase !== 'string' || passphrase.length < 8) return fail(new Error('Choose a wallet password of at least 8 characters.'))
    try {
      const setup = await startManagedNode()
      const walletName = `sasori-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const rpc = new WamRpcClient(setup.rpc, walletName)
      const address = await new WalletService(rpc).createNewWallet(walletName, passphrase)
      await settingsStore.saveWalletName('mainnet', walletName)
      await settingsStore.savePrimaryReceiveAddress('mainnet', address)
      await settingsStore.saveManagedNodeSetupComplete(true)
      clearWalletReadiness('mainnet')
      walletReady.add(`mainnet:${walletName}`)
      return ok({ walletName, address })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:restoreFromFile', async (event): Promise<Result<{ walletName: string; address: string } | null>> => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return ok(null)
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Import WAM wallet.dat',
        properties: ['openFile'],
        filters: [{ name: 'WAM wallet backup', extensions: ['dat'] }, { name: 'All files', extensions: ['*'] }]
      })
      if (canceled || filePaths.length === 0) return ok(null)
      const source = filePaths[0]
      const stat = await fs.stat(source)
      if (!stat.isFile() || stat.size < 1024) throw new Error('That file is too small to be a valid WAM wallet.dat backup.')

      // WAM's documented Windows restore flow is to put the backup at
      // <datadir>\wallets\<name>\wallet.dat and then load that wallet.
      // Do that locally instead of relying on restorewallet, which expects the
      // node process to be able to read the supplied source path and can fail
      // on packaged/Windows path handling. The user's original file is never
      // moved, deleted, uploaded, or overwritten.
      const setup = await startManagedNode()
      const rpc = new WamRpcClient(setup.rpc)
      const walletName = `imported-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      const walletDir = path.join(setup.dataDir, 'wallets', walletName)
      const destination = path.join(walletDir, 'wallet.dat')
      await fs.mkdir(walletDir, { recursive: true })
      await fs.copyFile(source, destination)

      let walletLoaded = false
      try {
        // loadwallet opens the existing wallet.dat and returns once it has been
        // accepted by the node. It does not create a new wallet.
        await rpc.loadWallet(walletName)
        walletLoaded = true
        await settingsStore.saveWalletName('mainnet', walletName)
        clearWalletReadiness('mainnet')
        walletReady.add(`mainnet:${walletName}`)

        const bound = new WamRpcClient(setup.rpc, walletName)
        // Scan from genesis so an imported backup finds historical transactions.
        // Once loadwallet succeeds, NEVER delete the copied wallet on a later
        // rescan/address timeout. The wallet is real user key material and may
        // still be usable while a long rescan is finishing.
        await new WalletService(bound).rescan()
        const address = await new WalletService(bound).getPrimaryReceiveAddress()
        await settingsStore.savePrimaryReceiveAddress('mainnet', address)
        await settingsStore.saveManagedNodeSetupComplete(true)
        return ok({ walletName, address })
      } catch (err) {
        if (!walletLoaded) {
          await fs.rm(walletDir, { recursive: true, force: true }).catch(() => undefined)
        }
        throw err
      }
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:getBalances', async (): Promise<Result<unknown>> => {
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      return ok(await withWallet(rpc, network, walletName, () => new WalletService(rpc).getBalances()))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:getReceiveAddress', async (): Promise<Result<string>> => {
    try {
      const settings = await settingsStore.loadSettings()
      const { rpc, network, walletName } = await activeRpcClient()
      const saved = settings.primaryReceiveAddress[network]
      if (saved) return ok(saved)

      const address = await withWallet(rpc, network, walletName, () => new WalletService(rpc).getPrimaryReceiveAddress())
      await settingsStore.savePrimaryReceiveAddress(network, address)
      return ok(address)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:generateNewAddress', async (_e, label: unknown): Promise<Result<string>> => {
    if (typeof label !== 'string') return fail(new Error('Invalid label.'))
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      return ok(await withWallet(rpc, network, walletName, () => new WalletService(rpc).generateNewReceiveAddress(label)))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:getLockState', async (): Promise<Result<unknown>> => {
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      return ok(await withWallet(rpc, network, walletName, () => new WalletService(rpc).getLockState()))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:encrypt', async (_e, passphrase: unknown): Promise<Result<null>> => {
    if (!isNonEmptyString(passphrase)) return fail(new Error('Enter a passphrase.'))
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      await withWallet(rpc, network, walletName, () => new WalletService(rpc).encrypt(passphrase))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:unlock', async (_e, passphrase: unknown, timeoutSeconds: unknown): Promise<Result<null>> => {
    if (!isNonEmptyString(passphrase) || typeof timeoutSeconds !== 'number') return fail(new Error('Invalid unlock request.'))
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      await withWallet(rpc, network, walletName, () => new WalletService(rpc).unlock(passphrase, timeoutSeconds))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:lock', async (): Promise<Result<null>> => {
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      await withWallet(rpc, network, walletName, () => new WalletService(rpc).lock())
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:backup', async (event): Promise<Result<{ path: string } | null>> => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return ok(null)
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Backup WAM Wallet',
        defaultPath: 'wam-wallet-backup.dat',
        filters: [{ name: 'Wallet backup', extensions: ['dat'] }]
      })
      if (canceled || !filePath) return ok(null)

      const { rpc, network, walletName } = await activeRpcClient()
      await withWallet(rpc, network, walletName, () => new WalletService(rpc).backupTo(filePath))
      return ok({ path: filePath })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('wallet:rescan', async (): Promise<Result<null>> => {
    try {
      const { rpc, network, walletName } = await activeRpcClient()
      await withWallet(rpc, network, walletName, () => new WalletService(rpc).rescan())
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  // ---- Address validation & arbitrary lookup -----------------------------------

  ipcMain.handle('address:validateLocal', (_e, address: unknown): Result<unknown> => {
    if (typeof address !== 'string') return fail(new Error('Invalid input.'))
    return ok(validateWamAddress(address))
  })

  ipcMain.handle('address:check', async (_e, address: unknown): Promise<Result<unknown>> => {
    if (typeof address !== 'string') return fail(new Error('Invalid address.'))
    const local = validateWamAddress(address)
    if (!local.valid) return fail(new Error(local.reason ?? 'Invalid WAM address.'))
    try {
      const { rpc, network, explorerBaseUrl } = await activeRpcClient()
      return ok(await new TransactionService(rpc, network, explorerBaseUrl).checkAddress(address))
    } catch (err) {
      return fail(err)
    }
  })

  // ---- Transactions -------------------------------------------------------------

  ipcMain.handle('tx:history', async (_e, count: unknown): Promise<Result<unknown>> => {
    try {
      const { rpc, network, walletName, explorerBaseUrl } = await activeRpcClient()
      return ok(
        await withWallet(rpc, network, walletName, () =>
          new TransactionService(rpc, network, explorerBaseUrl).getHistory(typeof count === 'number' ? count : 50)
        )
      )
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('tx:detail', async (_e, txid: unknown): Promise<Result<unknown>> => {
    if (typeof txid !== 'string') return fail(new Error('Invalid transaction id.'))
    try {
      const { rpc, network, walletName, explorerBaseUrl } = await activeRpcClient()
      return ok(
        await withWallet(rpc, network, walletName, () => new TransactionService(rpc, network, explorerBaseUrl).getTransactionDetail(txid))
      )
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('tx:prepareSend', async (_e, request: unknown): Promise<Result<unknown>> => {
    const r = request as Partial<SendPrepareRequest> | null
    if (!r || !isNonEmptyString(r.toAddress) || !isNonEmptyString(r.amountWam)) {
      return fail(new Error('Enter a recipient address and amount.'))
    }
    // Pulled into locals (rather than accessed as r.toAddress inside the
    // withWallet closure below) so TypeScript's narrowing from the guard
    // above actually applies -- narrowing on an object property doesn't
    // survive being read from inside a nested closure.
    const toAddress = r.toAddress
    const amountWam = r.amountWam
    const feeRateWamPerKb = typeof r.feeRateWamPerKb === 'string' ? r.feeRateWamPerKb : undefined
    try {
      const { rpc, network, walletName, explorerBaseUrl } = await activeRpcClient()
      return ok(
        await withWallet(rpc, network, walletName, () =>
          new TransactionService(rpc, network, explorerBaseUrl).prepareSend({ toAddress, amountWam, feeRateWamPerKb })
        )
      )
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle('tx:confirmSend', async (_e, reviewToken: unknown): Promise<Result<unknown>> => {
    if (!isNonEmptyString(reviewToken)) return fail(new Error('Invalid review token.'))
    try {
      const { rpc, network, walletName, explorerBaseUrl } = await activeRpcClient()
      return ok(
        await withWallet(rpc, network, walletName, () => new TransactionService(rpc, network, explorerBaseUrl).confirmSend(reviewToken))
      )
    } catch (err) {
      return fail(err)
    }
  })

  // ---- External links (allow-listed to http/https only) -------------------------

  ipcMain.handle('shell:openExternal', async (_e, url: unknown): Promise<Result<null>> => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return fail(new Error('Refused to open a non-http(s) link.'))
    }
    try {
      await shell.openExternal(url)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })
}
