# Sasori Wallet — Beginner Guide

This guide is for someone who has never built or used the Sasori Wallet source before.

## 1. What Sasori is

Sasori is the graphical wallet application. The blockchain itself is maintained by the local `wamd.exe` node. Sasori talks to that node over localhost JSON-RPC.

```text
Sasori UI
   ↓
Electron main process
   ↓
WamRpcClient / WalletService / TransactionService
   ↓
Local wamd.exe
   ↓
WAM blockchain data
```

The renderer never receives private keys directly. Wallet signing happens in the node.

## 2. What happens on a new PC

Sasori stores its managed node data below:

```text
%APPDATA%\Sasori Wallet\wam-mainnet\
```

Inside that area are the managed node files, blockchain data and Sasori's selected wallet.

The first run downloads WAM v0.1.11 when needed, verifies it, starts it, waits for synchronization, and then asks the user to choose a wallet.

## 3. Creating a new wallet

Click **Create new wallet**. You will enter a password twice.

- Minimum password length: 8 characters.
- The WAM node encrypts the new wallet with that password.
- Sasori does not store the password.
- The wallet receives a unique internal name such as `sasori-...`; there is no hard-coded `mine` wallet.

Write the password down somewhere secure. If you lose the password, an encrypted wallet cannot simply be opened by Sasori without it.

## 4. Importing a wallet.dat backup

Click **Import wallet.dat** and select your backup. Sasori makes a copy inside its own wallet directory. It does not move or delete the original. The imported wallet receives a unique internal name and becomes the active wallet.

Keep the original backup somewhere safe.

## 5. Balance

Home shows:

- Available: confirmed spendable WAM.
- Pending: incoming/unconfirmed WAM.
- Total: available + pending + immature.

The Home balance refreshes approximately every 3 seconds while the page is open. Transaction activity refreshes approximately every 10 seconds.

## 6. Send

Use the large **Send** button on Home. Enter the recipient's WAM address and amount. Sasori validates the address locally, prepares a transaction through the node, and shows a review containing the fee and total.

Nothing is broadcast until **Confirm & Send** is clicked.

## 7. Receive

Use **Receive** to display your primary WAM address and QR code. The primary address is stable instead of changing during every UI refresh.

## 8. Transaction history

Home shows recent transactions. Click one to open its details. Use **View all** for the full history.

Sent and received activity are visually distinguished in the UI.

## 9. Locking and password security

Encrypted wallets are locked when Sasori starts. The lock screen asks for the wallet password.

New wallets created through the wizard are encrypted automatically. Imported wallets keep their existing encryption state. For an unencrypted imported wallet, go to:

**Settings → Wallet Security → Encrypt Wallet**

Then lock the wallet.

## 10. Backup

Go to **Settings → Backup Wallet**. Choose a destination on your PC. Keep the resulting file private and offline. Anyone who can restore usable wallet key material may be able to spend the funds.

Do not upload wallet backups to GitHub.

## 11. Build the source

Open PowerShell in the folder containing `package.json`:

```powershell
npm install
npm run typecheck
npm test
npm run build:win
```

The Windows installer appears in `dist/`.

For development:

```powershell
npm run dev
```

## 12. Testing a clean first run

Before distributing the wallet, test on a machine with no previous Sasori data. If you need to reset Sasori on your own Windows test machine, close Sasori and its WAM node, then remove only:

```powershell
Remove-Item "$env:APPDATA\Sasori Wallet\wam-mainnet" -Recurse -Force
```

Do **not** delete a real wallet backup or unrelated WAM data. Use a disposable test wallet for release testing.

Expected result after reset:

```text
Start Sasori
  → download / verify node
  → synchronize
  → Create new wallet OR Import wallet.dat
  → wallet opens
```

## 13. GitHub release

For open source, publish the source tree to GitHub. Do not publish:

```text
wallet.dat
*.dat backups
seed or recovery files
private keys
RPC passwords
.env files
node_modules
dist installers generated locally (unless intentionally attached as a release artifact)
```

Put the Windows installer under the GitHub repository's **Releases** page so users can download a known build without needing Node.js.

## 14. Troubleshooting

### “The WAM node is still starting”

Keep Sasori open. First startup can take longer because the node may be downloading, indexing or synchronizing.

### “No wallet has been selected”

The app is intentionally refusing to guess a wallet. Complete the first-run Create/Import flow.

### Wallet password rejected

Use the password belonging to the specific wallet. An imported encrypted wallet keeps its original password.

### Build error about `build/icon.ico`

The repository includes the Windows icon resource. If you replace it, keep a valid Windows ICO containing a 256×256 image.

## 15. Before real funds

Run the type-check and tests on Windows, build the installer, test a clean machine with a disposable wallet, test Create and Import separately, send a small test transaction, restore a backup, restart the PC, and confirm an encrypted wallet shows the lock screen before relying on it for valuable funds.
