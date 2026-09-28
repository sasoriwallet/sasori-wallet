import { app } from 'electron'
import { promises as fs, createWriteStream, createReadStream, openSync, closeSync } from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import type { RpcEndpointConfig } from '@shared/types'

const execFileAsync = promisify(execFile)

export const MANAGED_NODE_VERSION = '0.1.11'
const NODE_ZIP = `wam-coin-v${MANAGED_NODE_VERSION}-x86_64-w64-mingw32.zip`
const NODE_BASE_URL = `https://wamcoin.org/downloads/v${MANAGED_NODE_VERSION}`
const NODE_ZIP_URL = `${NODE_BASE_URL}/${NODE_ZIP}`
const CHECKSUMS_URL = `${NODE_BASE_URL}/SHA256SUMS`
const RPC_PORT = 9554
const RPC_USER = 'wamrpc'

export interface ManagedNodeProgress {
  percent: number
  message: string
  state: 'idle' | 'downloading' | 'verifying' | 'extracting' | 'starting' | 'ready' | 'error'
}

let managedProgress: ManagedNodeProgress = { percent: 0, message: 'Preparing WAM Mainnet…', state: 'idle' }

function setManagedProgress(percent: number, message: string, state: ManagedNodeProgress['state']): void {
  managedProgress = { percent: Math.max(0, Math.min(100, Math.round(percent))), message, state }
}

export function getManagedNodeProgress(): ManagedNodeProgress {
  return { ...managedProgress }
}

export interface ManagedNodeSetupResult {
  dataDir: string
  nodeDir: string
  rpc: RpcEndpointConfig
  walletName: string
  nodeVersion: string
  usedExistingNode: boolean
}

function rootDir(): string { return path.join(app.getPath('userData'), 'wam-mainnet') }
function dataDir(): string { return path.join(rootDir(), 'data') }
function nodeDir(): string { return path.join(rootDir(), 'node') }
function configPath(): string { return path.join(dataDir(), 'wam.conf') }

async function fileExists(file: string): Promise<boolean> { try { await fs.access(file); return true } catch { return false } }

async function findFile(dir: string, name: string): Promise<string | null> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return full
    if (entry.isDirectory()) {
      const found = await findFile(full, name)
      if (found) return found
    }
  }
  return null
}

async function sha256(file: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(file)
    stream.on('error', reject)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

async function download(url: string, destination: string, onProgress?: (percent: number) => void): Promise<void> {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  const file = createWriteStream(destination)
  const reader = response.body.getReader()
  const total = Number(response.headers.get('content-length') || 0)
  let received = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        file.write(Buffer.from(value))
        received += value.byteLength
        if (total > 0) onProgress?.(received / total)
      }
    }
  } finally {
    await new Promise<void>((resolve) => file.end(() => resolve()))
  }
}

async function verifyOfficialChecksum(zipPath: string): Promise<void> {
  const response = await fetch(CHECKSUMS_URL)
  if (!response.ok) throw new Error(`Could not download WAM release checksums (HTTP ${response.status}).`)
  const text = await response.text()
  const line = text.split(/\r?\n/).find((l) => l.includes(NODE_ZIP))
  if (!line) throw new Error(`The official checksum list does not contain ${NODE_ZIP}.`)
  const expected = line.trim().split(/\s+/)[0].toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new Error('The official checksum list was not in the expected format.')
  const actual = await sha256(zipPath)
  if (actual !== expected) throw new Error('WAM node verification failed: downloaded file does not match the official SHA256SUMS.')
}

async function extractZip(zipPath: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true })
  await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
  ], { windowsHide: true, maxBuffer: 1024 * 1024 * 8 })
}

function randomRpcPassword(): string { return crypto.randomBytes(32).toString('base64url') }

async function writeConfig(password: string): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true })
  const conf = [
    '# Managed by Sasori Wallet. RPC is localhost-only.',
    'server=1', 'listen=1', 'txindex=1', `rpcuser=${RPC_USER}`, `rpcpassword=${password}`,
    'rpcallowip=127.0.0.1', `walletdir=${path.join(dataDir(), 'wallets')}`, '[main]', 'rpcbind=127.0.0.1', ''
  ].join('\n')
  await fs.writeFile(configPath(), conf, { mode: 0o600 })
}

