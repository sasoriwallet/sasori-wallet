import { describe, it, expect, vi } from 'vitest'
import { bech32 } from 'bech32'
import { TransactionService } from '../src/main/transaction/TransactionService'
import type { WamRpcClient } from '../src/main/rpc/WamRpcClient'

/**
 * Minimal fake standing in for WamRpcClient. Only implements what
 * TransactionService actually calls, with vi.fn() so tests can assert on
 * call counts/args without needing a live WAM node.
 */
function makeFakeRpc(overrides: Partial<Record<string, any>> = {}) {
  return {
    validateAddress: vi.fn().mockResolvedValue({ isvalid: true }),
    getBalances: vi.fn().mockResolvedValue({ mine: { trusted: 10, untrusted_pending: 0, immature: 0 } }),
    createRawTransaction: vi.fn().mockResolvedValue('unfunded-hex'),
    fundRawTransaction: vi.fn().mockResolvedValue({ hex: 'funded-hex', fee: 0.0001, changepos: 1 }),
    decodeRawTransaction: vi.fn().mockResolvedValue({ txid: 'decoded-txid', vin: [{}], vout: [{}, {}] }),
    signRawTransactionWithWallet: vi.fn().mockResolvedValue({ hex: 'signed-hex', complete: true }),
    sendRawTransaction: vi.fn().mockResolvedValue('broadcast-txid'),
    listTransactions: vi.fn().mockResolvedValue([]),
    getTransaction: vi.fn(),
    scanAddressUtxoSet: vi.fn().mockResolvedValue({ success: true, txouts: 0, height: 100, bestblock: 'x', unspents: [], total_amount: 3.5 }),
    ...overrides
  } as unknown as WamRpcClient
}

// Generate valid WAM Bech32 fixtures in the test itself so the checksum is
// derived from the actual WAM HRP instead of copying a Bitcoin example and
// accidentally retaining an invalid checksum.
const SAMPLE_HASH160 = Buffer.from('00112233445566778899aabbccddeeff00112233', 'hex')
function encodeBech32(hrp: string, witnessVersion: number, program: Buffer): string {
  return bech32.encode(hrp, [witnessVersion, ...bech32.toWords(program)], 1023)
}
const MAINNET_ADDRESS = encodeBech32('wam', 0, SAMPLE_HASH160)
const TESTNET_ADDRESS = encodeBech32('twam', 0, SAMPLE_HASH160)

describe('TransactionService.prepareSend', () => {
  it('rejects an address from the wrong network before touching the RPC', async () => {
    const rpc = makeFakeRpc()
    const service = new TransactionService(rpc, 'mainnet', '')

    await expect(service.prepareSend({ toAddress: TESTNET_ADDRESS, amountWam: '1' })).rejects.toThrow(/testnet address/i)
    expect(rpc.validateAddress).not.toHaveBeenCalled()
    expect(rpc.getBalances).not.toHaveBeenCalled()
  })

  it('rejects an amount larger than the available balance', async () => {
    const rpc = makeFakeRpc({ getBalances: vi.fn().mockResolvedValue({ mine: { trusted: 0.5, untrusted_pending: 0, immature: 0 } }) })
    const service = new TransactionService(rpc, 'mainnet', '')

    await expect(service.prepareSend({ toAddress: MAINNET_ADDRESS, amountWam: '1' })).rejects.toThrow(/insufficient/i)
  })

  it('builds a review with fee/total/remaining balance computed from the funded transaction', async () => {
    const rpc = makeFakeRpc()
    const service = new TransactionService(rpc, 'mainnet', 'https://explorer.example.org')

    const review = await service.prepareSend({ toAddress: MAINNET_ADDRESS, amountWam: '2' })

    expect(review.amountWam).toBe('2.00000000')
    expect(review.feeWam).toBe('0.00010000')
    expect(review.totalWam).toBe('2.00010000')
    expect(review.remainingBalanceWam).toBe('7.99990000') // 10 - 2.0001
    expect(review.reviewToken).toBeTruthy()
  })
})

describe('TransactionService.confirmSend', () => {
  it('signs and broadcasts a previously reviewed transaction exactly once', async () => {
    const rpc = makeFakeRpc()
    const service = new TransactionService(rpc, 'mainnet', 'https://explorer.example.org')

    const review = await service.prepareSend({ toAddress: MAINNET_ADDRESS, amountWam: '1' })
    const result = await service.confirmSend(review.reviewToken)

    expect(result.txid).toBe('broadcast-txid')
    expect(result.explorerUrl).toBe('https://explorer.example.org/tx/broadcast-txid')
    expect(rpc.signRawTransactionWithWallet).toHaveBeenCalledWith('funded-hex')
    expect(rpc.sendRawTransaction).toHaveBeenCalledWith('signed-hex')
  })

  it('refuses to replay the same review token twice', async () => {
    const rpc = makeFakeRpc()
    const service = new TransactionService(rpc, 'mainnet', '')

    const review = await service.prepareSend({ toAddress: MAINNET_ADDRESS, amountWam: '1' })
    await service.confirmSend(review.reviewToken)

    await expect(service.confirmSend(review.reviewToken)).rejects.toThrow(/expired/i)
  })

  it('surfaces a clear error when the node cannot complete signing (e.g. locked wallet)', async () => {
    const rpc = makeFakeRpc({ signRawTransactionWithWallet: vi.fn().mockResolvedValue({ hex: '', complete: false, errors: [{ error: 'locked' }] }) })
    const service = new TransactionService(rpc, 'mainnet', '')

    const review = await service.prepareSend({ toAddress: MAINNET_ADDRESS, amountWam: '1' })
    await expect(service.confirmSend(review.reviewToken)).rejects.toThrow(/could not sign/i)
  })
})

describe('TransactionService.checkAddress', () => {
  it('never calls anything but the read-only UTXO scan, and never imports the address', async () => {
    const rpc = makeFakeRpc()
    const service = new TransactionService(rpc, 'mainnet', '')

    const result = await service.checkAddress(MAINNET_ADDRESS)

    expect(result.confirmedWam).toBe('3.50000000')
    expect(rpc.scanAddressUtxoSet).toHaveBeenCalledWith(MAINNET_ADDRESS)
    expect(rpc.getBalances).not.toHaveBeenCalled()
    expect(rpc.validateAddress).not.toHaveBeenCalled()
  })

  it('rejects a check for an address on the wrong network without calling the RPC', async () => {
    const rpc = makeFakeRpc()
    const service = new TransactionService(rpc, 'mainnet', '')

    await expect(service.checkAddress(TESTNET_ADDRESS)).rejects.toThrow(/testnet address/i)
    expect(rpc.scanAddressUtxoSet).not.toHaveBeenCalled()
  })
})
