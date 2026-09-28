/** Defensive WAM address validation. Validation is deliberately total: malformed
 * user input must return a normal validation error and never throw into React. */
import bs58check from 'bs58check'
import { bech32 } from 'bech32'

export type WamNetwork = 'mainnet' | 'testnet' | 'regtest'
export type WamAddressKind = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr-or-unknown-segwit'
export interface WamAddressInfo { address: string; network: WamNetwork; kind: WamAddressKind; payloadHex: string }
export interface AddressValidationResult { valid: boolean; info?: WamAddressInfo; reason?: string }

const MAINNET_BASE58 = { pubKeyHashVersion: 73, scriptHashVersion: 135, wifVersion: 190 } as const
const BASE58_VERSION_BYTES_CONFIRMED = false
const BECH32_HRP: Record<WamNetwork, string> = { mainnet: 'wam', testnet: 'twam', regtest: 'wamrt' }

function decodeBase58(address: string): AddressValidationResult {
  try {
    const payload = bs58check.decode(address)
    if (payload.length !== 21) return { valid: false, reason: 'Invalid WAM address (unexpected payload length).' }
    if (!BASE58_VERSION_BYTES_CONFIRMED) {
      return { valid: false, reason: "Legacy WAM addresses cannot be safely validated yet. Use a bech32 address beginning with wam1." }
    }
    const version = payload[0]
    const hash160 = payload.slice(1)
    if (version === MAINNET_BASE58.pubKeyHashVersion) return { valid: true, info: { address, network: 'mainnet', kind: 'p2pkh', payloadHex: Buffer.from(hash160).toString('hex') } }
    if (version === MAINNET_BASE58.scriptHashVersion) return { valid: true, info: { address, network: 'mainnet', kind: 'p2sh', payloadHex: Buffer.from(hash160).toString('hex') } }
    return { valid: false, reason: 'Invalid WAM address (unrecognized version).' }
  } catch {
    return { valid: false, reason: 'Invalid WAM address (bad Base58Check encoding or checksum).' }
  }
}

function decodeBech32(address: string): AddressValidationResult {
  try {
    const lower = address.toLowerCase()
    const network = (Object.keys(BECH32_HRP) as WamNetwork[]).find((n) => lower.startsWith(`${BECH32_HRP[n]}1`))
    if (!network) return { valid: false, reason: 'Invalid WAM address (unrecognized prefix).' }
    const decoded = bech32.decode(lower, 1023)
    if (decoded.prefix !== BECH32_HRP[network]) return { valid: false, reason: 'Invalid WAM address (prefix/checksum mismatch).' }
    if (decoded.words.length < 1) return { valid: false, reason: 'Invalid WAM address (missing witness version).' }
    const witnessVersion = decoded.words[0]
    if (witnessVersion !== 0) return { valid: false, reason: 'Unsupported WAM address version.' }
    const program = bech32.fromWords(decoded.words.slice(1))
    if (program.length !== 20 && program.length !== 32) return { valid: false, reason: 'Invalid WAM address (invalid witness program length).' }
    return { valid: true, info: { address, network, kind: program.length === 20 ? 'p2wpkh' : 'p2wsh', payloadHex: Buffer.from(program).toString('hex') } }
  } catch {
    return { valid: false, reason: 'Invalid WAM address (bad bech32 characters, checksum, or data).' }
  }
}

export function validateWamAddress(rawAddress: string): AddressValidationResult {
  try {
    if (typeof rawAddress !== 'string') return { valid: false, reason: 'Enter a WAM address.' }
    const address = rawAddress.trim()
    if (!address) return { valid: false, reason: 'Enter a WAM address.' }
    if (/\s/.test(rawAddress)) return { valid: false, reason: 'Invalid WAM address (contains whitespace).' }
    if (!/^[\x21-\x7E]+$/.test(address)) return { valid: false, reason: 'Invalid WAM address (unsupported characters).' }
    const lower = address.toLowerCase()
    if ((Object.values(BECH32_HRP) as string[]).some((hrp) => lower.startsWith(`${hrp}1`))) return decodeBech32(address)
    return decodeBase58(address)
  } catch {
    return { valid: false, reason: 'Invalid WAM address.' }
  }
}

export function isValidWamAddress(address: string): boolean { return validateWamAddress(address).valid }

export function assertAddressOnNetwork(address: string, expectedNetwork: WamNetwork): AddressValidationResult {
  const result = validateWamAddress(address)
  if (!result.valid) return result
  if (result.info!.network !== expectedNetwork) return { valid: false, reason: `This is a ${result.info!.network} address, but the wallet is currently set to ${expectedNetwork}.` }
  return result
}
