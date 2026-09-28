# Sasori Wallet 0.0.1v

Sasori Wallet is an open-source Windows desktop wallet interface for **WAM Coin**. It is built with Electron + React + TypeScript and uses a local WAM node (`wamd.exe`) through Bitcoin-Core-style JSON-RPC.

## What this release does

- Downloads the official WAM Windows x64 node when the managed node is not already installed.
- Verifies the downloaded node archive against the official `SHA256SUMS` entry before extraction.
- Runs the node locally with RPC bound to `127.0.0.1:9554`.
- Waits for the node to become ready and synchronized before opening the wallet UI.
- On a fresh installation, **never guesses a wallet name and never silently selects `mine`**.
- Lets the user explicitly **Create new wallet** or **Import wallet.dat**.
- Gives newly created wallets a unique wallet name and encrypts them with the password chosen during first-run setup.
- Imports existing wallet backups by copying them into Sasori's own wallet directory; the original file is never moved or overwritten.
- Keeps the selected wallet name in local settings so the same wallet is reopened after node restarts.
- Shows available, pending, immature and total balances. Home refreshes balances every 3 seconds and recent activity every 10 seconds.
- Provides Send/Receive as the main Home actions. Send requires a review step before signing/broadcasting.
- Shows recent transactions and a full transaction page; clicking a transaction opens its detail view.
- Provides a stable receiving address plus optional generation of additional addresses.
- Supports wallet encrypt/unlock/lock, backup and blockchain rescan.
- Uses a pixel-art-inspired UI with Sasori branding and the WAM logo beside the balance.

## First launch

```text
Install Sasori
      ↓
Download / verify WAM node
      ↓
Start local node
      ↓
Wait for Mainnet synchronization
      ↓
Choose your wallet
   ┌───────────────┐
   │ Create wallet │
   └───────────────┘
          OR
   ┌────────────────┐
   │ Import wallet  │
   │    .dat file   │
   └────────────────┘
      ↓
Wallet ready
```

A fresh install does **not** require or assume a wallet called `mine`. The active wallet name is generated from the user's explicit Create/Import choice.

## Create a wallet

The first-run wizard asks for a password of at least 8 characters. That password is passed directly to the WAM wallet creation RPC so the newly created wallet is encrypted by the node. Sasori does not store the wallet password.

**Back up the wallet before receiving real funds.** Use **Settings → Backup Wallet** and store the backup somewhere private and offline.

## Import an existing wallet

Choose **Import wallet.dat**. Sasori:

1. Opens a native file picker.
2. Copies the selected backup into its own managed wallet directory under `%APPDATA%\Sasori Wallet\wam-mainnet\data\wallets\...`.
3. Assigns a unique wallet name.
4. Loads that wallet with `loadwallet`.
5. Rescans the blockchain.
6. Saves that unique wallet name as the active wallet.

The original backup file is not moved, deleted, uploaded or overwritten.

## Password / locking

For newly created wallets, the password is part of wallet encryption. On subsequent launches, Sasori checks the wallet state after node startup and locks an encrypted wallet before displaying the wallet UI. The lock screen asks for the wallet password.

Existing imported wallets keep their existing encryption state. If an imported wallet is not encrypted, use **Settings → Wallet Security → Encrypt Wallet** before relying on the startup lock.

## Sending WAM

1. Open **Send** from Home.
2. Enter a supported WAM address beginning with `wam1...`.
3. Enter the amount.
4. Optionally scan a QR code from an image.
5. Click **Review Transaction**.
6. Check recipient, amount, fee, total and remaining balance.
7. Click **Confirm & Send**.

The review step prepares the transaction but does not broadcast it. Signing and broadcast happen only after confirmation.

## Receiving WAM

Home and **Receive** show the stable primary receiving address and QR code. Additional receiving addresses can be generated manually.

## Backups

A wallet backup contains sensitive key material. Treat it like cash: keep it private, do not upload it to GitHub, and keep at least one offline copy.

## Development

### Requirements

- Windows 10/11
- Node.js 18+
- npm
- Git (recommended)

### Install

```powershell
npm install
```

### Type-check

```powershell
npm run typecheck
```

### Tests

```powershell
npm test
```

### Development mode

```powershell
npm run dev
```

### Windows installer

```powershell
npm run build:win
```

The unsigned NSIS installer is written to `dist/` with the artifact name `Sasori Wallet-Setup-0.0.1v.exe`. Windows may show a SmartScreen warning because this repository does not configure a code-signing certificate.

## Project structure

```text
src/main/        Electron main process, node manager, RPC, wallet and transactions
src/preload/     narrow typed IPC bridge
src/renderer/    React UI
src/shared/      shared address/amount/error/types
tests/           unit tests
build/           Windows installer resources
```

## Donate page

The built-in Donate page contains a hard-coded WAM donation address in `src/renderer/pages/DonatePage.tsx`. Change that address in the source before publishing a fork if you do not want donations sent to the current project address.

## Security model

- Private keys are held by the WAM node, not the renderer.
- The renderer has `contextIsolation`, `sandbox` and no Node integration.
- RPC credentials are stored using Electron `safeStorage` rather than plaintext JSON.
- Managed RPC is bound to localhost.
- The app does not expose RPC port 9554 to the internet.
- Wallet backups are only created after the user chooses a destination.
- The downloaded WAM node is verified with SHA-256 before extraction.

See [SECURITY.md](./SECURITY.md) and [RELEASE_WARNING.md](./RELEASE_WARNING.md) before distributing a release.

## Important release limitations

- The Windows installer is unsigned in this repository.
- This environment could not complete a fresh `npm install`, so the release candidate still needs a clean Windows machine verification of `npm install`, `npm run typecheck`, `npm test` and `npm run build:win`.
- Legacy `W...` addresses remain intentionally unsupported because the correct legacy version bytes are not established in the source used for this project. Use `wam1...` addresses.
- Live webcam QR scanning is not implemented; QR scanning from an image file is supported.

## License

This project is released under the MIT license as configured by the repository.
