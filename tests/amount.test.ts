import { describe, it, expect } from 'vitest'
import { parseWamToWamoshi, formatWamoshi, rpcAmountToWamoshi, wamoshiToRpcAmount, InvalidAmountError, WAMOSHI_PER_WAM } from '../src/shared/amount'

describe('parseWamToWamoshi / formatWamoshi round trip', () => {
  it('round-trips a typical amount exactly', () => {
    const wamoshi = parseWamToWamoshi('12.48392015')
    expect(wamoshi).toBe(1248392015n)
    expect(formatWamoshi(wamoshi)).toBe('12.48392015')
  })

  it('pads a short decimal to 8 places', () => {
    expect(formatWamoshi(parseWamToWamoshi('1.5'))).toBe('1.50000000')
  })

  it('handles a whole number with no decimal point', () => {
    expect(parseWamToWamoshi('10')).toBe(10n * WAMOSHI_PER_WAM)
  })

  it('rejects zero', () => {
    expect(() => parseWamToWamoshi('0')).toThrow(InvalidAmountError)
  })

  it('rejects a negative amount', () => {
    expect(() => parseWamToWamoshi('-1')).toThrow(InvalidAmountError)
  })

  it('rejects more than 8 decimal places', () => {
    expect(() => parseWamToWamoshi('1.123456789')).toThrow(InvalidAmountError)
  })

  it('rejects non-numeric garbage', () => {
    expect(() => parseWamToWamoshi('abc')).toThrow(InvalidAmountError)
  })

  it('never introduces floating point error on a value that breaks naive float math', () => {
    // 0.1 + 0.2 famously != 0.3 in IEEE754; this must be exact here.
    const a = parseWamToWamoshi('0.1')
    const b = parseWamToWamoshi('0.2')
    expect(formatWamoshi(a + b)).toBe('0.30000000')
  })
})

describe('rpcAmountToWamoshi / wamoshiToRpcAmount', () => {
  it('converts an RPC-style decimal amount', () => {
    expect(rpcAmountToWamoshi(0.5)).toBe(50_000_000n)
  })

  it('accepts zero RPC amounts for empty balance buckets', () => {
    expect(rpcAmountToWamoshi(0)).toBe(0n)
    expect(rpcAmountToWamoshi('0.00000000')).toBe(0n)
  })

  it('formats back to the decimal string an RPC call expects', () => {
    expect(wamoshiToRpcAmount(50_000_000n)).toBe('0.50000000')
  })
})
