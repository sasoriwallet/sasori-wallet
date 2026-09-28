# Release warning

Do not publish the Windows installer as a trusted production wallet until these commands pass on Windows:

```powershell
npm install
npm run typecheck
npm test
npm run build:win
```

Then test the resulting installer on a clean Windows user profile or second test machine using a disposable wallet.

Expected first run:

```text
Install
 → managed node setup
 → synchronization
 → Create new wallet OR Import wallet.dat
```

The application must never silently use a developer's wallet. There must be no `wallet.dat`, private key, seed/recovery file or RPC password in the Git repository.

The repository contains an unsigned Windows installer configuration. SmartScreen warnings are expected until the application is code-signed.
