import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AppSettings, RpcEndpointConfig, WamNetwork } from '@shared/types'

/**
 * Settings are stored as plain JSON, EXCEPT each network's RPC password,
 * which is encrypted at rest via Electron's `safeStorage` (backed by the OS
 * keychain: DPAPI on Windows, Keychain on macOS, libsecret on Linux). The
 * password never appears in the JSON file in plaintext, is never logged, and
 * is only ever decrypted in the main process -- it is not part of the
 * settings object sent to the renderer (see ipc/handlers.ts, which strips it
 * before replying to `settings:get`).
 */

const SETTINGS_FILE = 'wam-wallet-settings.json'

interface PersistedRpcConfig {
  host: string
  port: number
  username: string
  encryptedPassword: string | null // base64
  useHttps: boolean
}

interface PersistedSettings {
  network: WamNetwork
  explorerBaseUrl: string
  rpc: Record<WamNetwork, PersistedRpcConfig>
  /** Optional so old settings.json files written before this field existed still parse; defaulted in loadSettings(). */
  walletName?: Partial<Record<WamNetwork, string>>
  primaryReceiveAddress?: Partial<Record<WamNetwork, string>>
  managedNodeSetupComplete?: boolean
}

function emptyRpcConfig(): PersistedRpcConfig {
  return { host: '127.0.0.1', port: 0, username: '', encryptedPassword: null, useHttps: false }
}

// NOTE: mainnet/testnet default ports are intentionally left at 0 (meaning
// "not set") -- the original task description asserted 9554/19554 for
// mainnet/testnet, which couldn't be confirmed from the project's docs or
// source during research. Running the actual compiled wamd.exe -regtest
// binary later showed it defaults to port 29554 on regtest, which fits a
// consistent +10000-per-network offset from a 9554 mainnet base (9554 ->
// 19554 -> 29554) -- so 9554/19554 were likely right all along, but this
// still isn't the same as confirming a live mainnet/testnet network exists
// to connect to, so they're left for the user to enter rather than pre-filled.
function defaultSettings(): PersistedSettings {
  return {
    network: 'mainnet',
    explorerBaseUrl: '',
    rpc: {
      mainnet: { ...emptyRpcConfig(), port: 9554 },
      testnet: emptyRpcConfig(),
      regtest: { ...emptyRpcConfig(), port: 29554 } // confirmed by actually running wamd.exe -regtest (log: "Binding RPC on address 127.0.0.1 port 29554")
    },
    walletName: { mainnet: '' },
    managedNodeSetupComplete: false
  }
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), SETTINGS_FILE)
}

async function readPersisted(): Promise<PersistedSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>
    const defaults = defaultSettings()
    return {
      ...defaults,
      ...parsed,
      rpc: { ...defaults.rpc, ...(parsed.rpc ?? {}) }
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
      return defaultSettings()
    }
    throw new Error('Sasori settings could not be read. The settings file may be corrupted; do not delete wallet data while troubleshooting.')
  }
}

async function writePersisted(settings: PersistedSettings): Promise<void> {
  const dir = path.dirname(settingsPath())
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 })
}

function decryptPassword(encrypted: string | null): string {
  if (!encrypted) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS secure storage is unavailable, so the saved RPC password cannot be decrypted safely.')
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch {
    throw new Error('The saved RPC password could not be decrypted safely. Keep your wallet data intact while troubleshooting.')
  }
}

function encryptPassword(plain: string): string | null {
  if (!plain) return null
  if (!safeStorage.isEncryptionAvailable()) {
    // Fail loudly rather than silently writing a plaintext password to disk.
    throw new Error('OS secure storage is unavailable, so the RPC password cannot be saved encrypted.')
  }
  return safeStorage.encryptString(plain).toString('base64')
}

export async function loadSettings(): Promise<AppSettings> {
  const persisted = await readPersisted()
  const rpc = {} as AppSettings['rpc']
  const walletName = {} as AppSettings['walletName']
  for (const net of Object.keys(persisted.rpc) as WamNetwork[]) {
    const p = persisted.rpc[net]
    rpc[net] = {
      host: p.host,
      port: p.port,
      username: p.username,
      password: decryptPassword(p.encryptedPassword),
      useHttps: p.useHttps
    }
    // A fresh installation must never guess or silently select a wallet.
    // The user explicitly creates a new wallet or imports an existing backup.
    walletName[net] = persisted.walletName?.[net] ?? ''
  }
  return {
    network: persisted.network,
    explorerBaseUrl: persisted.explorerBaseUrl,
    rpc,
    walletName,
    primaryReceiveAddress: persisted.primaryReceiveAddress ?? {},
    managedNodeSetupComplete: persisted.managedNodeSetupComplete === true
  }
}

export async function saveRpcConfig(network: WamNetwork, config: RpcEndpointConfig): Promise<void> {
  const persisted = await readPersisted()
  persisted.rpc[network] = {
    host: config.host,
    port: config.port,
    username: config.username,
    encryptedPassword: encryptPassword(config.password),
    useHttps: config.useHttps
  }
  await writePersisted(persisted)
}

export async function saveActiveNetwork(network: WamNetwork): Promise<void> {
  const persisted = await readPersisted()
  persisted.network = network
  await writePersisted(persisted)
}

export async function saveWalletName(network: WamNetwork, name: string): Promise<void> {
  const persisted = await readPersisted()
  persisted.walletName = { ...persisted.walletName, [network]: name }
  await writePersisted(persisted)
}


export async function savePrimaryReceiveAddress(network: WamNetwork, address: string): Promise<void> {
  const persisted = await readPersisted()
  persisted.primaryReceiveAddress = { ...persisted.primaryReceiveAddress, [network]: address }
  await writePersisted(persisted)
}

export async function saveManagedNodeSetupComplete(value = true): Promise<void> {
  const persisted = await readPersisted()
  persisted.managedNodeSetupComplete = value
  await writePersisted(persisted)
}

export async function saveExplorerBaseUrl(url: string): Promise<void> {
  const persisted = await readPersisted()
  persisted.explorerBaseUrl = url
  await writePersisted(persisted)
}

/** Settings view safe to send to the renderer: password fields are redacted. */
export function redactForRenderer(settings: AppSettings): AppSettings {
  const rpc = {} as AppSettings['rpc']
  for (const net of Object.keys(settings.rpc) as WamNetwork[]) {
    rpc[net] = { ...settings.rpc[net], password: settings.rpc[net].password ? '••••••••' : '' }
  }
  return { ...settings, rpc }
}

