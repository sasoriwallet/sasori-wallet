# Verification checklist

This repository records what was checked for the release candidate. It does not claim an independent security audit.

## Static source audit performed for this release candidate

- No hard-coded wallet name `mine` is used as the active-wallet default.
- Fresh installs begin with an empty wallet name and require explicit Create/Import.
- Newly created wallets receive a generated unique wallet name.
- Imported backups receive a generated unique wallet name.
- The user's source wallet backup is copied, not moved or overwritten.
- Managed-node RPC is localhost-only.
- The managed node archive is SHA-256 checked before extraction.
- RPC passwords are stored with Electron `safeStorage`; real passwords are redacted from renderer settings.
- Renderer uses Electron isolation settings and a narrow preload bridge.
- The sidebar contains Home / Settings / Donate; Transactions are accessed through Home → View all.
- Address Book has been removed from the UI and IPC layer.
- Home uses the WAM logo beside the balance.
- Home balance polling is 3 seconds; activity polling is 10 seconds.
- Encrypted wallets are locked after node readiness before the main wallet UI is released.
- The Windows build icon contains a 256×256 image resource.

## Build limitation

A fresh dependency install could not be completed in the analysis environment, so `npm run typecheck`, `npm test` and `npm run build:win` must still be executed on a Windows development machine before publishing the installer.

## Manual release test

Use a disposable test wallet and verify Create, Import, backup/restore, restart, lock/unlock, send/review/broadcast, receive, transaction details and clean first-run behavior.
