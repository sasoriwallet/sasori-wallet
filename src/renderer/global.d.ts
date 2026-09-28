import type { WamWalletApi } from '../preload/index'

declare global {
  interface Window {
    wam: WamWalletApi
  }
}

export {}