async function readRpcPassword(): Promise<string | null> {
  try {
    const text = await fs.readFile(configPath(), 'utf8')
    return text.match(/^rpcpassword=(.+)$/m)?.[1] ?? null
  } catch { return null }
}

export async function findExistingWamDaemon(): Promise<string | null> {
  const candidates = [
    process.env.WAM_DAEMON_PATH,
    'C:\\wam\\data\\..\\wam-coin-v0.1.10-x86_64-w64-mingw32\\wam-coin-v0.1.10\\bin\\wamd.exe',
    'C:\\wam\\wam-coin-v0.1.10\\bin\\wamd.exe'
  ].filter(Boolean) as string[]
  for (const candidate of candidates) if (await fileExists(candidate)) return candidate
  return null
}

export async function provisionManagedNode(): Promise<ManagedNodeSetupResult> {
  setManagedProgress(2, 'Preparing the managed WAM Mainnet directory…', 'downloading')
  await fs.mkdir(rootDir(), { recursive: true })
  await fs.mkdir(dataDir(), { recursive: true })
  await fs.mkdir(nodeDir(), { recursive: true })
  await fs.mkdir(path.join(dataDir(), 'wallets'), { recursive: true })

  let daemon = await findFile(nodeDir(), 'wamd.exe')
  let usedExistingNode = false
  if (!daemon) {
    const existing = await findExistingWamDaemon()
    if (existing) { daemon = existing; usedExistingNode = true }
  }

  if (!daemon) {
    const tempZip = path.join(os.tmpdir(), `wam-node-${MANAGED_NODE_VERSION}-${Date.now()}.zip`)
    try {
      setManagedProgress(5, 'Downloading the official WAM node…', 'downloading')
      await download(NODE_ZIP_URL, tempZip, (fraction) => setManagedProgress(5 + fraction * 40, 'Downloading the official WAM node…', 'downloading'))
      setManagedProgress(50, 'Verifying the official WAM node…', 'verifying')
      await verifyOfficialChecksum(tempZip)
      setManagedProgress(65, 'Installing the WAM node…', 'extracting')
      await extractZip(tempZip, nodeDir())
      daemon = await findFile(nodeDir(), 'wamd.exe')
      if (!daemon) throw new Error('The WAM release was downloaded but wamd.exe was not found inside it.')
    } finally { await fs.rm(tempZip, { force: true }).catch(() => undefined) }
  }

  let password = await readRpcPassword()
  if (!password) { password = randomRpcPassword(); await writeConfig(password) }
  const rpc: RpcEndpointConfig = { host: '127.0.0.1', port: RPC_PORT, username: RPC_USER, password, useHttps: false }
  return { dataDir: dataDir(), nodeDir: path.dirname(daemon), rpc, walletName: '', nodeVersion: MANAGED_NODE_VERSION, usedExistingNode }
}

async function isManagedWamDaemonRunning(managedDataDir: string): Promise<boolean> {
  if (process.platform !== 'win32') return false
  try {
    const script = `(Get-CimInstance Win32_Process -Filter "Name='wamd.exe'" | Select-Object -ExpandProperty CommandLine)`
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
    const target = `-datadir=${managedDataDir}`.toLowerCase()
    return stdout.toLowerCase().split(/\r?\n/).some((line: string) => line.includes(target))
  } catch {
    return false
  }
}

async function waitForRpc(setup: ManagedNodeSetupResult, timeoutMs = 120_000): Promise<void> {
  const auth = Buffer.from(`${setup.rpc.username}:${setup.rpc.password}`).toString('base64')
  const deadline = Date.now() + timeoutMs
  let lastError = 'The WAM node did not become ready.'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${RPC_PORT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ jsonrpc: '1.0', id: 'startup', method: 'getblockchaininfo', params: [] })
      })
      if (res.ok) return
      if (res.status === 401) throw new Error('RPC authentication failed for the managed WAM node.')
      lastError = `The WAM node returned HTTP ${res.status}.`
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`${lastError} The node may still be starting; try opening Sasori Wallet again.`)
}

