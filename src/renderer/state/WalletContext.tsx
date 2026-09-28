import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api, unwrap } from '../services/api'
import type { AppSettings, NodeStatus, WalletLockState } from '@shared/types'

interface WalletContextValue {
  nodeStatus: NodeStatus | null
  settings: AppSettings | null
  lockState: WalletLockState | null
  contextError: string | null
  refreshNodeStatus: () => Promise<void>
  refreshSettings: () => Promise<void>
  refreshLockState: () => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)
const POLL_INTERVAL_MS = 3000

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [nodeStatus, setNodeStatus] = useState<NodeStatus | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [lockState, setLockState] = useState<WalletLockState | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const nodePollInFlight = useRef(false)
  const startupLockAttempted = useRef(false)

  const refreshNodeStatus = useCallback(async () => {
    if (nodePollInFlight.current) return
    nodePollInFlight.current = true
    try { setNodeStatus(await unwrap(api.node.getStatus())); setContextError(null) }
    catch (err) {
      setNodeStatus({ state: 'disconnected', network: settings?.network ?? 'mainnet', currentBlock: 0, networkBlock: null, syncPercent: null, errorMessage: err instanceof Error ? err.message : 'Unable to contact the WAM node.' })
    } finally { nodePollInFlight.current = false }
  }, [settings?.network])

  const refreshSettings = useCallback(async () => {
    try { setSettings(await unwrap(api.settings.get())); setContextError(null) }
    catch (err) { setContextError(err instanceof Error ? err.message : 'Unable to load wallet settings.') }
  }, [])

  const refreshLockState = useCallback(async () => {
    try { setLockState(await unwrap(api.wallet.getLockState())) }
    catch { setLockState(null) }
  }, [])

  useEffect(() => { void refreshSettings() }, [refreshSettings])

  useEffect(() => {
    if (!settings?.managedNodeSetupComplete || startupLockAttempted.current) return
    void (async () => {
      try {
        const state = await unwrap(api.wallet.getLockState())
        if (state.encrypted) await unwrap(api.wallet.lock())
        startupLockAttempted.current = true
        await refreshLockState()
      } catch { /* node may still be starting; retry on the next settings refresh */ }
    })()
  }, [settings?.managedNodeSetupComplete, refreshLockState])

  useEffect(() => {
    if (!settings?.managedNodeSetupComplete) return
    void refreshLockState()
    const lockTimer = window.setInterval(() => void refreshLockState(), POLL_INTERVAL_MS)
    return () => window.clearInterval(lockTimer)
  }, [settings?.managedNodeSetupComplete, refreshLockState])

  useEffect(() => {
    void refreshNodeStatus()
    const id = window.setInterval(() => void refreshNodeStatus(), POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [refreshNodeStatus])

  return <WalletContext.Provider value={{ nodeStatus, settings, lockState, contextError, refreshNodeStatus, refreshSettings, refreshLockState }}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
