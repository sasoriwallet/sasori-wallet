import { describe, it, expect } from 'vitest'
import { translateRpcError } from '../src/shared/rpcErrors'

describe('translateRpcError', () => {
  it('translates a known Bitcoin-Core-style error code', () => {
    const result = translateRpcError({ code: -6, message: 'Insufficient funds' })
    expect(result.userMessage).toMatch(/insufficient wam balance/i)
    expect(result.code).toBe('rpc:-6')
    expect(result.technicalDetail).toBe('Insufficient funds')
  })

  it('translates the wallet-locked error code', () => {
    const result = translateRpcError({ code: -13, message: 'wallet is locked' })
    expect(result.userMessage).toMatch(/wallet is locked/i)
  })

  it('falls back to a generic-but-honest message for an unrecognized code', () => {
    const result = translateRpcError({ code: -99999, message: 'something WAM-specific' })
    expect(result.userMessage).toBe('The WAM node returned an error processing that request.')
    expect(result.technicalDetail).toBe('something WAM-specific')
  })

  it('recognizes a connection-refused network error', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9554'), { code: 'ECONNREFUSED' })
    const result = translateRpcError(err)
    expect(result.code).toBe('network:unreachable')
    expect(result.userMessage).toMatch(/unable to connect/i)
  })

  it('recognizes a connection-refused error wrapped the way Node\'s built-in fetch() actually throws it (code nested under .cause, not on the error itself)', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:9554'), { code: 'ECONNREFUSED' })
    const err = Object.assign(new TypeError('fetch failed'), { cause })
    const result = translateRpcError(err)
    expect(result.code).toBe('network:unreachable')
    expect(result.userMessage).toMatch(/unable to connect/i)
  })

  it('never throws on a completely unexpected input shape', () => {
    expect(() => translateRpcError(null)).not.toThrow()
    expect(() => translateRpcError(undefined)).not.toThrow()
    expect(() => translateRpcError('a plain string')).not.toThrow()
  })
})
