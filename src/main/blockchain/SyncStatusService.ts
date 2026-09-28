import { WamRpcClient } from '../rpc/WamRpcClient'
import { translateRpcError } from '@shared/rpcErrors'
import type { NodeStatus, WamNetwork } from '@shared/types'

/**
 * Rule (from the project spec, and good sense for anything touching real
 * money): never show a fabricated block height, balance, or "connected"
 * state. If the RPC call fails, the status is 'disconnected' with the real
 * translated error message -- there is no fallback fake value anywhere in
 * this file.
 */
export async function getNodeStatus(rpc: WamRpcClient, network: WamNetwork): Promise<NodeStatus> {
  try {
    const info = await rpc.getBlockchainInfo()
    const networkBlock = info.headers
    const currentBlock = info.blocks
    const syncPercent = info.verificationprogress != null ? Math.min(100, Math.round(info.verificationprogress * 10000) / 100) : null

    const state: NodeStatus['state'] = info.initialblockdownload || currentBlock < networkBlock ? 'syncing' : 'connected'

    let version: string | undefined
    try {
      const netInfo = await rpc.getNetworkInfo()
      version = netInfo.subversion
    } catch {
      // Non-fatal -- version display is a nicety, not required for status.
    }

    return { state, network, currentBlock, networkBlock, syncPercent, version }
  } catch (err) {
    const translated = translateRpcError(err)
    return {
      state: 'disconnected',
      network,
      currentBlock: 0,
      networkBlock: null,
      syncPercent: null,
      errorMessage: translated.userMessage
    }
  }
}
