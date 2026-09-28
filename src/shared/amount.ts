/**
 * WAM, like Bitcoin, has 8 decimal places. All arithmetic here is done in
 * integer "wamoshi" (1 WAM = 100_000_000 wamoshi) using BigInt so that
 * display/formatting never introduces floating-point rounding errors into a
 * money calculation. RPC calls that go to a Bitcoin-Core-style daemon
 * (`sendtoaddress`, amounts in `listunspent`, etc.) use decimal WAM strings,
 * so the boundary conversion happens only at the RPC edge, not in any
 * calculation.
 */

export const WAMOSHI_PER_WAM = 100_000_000n

export class InvalidAmountError extends Error {}

/** Parses a user-entered decimal WAM string (e.g. "12.5") into integer wamoshi. */
export function parseWamToWamoshi(input: string): bigint {
  const trimmed = input.trim()
  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) {
    throw new InvalidAmountError('Enter a valid WAM amount (up to 8 decimal places).')
  }
  const [whole, frac = ''] = trimmed.split('.')
  const fracPadded = frac.padEnd(8, '0')
  const wamoshi = BigInt(whole) * WAMOSHI_PER_WAM + BigInt(fracPadded)
  if (wamoshi <= 0n) {
    throw new InvalidAmountError('Amount must be greater than zero.')
  }
  return wamoshi
}

/** Formats integer wamoshi as a fixed 8-decimal WAM string, e.g. "12.48392015". */
export function formatWamoshi(wamoshi: bigint): string {
  const negative = wamoshi < 0n
  const abs = negative ? -wamoshi : wamoshi
  const whole = abs / WAMOSHI_PER_WAM
  const frac = (abs % WAMOSHI_PER_WAM).toString().padStart(8, '0')
  return `${negative ? '-' : ''}${whole.toString()}.${frac}`
}

/** Converts a decimal-WAM-string amount as returned by the RPC daemon into integer wamoshi. */
export function rpcAmountToWamoshi(rpcAmount: number | string): bigint {
  // RPC responses legitimately use zero for empty buckets such as
  // untrusted_pending and immature. The user-input parser intentionally rejects
  // zero, but RPC response conversion must allow it.
  const asString = typeof rpcAmount === 'number' ? rpcAmount.toFixed(8) : rpcAmount.trim()
  if (/^0(?:\.0{1,8})?$/.test(asString)) return 0n
  return parseWamToWamoshi(asString)
}

/** Converts integer wamoshi back into the decimal string form Bitcoin-Core-style RPCs expect for amount params. */
export function wamoshiToRpcAmount(wamoshi: bigint): string {
  return formatWamoshi(wamoshi)
}
