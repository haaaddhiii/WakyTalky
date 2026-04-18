# WakyTalky

A real-time, end-to-end encrypted messaging app. Messages are encrypted on your device before they leave — the server stores only ciphertext and never sees plaintext.

**Live:** [wakytalky.vercel.app](https://wakytalky.vercel.app)

---

## How the encryption works

Every user generates an **ECDH P-256 keypair** when they register. The public key is stored in their profile; the private key never leaves their device (stored in `localStorage`).

### Sending a message

1. A fresh **ephemeral ECDH keypair** is generated for every message and discarded immediately after use
2. Two shared secrets are derived via ECDH symmetry:
   - Recipient copy: `ECDH(ephemeral_priv, recipient_pub)`
   - Sender copy: `ECDH(sender_identity_priv, ephemeral_pub)`  
     *(these are equal by ECDH symmetry, so neither side stores plaintext)*
3. Each shared secret is passed through **HKDF-SHA-256** with a per-message `info` tag to produce a unique AES-256-GCM key
4. The message is encrypted twice — once for the recipient, once for the sender — using a single random 12-byte IV
5. Both ciphertexts, the IV, and the ephemeral public key are stored in Supabase

### Receiving a message

- **Recipient:** `ECDH(recipient_priv, ephemeral_pub)` → HKDF → AES-GCM decrypt
- **Sender (own history):** `ECDH(sender_identity_priv, ephemeral_pub)` → HKDF → AES-GCM decrypt

Because the ephemeral private key is discarded at send time, compromising the sender's identity key does not expose past messages.

### Multi-device key recovery

At registration and on first login from a new device, the private key is wrapped with **PBKDF2-SHA-256** (250,000 iterations) using the account password and stored encrypted in the user's Supabase profile. On a new device, signing in with the correct password unwraps the original key — conversation history remains readable and no new keypair is generated.

---

## How real-time delivery works

New messages, read receipts, typing indicators, and deletions are pushed via **Supabase Broadcast** — a lightweight pub/sub layer that doesn't depend on Postgres logical replication.

1. Sender writes the encrypted row via REST (RLS gates the write)
2. Sender `httpSend()`s a tiny `{ id }` notification to the recipient's user channel (POST to `/realtime/v1/api/broadcast` — no WebSocket join required)
3. Recipient re-fetches the row via REST (RLS still gates the read) and updates the UI

The database is the source of truth; broadcasts carry only the row ID — never ciphertext. This avoids the free-tier failure mode where Realtime's Postgres connection pool saturates and `postgres_changes` subscriptions time out on tenant cold-start. Typing indicators are pure broadcast (no DB row) so they leave no server-side trace.

---

## Features

- End-to-end encrypted messaging (ECDH P-256 + HKDF + AES-256-GCM)
- Per-message forward secrecy via ephemeral ECDH keys
- Multi-device key recovery via PBKDF2-wrapped key storage
- Real-time delivery via Supabase Broadcast (no Postgres replication dependency)
- Message deletion (for everyone)
- Typing indicators
- Read/delivered receipts
- User search
- Account settings with account deletion
- Dark mode (follows system theme)
- Mobile responsive
- Rate limiting (30 messages/minute)

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Supabase JS client |
| Crypto | WebCrypto API (built-in browser) |
| Backend | Supabase (Postgres + Auth + Realtime + Edge Functions) |
| Access control | Row Level Security (RLS) |
| Deployment | Vercel (frontend), Supabase (backend) |
| Mobile | React Native + WebView wrapper |

---

## Project structure

```
wakytalky/
├── frontend/
│   ├── src/
│   │   ├── App.js          # All app logic and UI
│   │   ├── App.css
│   │   └── lib/
│   │       └── supabase.js # Supabase client (reads from .env)
│   └── public/
│       └── simpleCrypto.js # ECDH + HKDF + AES-GCM crypto library
├── mobile/                 # React Native WebView wrapper
│   └── App.js
├── supabase-schema.sql     # Full DB schema with RLS, triggers, functions
└── README.md
```

---

## Local development

**Prerequisites:** Node.js 18+, a Supabase project

1. Clone and install

```bash
git clone https://github.com/haaaddhiii/WakyTalky.git
cd WakyTalky/frontend
npm install
```

2. Create `frontend/.env`

```
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
CI=false
WDS_SOCKET_PORT=0
```

3. Set up the database — paste `supabase-schema.sql` into the Supabase SQL Editor and run it.

4. Start

```bash
npm start
```

App runs at `http://localhost:3000`.

---

## Deployment

### Frontend (Vercel)

1. Import the `frontend/` directory on [vercel.com](https://vercel.com)
2. Set environment variables:
   ```
   REACT_APP_SUPABASE_URL=https://your-project.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=your-anon-key
   CI=false
   ```
3. Set the root directory to `frontend`

### Mobile (Expo / Android)

```bash
cd mobile
npm install
eas build --platform android --profile preview
```

Update the URL in `mobile/App.js` to point to your deployed frontend.

---

## Known limitations

- **Partial forward secrecy** — Ephemeral keys protect against sender-side compromise: knowing the sender's identity key does not expose past messages. A compromised recipient identity key would still allow decryption of messages sent *to* that recipient, since the recipient copy is derived from the static recipient public key. Full Double Ratchet (Signal Protocol) is not implemented.
- **No group chats** — Only 1:1 messaging is supported.
- **No file sharing** — Media upload is not yet implemented.
- **Metadata** — The server knows who you talk to, how often, and when.

See [SECURITY.md](SECURITY.md) for a full threat model and disclosure policy.

---

## License

MIT
