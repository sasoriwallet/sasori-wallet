# 🦂 Sasori Wallet

**Sasori Wallet** is an open-source Windows desktop wallet for **WAM Coin**, built with Electron, React, and TypeScript.

Sasori runs a **local WAM node** on your computer and communicates with it through local JSON-RPC. Your wallet and private keys remain under your local control.

## ✨ Features

* 🖥️ Windows desktop wallet
* 🔒 Encrypted wallet support
* 🛡️ Private keys handled by the local WAM node
* 🌐 Local WAM node with RPC restricted to `127.0.0.1`
* 💰 Send and receive WAM
* 📊 Available, pending, immature, and total balances
* 📜 Transaction history and transaction details
* 📷 QR-code receiving
* 📥 Import existing `.dat` wallet backups
* 💾 Create `.dat` wallet backups
* 🔐 Lock, unlock, and encrypt wallets
* 🔄 Blockchain rescan
* 🏠 Stable receiving address
* ➕ Generate additional receiving addresses
* 🎨 Pixel-art inspired interface
* ⚡ Automatic balance and transaction updates

## 🔐 Privacy & Security

Sasori is designed around local wallet management.

* Private keys are handled by the WAM node rather than the React renderer.
* The managed node's RPC interface is bound to `127.0.0.1`.
* RPC is not exposed to the public internet.
* The renderer runs with Electron security protections including context isolation, sandboxing, and no Node.js integration.
* RPC credentials are protected using Electron `safeStorage`.
* The WAM node download is verified using SHA-256 before extraction.
* Wallet backups are only created when the user explicitly chooses a destination.

**Sasori does not require you to upload your wallet to a remote server.**

> ⚠️ Your `.dat` wallet backup contains sensitive key material. Never upload your wallet backup, private keys, or seed information to GitHub, Discord, Telegram, or other public services.

## 🚀 First Launch

After installing Sasori:

```text
Install Sasori
      ↓
Download / verify WAM node
      ↓
Start local node
      ↓
Synchronize with WAM Mainnet
      ↓
Choose wallet
   ↙        ↘
Create     Import
wallet     .dat
   ↘        ↙
    Wallet Ready
```

On a fresh installation, Sasori does **not** assume that a wallet named `mine` exists.

You explicitly choose whether to create a new wallet or import an existing wallet.

## 🆕 Creating a Wallet

On first launch, choose **Create New Wallet**.

Sasori asks you to create a wallet password. The password is passed to the WAM wallet creation system and is not stored by Sasori.

### Important

**Back up your wallet before receiving real funds.**

Go to:

**Settings → Backup Wallet**

Save the `.dat` file somewhere safe and preferably keep an offline copy.

## 📥 Importing a Wallet

To restore an existing wallet:

1. Choose **Import Wallet**
2. Select your `.dat` backup
3. Sasori copies the backup into its managed wallet directory
4. The wallet is loaded
5. The blockchain is rescanned
6. The imported wallet becomes the active wallet

The original `.dat` file is **not moved or deleted** during import.

## 💾 Wallet Backups

Your wallet backup is extremely important.

A `.dat` backup contains sensitive wallet key material and should be treated like cash.

### Recommended backup practice

Keep at least one backup in a secure offline location.

For example:

```text
USB drive
└── Sasori Wallet Backup
    └── my-wallet.dat
```

Do **not**:

* Upload it to GitHub
* Send it to other people
* Post it in Telegram or Discord
* Store it in a public cloud folder
* Share your wallet password

If you lose your computer and don't have a backup, you may lose access to your wallet.

## 💸 Sending WAM

1. Open **Send**
2. Enter the recipient's `wam1...` address
3. Enter the amount
4. Review the transaction
5. Check the recipient, amount, fee, and remaining balance
6. Confirm the transaction

Sasori provides a review step before the transaction is signed and broadcast.

## 📥 Receiving WAM

The Home and Receive pages display your receiving address and QR code.

You can also generate additional receiving addresses when needed.

## 🔒 Wallet Locking

Encrypted wallets are locked when appropriate and require the wallet password to unlock.

You can also manage wallet encryption and locking from:

**Settings → Wallet Security**

If you import an unencrypted wallet, encrypt it before relying on wallet locking for protection.

## 🖥️ Download

Windows users can download the latest compiled version from the project's **GitHub Releases** page.

The source code is also available in this repository so the wallet can be inspected and built from source.

> ⚠️ The Windows installer is currently unsigned. Windows SmartScreen may display a warning because the application does not currently use a code-signing certificate.

## 🛠️ Build From Source

### Requirements

* Windows 10/11
* Node.js 18+
* npm
* Git

### Install dependencies

```bash
npm install
```

### Type-check

```bash
npm run typecheck
```

### Run tests

```bash
npm test
```

### Development mode

```bash
npm run dev
```

### Build Windows installer

```bash
npm run build:win
```

The Windows installer is generated in:

```text
dist/
```

## 📁 Project Structure

```text
src/
├── main/        Electron main process, node management, RPC and wallet logic
├── preload/     Secure IPC bridge
├── renderer/    React user interface
└── shared/      Shared types and utilities

tests/           Unit tests
build/           Windows installer resources
```

## 🌐 WAM Node

Sasori manages a local WAM node and communicates with it through local RPC.

The managed RPC endpoint is:

```text
127.0.0.1:9554
```

The RPC interface is intentionally bound to localhost rather than being exposed to the internet.

## ⚠️ Important

Sasori is wallet software. **Always back up your wallet before storing real funds.**

The project is open source, but users should still verify the software they download and protect their wallet backups and passwords.

### 🦂 Sasori Wallet

**Local. Open source. Built for WAM.**