async function waitForBlockchainReady(setup: ManagedNodeSetupResult, timeoutMs = 60 * 60_000): Promise<void> {
  const auth = Buffer.from(`${setup.rpc.username}:${setup.rpc.password}`).toString('base64')
  const deadline = Date.now() + timeoutMs
  let last = 'Waiting for WAM Mainnet synchronization…'

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${RPC_PORT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({ jsonrpc: '1.0', id: 'sync', method: 'getblockchaininfo', params: [] })
      })
      if (!res.ok) throw new Error(`WAM node returned HTTP ${res.status}.`)
      const body = await res.json() as { result?: { blocks?: number; headers?: number; verificationprogress?: number; initialblockdownload?: boolean }; error?: { message?: string } }
      if (body.error) throw new Error(body.error.message || 'WAM Mainnet RPC error.')

      const info = body.result || {}
      const blocks = Number(info.blocks ?? 0)
      const headers = Number(info.headers ?? 0)
      const progress = typeof info.verificationprogress === 'number'
        ? Math.max(0, Math.min(100, info.verificationprogress * 100))
        : headers > 0 ? Math.min(100, (blocks / headers) * 100) : 0
      const ready = info.initialblockdownload === false && headers > 0 && blocks >= headers

      if (ready) {
        setManagedProgress(100, 'WAM Mainnet connected.', 'ready')
        return
      }

      last = `Synchronizing WAM Mainnet… ${blocks.toLocaleString()} / ${headers.toLocaleString()} blocks`
      setManagedProgress(72 + progress * 0.28, last, 'starting')
    } catch (err) {
      last = err instanceof Error ? err.message : String(err)
      setManagedProgress(82, 'Waiting for WAM Mainnet to respond…', 'starting')
    }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  throw new Error(`${last} The node did not finish synchronizing within 60 minutes.`)
}

export async function startManagedNode(): Promise<ManagedNodeSetupResult> {
  const setup = await provisionManagedNode()
  let rpcReady = false
  try {
    // Give an already-running daemon a short chance to answer before deciding
    // that it needs to be started. This avoids launching a second wamd.exe
    // while the first process is still initializing.
    await waitForRpc(setup, 5_000)
    rpcReady = true
  } catch (err) {
    if (err instanceof Error && err.message.includes('RPC authentication failed')) throw err
    if (await isManagedWamDaemonRunning(setup.dataDir)) {
      setManagedProgress(82, 'Waiting for the existing WAM Mainnet node…', 'starting')
      await waitForRpc(setup, 180_000)
      rpcReady = true
    }
  }

  if (rpcReady) {
    await waitForBlockchainReady(setup)
    return setup
  }

  const daemon = (await findFile(nodeDir(), 'wamd.exe'))
  if (!daemon) throw new Error('WAM daemon is not installed.')
  setManagedProgress(72, 'Starting the WAM Mainnet node…', 'starting')
  const logPath = path.join(rootDir(), 'wamd.log')
  // Windows spawn() requires a numeric file descriptor for redirected stdio.
  // A WriteStream's fd is null until its async 'open' event fires, which can
  // cause: "The argument 'stdio' is invalid. Received WriteStream ... fd: null".
  const logFd = openSync(logPath, 'a')
  let child: ReturnType<typeof spawn>
  try {
    child = spawn(daemon, [`-datadir=${setup.dataDir}`], {
      cwd: path.dirname(daemon),
      detached: true,
      windowsHide: true,
      stdio: ['ignore', logFd, logFd]
    })
  } catch (err) {
    closeSync(logFd)
    throw err
  }
  child.on('error', (err) => {
    void fs.appendFile(logPath, `\nSasori failed to start wamd: ${err.message}\n`)
  })
  // The detached child inherits the OS handle; closing our copy here is safe.
  closeSync(logFd)
  child.unref()
  try {
    setManagedProgress(82, 'Waiting for the local WAM node…', 'starting')
    await waitForRpc(setup, 180_000)
    await waitForBlockchainReady(setup)
  } catch (err) {
    let logTail = ''
    try {
      const log = await fs.readFile(logPath, 'utf8')
      logTail = log.slice(-4000)
    } catch { /* no log available */ }
    const detail = logTail.trim() ? `\n\nLast node log:\n${logTail}` : ''
    setManagedProgress(0, 'WAM Mainnet node setup failed.', 'error')
    throw new Error(`${err instanceof Error ? err.message : String(err)}${detail}`)
  }
  return setup
}
