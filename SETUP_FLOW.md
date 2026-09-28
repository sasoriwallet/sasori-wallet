# First-run setup flow

1. Sasori creates its app-owned managed-node directories under `%APPDATA%\Sasori Wallet\wam-mainnet`.
2. If needed, it downloads the official WAM v0.1.11 Windows x64 archive.
3. It verifies the archive against the official SHA-256 checksum entry.
4. It creates a localhost-only RPC configuration with a random password.
5. It starts `wamd.exe` with the managed data directory.
6. The loading screen remains visible while the node starts and synchronizes.
7. Once the node is ready, the wizard asks the user to **Create new wallet** or **Import wallet.dat**.
8. Create assigns a unique wallet name and encrypts the new wallet with the password chosen by the user.
9. Import copies the selected backup to a unique wallet directory, loads it and rescans it.
10. Sasori saves the selected wallet name locally and reuses that wallet after future node restarts.

There is no hard-coded `mine` wallet and no automatic wallet selection on a fresh install.

The original imported backup stays untouched.
