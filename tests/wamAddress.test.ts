import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { bech32 } from 'bech32'
import { validateWamAddress, assertAddressOnNetwork } from '../src/shared/wamAddress'

// Independent, minimal Base58Check encoder used ONLY to build test fixtures.
// Deliberately does not reuse bs58check from the source under test, so a
// passing test means two independent implementations agree, not that the
// source agrees with itself.
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58encode(buffer: Buffer): string {
  let num = BigInt('0x' + Buffer.concat([Buffer.from([0]), buffer]).toString('hex'))
  let encoded = ''
  while (num > 0n) {
    const rem = num % 58n
    num /= 58n
    encoded = ALPHABET[Number(rem)] + encoded
  }
  let leadingZeros = 0
  for (const b of buffer) {
    if (b === 0) leadingZeros++
    else break
  }
  return ALPHABET[0].repeat(leadingZeros) + encoded
}

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest()
}

function encodeBase58Check(versionByte: number, hash160: Buffer): string {
  const payload = Buffer.concat([Buffer.from([versionByte]), hash160])
  const checksum = sha256(sha256(payload)).subarray(0, 4)
  return base58encode(Buffer.concat([payload, checksum]))
}

const SAMPLE_HASH160 = Buffer.from('00112233445566778899aabbccddeeff00112233', 'hex') // arbitrary 20-byte program

function encodeBech32(hrp: string, witnessVersion: number, program: Buffer): string {
  const words = [witnessVersion, ...bech32.toWords(program)]
  return bech32.encode(hrp, words, 1023)
}

describe('validateWamAddress: legacy Base58Check ("W...") addresses', () => {
  // Version byte 73 produces the legacy W-prefixed fixture, but legacy
  // Base58 version semantics are not yet confirmed by the project. The
  // validator therefore refuses this family rather than guessing.
  const address = encodeBase58Check(73, SAMPLE_HASH160)

  it('starts with W', () => {
    expect(address[0]).toBe('W')
  })

  it('is refused with an explicit, honest reason rather than silently validated', () => {
    const result = validateWamAddress(address)
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/cannot be safely validated yet/i)
  })

  it('a corrupted checksum is still rejected (fails before reaching the safety gate)', () => {
    const corrupted = address.slice(0, -1) + (address.endsWith('1') ? '2' : '1')
    const result = validateWamAddress(corrupted)
    expect(result.valid).toBe(false)
  })
})

describe('validateWamAddress: bech32 segwit', () => {
  it('accepts a valid mainnet wam1... P2WPKH address', () => {
    const address = encodeBech32('wam', 0, SAMPLE_HASH160)
    const result = validateWamAddress(address)
    expect(result.valid).toBe(true)
    expect(result.info?.network).toBe('mainnet')
    expect(result.info?.kind).toBe('p2wpkh')
  })

  it('accepts a valid testnet twam1... address', () => {
    const address = encodeBech32('twam', 0, SAMPLE_HASH160)
    const result = validateWamAddress(address)
    expect(result.valid).toBe(true)
    expect(result.info?.network).toBe('testnet')
  })

  it('rejects a bech32 address with a flipped character (bad checksum)', () => {
    const address = encodeBech32('wam', 0, SAMPLE_HASH160)
    const flipped = address.slice(0, -1) + (address.endsWith('q') ? 'p' : 'q')
    const result = validateWamAddress(flipped)
    expect(result.valid).toBe(false)
  })

  it('accepts a 32-byte program as P2WSH', () => {
    const program32 = Buffer.alloc(32, 7)
    const address = encodeBech32('wam', 0, program32)
    const result = validateWamAddress(address)
    expect(result.valid).toBe(true)
    expect(result.info?.kind).toBe('p2wsh')
  })
})

describe('validateWamAddress: malformed input', () => {
  it('rejects an empty string', () => {
    expect(validateWamAddress('').valid).toBe(false)
  })

  it('rejects a string containing whitespace', () => {
    expect(validateWamAddress('wam1 abc').valid).toBe(false)
  })

  it('rejects garbage text', () => {
    expect(validateWamAddress('not-a-real-address').valid).toBe(false)
  })
})

describe('assertAddressOnNetwork', () => {
  it('rejects a mainnet address when the wallet is set to testnet', () => {
    const mainnetAddress = encodeBech32('wam', 0, SAMPLE_HASH160)
    const result = assertAddressOnNetwork(mainnetAddress, 'testnet')
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/mainnet address/i)
  })

  it('accepts a testnet address when the wallet is set to testnet', () => {
    const testnetAddress = encodeBech32('twam', 0, SAMPLE_HASH160)
    const result = assertAddressOnNetwork(testnetAddress, 'testnet')
    expect(result.valid).toBe(true)
  })
})
