SASORI WALLET 0.0.1v
======================

This source tree contains the current Sasori Wallet pixel/Exodus-style UI and managed-node release candidate.

Current UI behavior:
- WAM logo beside the main balance.
- Sasori logo for branding/loading/lock/setup screens.
- Home / Settings / Donate sidebar.
- Send/Receive as Home actions.
- Transactions via Recent Transactions and View all.
- Address Book removed.
- Live balance refresh approximately every 3 seconds.
- Startup remains on the loading screen until the managed node and selected wallet are ready.
- New wallet creation uses an explicit password and a unique wallet name.
- Wallet import never moves or overwrites the original backup.

Build on Windows with:
  npm install
  npm run typecheck
  npm test
  npm run build:win
