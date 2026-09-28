import type { OperationError } from './types'

/**
 * Standard Bitcoin Core RPC error codes (src/rpc/protocol.h upstream). WAM is
 * a Bitcoin Core v28.1 fork and has not been shown to change these, so this
 * mapping is on reasonably solid ground -- but it has not been confirmed
 * against an actual running wamd, so unrecognized codes always fall back to
 * a generic-but-honest message rather than a guessed one.
 */
const KNOWN_CODES: Record<string, string> = {
  '-1': 'The WAM node rejected that request.',
  '-3': "That doesn't look like a valid amount.",
  '-5': 'The WAM node could not find that address, transaction, or wallet.',
  '-6': 'Insufficient WAM balance for this transaction (after fees).',
  '-8': 'One of the values sent to the node was out of range or malformed.',
  '-13': 'The wallet is locked. Unlock it before sending.',
  '-14': 'The wallet passphrase was incorrect.',
  '-17': 'The wallet is already unlocked.',
  '-18': 'No wallet is currently loaded on the node.',
  '-25': 'The transaction was rejected by the network (it may double-spend, or fail another mempool policy check).',
  '-26': 'The transaction was rejected by the network policy rules.',
  '-27': 'That transaction has already been broadcast.',
  '-32601': 'This wallet tried to call a node feature that is not available on your WAM node. It may be running an older or different version than this wallet expects.'
} as const

export function translateRpcError(err: unknown): OperationError {
  if (isRpcErrorShape(err)) {
    const known = KNOWN_CODES[String(err.code)]
    return {
      code: `rpc:${err.code}`,
      userMessage: known ?? 'The WAM node returned an error processing that request.',
      technicalDetail: err.message
    }
  }

  if (isNetworkErrorShape(err)) {
    return {
      code: 'network:unreachable',
      userMessage: 'Unable to connect to the WAM node. Check your connection settings and make sure the node is running.',
      technicalDetail: err.message
    }
  }

  const message = err instanceof Error ? err.message : String(err)
  return {
    code: 'unknown',
    userMessage: 'Something went wrong talking to the WAM node.',
    technicalDetail: message
  }
}

function isRpcErrorShape(err: unknown): err is { code: number; message: string } {
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err && typeof (err as any).code === 'number'
}

function isNetworkErrorShape(err: unknown): err is Error & { code?: string } {
  if (!(err instanceof Error)) return false
  // Node's built-in fetch() (undici) wraps connection failures as
  // `TypeError: fetch failed`, with the actual errno-style error (the one
  // with .code === 'ECONNREFUSED' etc.) nested one level down on `.cause` --
  // unlike older APIs (http.request) which put .code directly on the error.
  // Check both locations so a refused/unreachable connection is still
  // recognized and given a helpful message instead of falling through to
  // the generic "something went wrong" fallback.
  const code = (err as any).code ?? (err as any).cause?.code
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    return true
  }
  return err.name === 'TypeError' && err.message === 'fetch failed'
}
