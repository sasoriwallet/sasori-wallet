# Security notes

## Wallet keys

Sasori does not directly hold private keys in the renderer. Wallet keys remain inside the WAM node wallet. Signing is requested from the node through wallet RPCs.

## Wallet password

New wallets created in the first-run wizard are encrypted by the WAM node using the password entered by the user. Sasori does not store that password. For imported wallets, Sasori preserves their existing encryption state.

## RPC credentials

Managed-node RPC is localhost-only. The RPC password generated for the managed node is stored through Electron `safeStorage`. The real password is not exposed to the renderer.

Do not expose port 9554 to the internet.

## Electron isolation

The renderer uses:

- `contextIsolation: true`
- `sandbox: true`
- `nodeIntegration: false`
- a strict Content-Security-Policy
- a narrow typed preload bridge

Navigation to arbitrary remote pages is blocked and new-window requests are denied.

## Wallet backups

A wallet backup is sensitive key material. Treat it as a secret and keep it offline. Never commit it to GitHub.

## Node verification

The managed-node downloader checks the SHA-256 hash listed in the official WAM `SHA256SUMS` file before extracting the archive. The app does not currently perform independent GPG verification of the checksum file.

## Release limitations

- The Windows installer is unsigned.
- No external penetration test or code audit has been performed.
- Webcam QR capture is not implemented; QR scanning from an image is supported.
- Legacy `W...` address validation is intentionally disabled.

These are release limitations, not claims of perfect security.
