# Stellar Pay

## What this is

Stellar Pay is a chat-first social payments app: two people (or a group) message each other, and inside that same conversation they can request XLM, pay each other, or split a shared expense ("pinned outing") evenly. Every payment is a real Stellar network transaction — the server never holds funds or private keys; it only builds unsigned transactions and relays already-signed ones to Horizon.

There are three client surfaces sharing one backend:

| Surface | Stack | Status |
|---|---|---|
| `web/` | React 19 + Vite, Freighter browser extension | Deployed (Vercel) |
| `mobile/` | Flutter, Reown AppKit (WalletConnect) + Freighter mobile | In development |
| `backend/` | Fastify + Socket.IO + `node:sqlite`, deployed on Render | Deployed |

A fourth piece, `contracts/` (two Soroban/Rust contracts, `payments` and `split_expense`, compiled to `.wasm` in `contracts/dist/`), exists in the repo but **is not currently invoked by the backend or either client** — all real money movement today goes through classic Stellar `Operation.payment`, not a Soroban contract call. Treat the contracts directory as dormant/experimental unless that changes.

## Product surface

- **Identity**: a Stellar public address (`G...`) plus a chosen `@username` (3–20 chars, `[a-z0-9_]`, case-insensitive unique). No email, no password.
- **Direct messages**: search a username → sends a chat request → recipient accepts/rejects → a direct chat is created (or reused if one already exists).
- **Group chats**: creator + a set of usernames, unlimited size.
- **Payments in-chat**:
  - **Pay now**: build an unsigned XDR for a chat member → sign in wallet → submit.
  - **Request XLM**: post a request to a chat member, they pay it the same way.
  - **Pinned outing (expensGenerate a full project.md file that contains what is the product related, what it's like of it like the security of the setup Yeah, everything about this protecting.## Architecture & data flow

```
Freighter (web ext.) ──┐
                        ├─ signs XDR ──► POST /payments/submit ──► Horizon (testnet)
Reown/WalletConnect ────┘                     ▲
   (Freighter mobile,        POST /payments/build
    EVM wallets)                    │
                                     ▼
        Flutter / React clients ──► Fastify REST + Socket.IO ──► node:sqlite (users, chats, groups, expenses)
                                                              └─► in-memory Map (messages, payment requests)
```

- **`backend/db.js`** — the only durable store. SQLite (`node:sqlite`, Node's built-in driver, zero extra dependency) with `STRICT` tables for `users`, `chats`, `chat_requests`, `group_chats`, `group_members`, `expenses`, `expense_participants`.
- **Messages and payment requests are in-memory only** (`Map` in `backend/app.js`) — they are lost on every backend restart/redeploy. This is a deliberate MVP simplification, not a bug, but it means chat history and open payment requests do not survive a deploy.
- **`backend/app.js`** — `buildApp({ store, horizon })` builds a Fastify instance with no side effects (added this session so the app is unit/integration-testable via `.inject()` without binding a real port). `backend/index.js` is now a 5-line entrypoint that calls it and `.listen()`s.
- Payment amounts are stored/transmitted as decimal XLM strings and converted to integer stroops (`toStroops`/`toXlm`) for exact arithmetic — no floating point is used for money.

## Security model — read this before assuming anything is protected

**Core design choice: the server is non-custodial and holds no keys.** `POST /payments/build` returns an *unsigned* transaction envelope; the client signs it locally (Freighter extension, Freighter mobile, or an EVM wallet via Reown for the — currently separate — EVM-wallet surface) and only the *signed* envelope is ever sent back, to `POST /payments/submit`, which just forwards it to Horizon. The backend's Stellar secret key material is never generated, requested, or stored anywhere in this codebase.

Beyond that one strong guarantee, **the rest of the API has no authentication or authorization layer at all**:

- **No sessions, no tokens, no signature challenge.** Every endpoint (`/users`, `/chats/*`, `/messages`, `/requests`, `/expenses`) trusts whatever `address`/`sender`/`payer` string is in the request body. Nothing proves the caller actually controls the private key for that address.
- **Practical impact**: anyone who knows (or guesses) a user's public Stellar address can, today: register that address's username if it hasn't claimed one yet, send messages "as" that address's username in a chat, and create payment requests attributed to that address. They **cannot** move that address's real funds — `/payments/build` only produces an *unsigned* XDR, and Horizon will reject anything not signed by the real key — but they can spoof social/messaging activity and spam payment requests against a real user.
- **Chat-membership checks exist but are address-based, not signature-based**: `/payments/build`, `/requests`, and outing-payment endpoints all check `store.chatHasMembers(...)` before proceeding, which is correct scoping *given* the caller's claimed address — it just doesn't verify the caller *is* that address.
- **CORS is a hardcoded allowlist** (`http://localhost:5173`, the Vercel web origin) in `backend/app.js`. Note: `backend/.env.example` documents a `WEB_ORIGIN` variable that is **not actually read anywhere in the code** — it's dead config; changing it does nothing today.
- **No rate limiting, no request size limits, no brute-force protection** on any route.
- **Everything runs on Stellar testnet** (`Networks.TESTNET`, `horizon-testnet.stellar.org`, Friendbot-funded test accounts) — test XLM only, not real value, which meaningfully lowers the blast radius of the gaps above for now. Swapping to mainnet would require re-auditing every point in this section first.
- **Secrets in the repo**: `backend/.env` and `mobile/.env` are both gitignored (root `.gitignore` has `.env`; `mobile/.gitignore` has `.env` added this session). `REOWN_PROJECT_ID` is a WalletConnect *project identifier*, not a secret — it's meant to be public and does get bundled into the built mobile app (via `flutter_dotenv` loading `.env` as a Flutter asset), which is expected/fine for this kind of ID, not a leak.
- **Mobile deep-link handling** (`stellarpay://`) is implemented natively on both Android (`MainActivity.kt`) and iOS (`AppDelegate.swift`/`SceneDelegate.swift`) via a custom `MethodChannel`/`EventChannel`, forwarding incoming WalletConnect response links into `ReownAppKitModal.dispatchEnvelope`. Android's release manifest now declares `INTERNET` explicitly and a wallet-app `<queries>` allowlist (both added this session — the release manifest previously lacked `INTERNET`, which would have silently broken all networking, including the payment-signing relay, in a production build).
- **Backend tests never touch the real database or network** by default: `npm test` uses `createStore(':memory:')` and a fake Horizon; the one suite that hits real Stellar testnet (`payments.integration.test.mjs`, funds throwaway keypairs via Friendbot and submits a real signed payment) is opt-in via `npm run test:integration` and skips cleanly if the network is unreachable.

### If this were headed to mainnet / real users, the priority list would be

1. Require a signed challenge (e.g. sign a nonce with the claimed address's key) before trusting `address`/`sender`/`payer` on any write endpoint — or move to session tokens issued after a one-time signature proof.
2. Persist messages and payment requests to SQLite instead of process memory.
3. Add rate limiting (Fastify has first-party plugins for this) and request body size limits.
4. Wire `WEB_ORIGIN` into the actual CORS config, or delete it from `.env.example` to stop it lying.
5. Decide the fate of `contracts/` — either integrate and audit them, or remove the dead Soroban build artifacts to avoid confusion about what's actually running.
6. Re-run this whole section against `Networks.PUBLIC` before ever pointing the app at mainnet.

## Backend API surface (Fastify, `backend/app.js`)

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET /users/address/:address`, `GET /users/lookup/:username` | Profile lookup |
| `POST /users` | Claim a username for an address (409 on either collision) |
| `GET /chats/user/:address`, `GET /chats/requests/:address` | List a user's chats / pending DM invites |
| `POST /chats/direct` | Start or reuse a DM (creates an invite if no chat exists yet) |
| `POST /chats/requests/:id` | Accept/reject a DM invite |
| `POST /chats/group` | Create a group chat |
| `GET/POST /chats/:chatId/messages` | Chat messages (in-memory) |
| `GET/POST /chats/:chatId/requests`, `POST /requests/:id/pay` | Payment requests (in-memory) |
| `GET/POST /chats/:chatId/expenses`, `POST /expenses`, `POST /expenses/:id/pay` | Pinned outings / expense splitting (SQLite) |
| `POST /payments/build` | Build an unsigned native-XLM payment XDR (requires chat membership) |
| `POST /payments/submit` | Submit a client-signed XDR to Horizon |

## Testing (added this session)

- `backend/helpers.test.mjs` — pure amount/username validation logic.
- `backend/db.test.mjs` — SQLite store logic (`:memory:`).
- `backend/routes.test.mjs` — full HTTP surface via Fastify `.inject()` against an in-memory store and a fake Horizon (auth/validation paths, expense split math, request/pay flows).
- `backend/payments.integration.test.mjs` — real Stellar testnet round trip: Friendbot-funds two fresh keypairs, builds → signs → submits a real payment through the actual API, asserts the on-chain balance moved.
- Run `npm test` (fast, offline, 18 tests) or `npm run test:all` (includes the live-network suite) from `backend/`.

## Recent fixes (this session, mobile)

- `REOWN_PROJECT_ID` moved from a required `--dart-define` (broke under IDE Run buttons) to `flutter_dotenv` reading `mobile/.env`.
- Fixed a systemic bug where `showModalBottomSheet`/`ScaffoldMessenger` calls used a `BuildContext` from *above* the app's `MaterialApp` (no `Navigator`/`Localizations` ancestor), which silently swallowed exceptions and made "New direct message", "New group", and "Connect wallet" all no-ops. Fixed via a `GlobalKey<NavigatorState>` + `_ctx` getter pattern.
- Added a `stellar` WalletConnect namespace (Freighter's own convention — there is no CAIP standard for Stellar RPC methods) so Freighter mobile can be selected in the Reown connect modal at all; chain set to `stellar:testnet` to match the test wallet.
- Wired the Reown-connected Stellar address into the app's `profile` state (`_adoptAddress`) — previously connecting via Freighter/Reown never touched the app's identity state, so username creation failed with "address is required" even while "connected."
