# WakyTalky

A real-time, end-to-end encrypted messaging app. Messages are encrypted on-device — Supabase only ever stores ciphertext.

**Live:** [wakytalky.vercel.app](https://wakytalky.vercel.app)

---

## How it works

- Each user has an **ECDH P-256** identity keypair generated in the browser (private key stays in `localStorage`, never sent to the server).
- Every message uses a fresh, one-time **ephemeral ECDH keypair** for forward secrecy — knowing a sender's identity key can't decrypt messages they sent.
- Shared secrets go through **HKDF-SHA-256** to derive a unique **AES-256-GCM** key per message. The message is encrypted twice (once per party) so both sender and recipient can read their own history.
- On a new device, the identity private key is recovered by unwrapping a **PBKDF2**-encrypted copy stored in the user's profile — no new keypair, no lost history.
- Real-time delivery uses **Supabase Broadcast** (pub/sub) instead of Postgres replication — the sender writes the row, then broadcasts just the row ID so the recipient can re-fetch it. Typing indicators are pure broadcast, no DB row.

Full cryptographic details and threat model: [SECURITY.md](SECURITY.md)

---

## Features

- End-to-end encrypted messaging, per-message forward secrecy, multi-device key recovery
- Real-time delivery, typing indicators, read/delivered receipts
- Message deletion, user search, account settings + account deletion
- Dark mode (follows system theme), mobile responsive, rate limiting (30 msgs/min)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Crypto | WebCrypto (browser-native) |
| Backend | Supabase (Postgres, Auth, Realtime, Edge Functions) |
| Access control | Row Level Security (RLS) |
| Deployment | Vercel (frontend + cron), Supabase (backend), Docker (self-host) |
| Mobile | React Native WebView wrapper |

---

## Project structure

```
wakytalky/
├── frontend/
│   ├── src/                     # App source (App.jsx, components, lib/supabase.js)
│   ├── public/simpleCrypto.js   # ECDH + HKDF + AES-GCM crypto library
│   ├── api/keep-alive.js        # Vercel cron — pings Supabase to prevent free-tier pause
│   ├── Dockerfile / nginx.conf  # Self-host build
│   └── vite.config.js
├── mobile/                      # React Native WebView wrapper
├── supabase-schema.sql          # Full DB schema (tables, RLS, triggers, functions)
└── README.md
```

---

## Local development

**Prerequisites:** Node.js 18+, a Supabase project

```bash
git clone https://github.com/haaaddhiii/WakyTalky.git
cd WakyTalky/frontend
npm install
```

Create `frontend/.env`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Run `supabase-schema.sql` in the Supabase SQL Editor, then:

```bash
npm run dev
```

App runs at `http://localhost:3000`.

---

## Deployment

**Vercel (frontend)** — import `frontend/` as the root directory, set the two env vars above. `vercel.json` also wires up the daily Supabase keep-alive cron.

**Docker (self-host)** — build the `frontend/` directory; it compiles with Vite and serves via nginx.

**Mobile (Expo / Android)**

```bash
cd mobile
npm install
eas build --platform android --profile preview
```

Point the URL in `mobile/App.js` at your deployed frontend first.

---

## Known limitations

- **Partial forward secrecy** — a compromised recipient identity key still exposes messages sent *to* that recipient (no Double Ratchet)
- **No group chats** — 1:1 messaging only
- **No file sharing** — media upload isn't implemented
- **Metadata** — the server knows who you talk to, how often, and when

See [SECURITY.md](SECURITY.md) for the full threat model and disclosure policy.

---

## License

MIT
