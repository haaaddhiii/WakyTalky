# Security

## Threat model

WakyTalky protects message **confidentiality** against a passive or curious server. Supabase sees only ciphertext, IVs, ephemeral public keys, and metadata (sender, recipient, timestamps) — never plaintext.

**Protects against:**

- A compromised or malicious database — messages are unreadable without a private key
- Network interception — HTTPS everywhere, only ciphertext transits the wire
- Server-side breach — no plaintext is stored anywhere
- Sender-side key compromise — ephemeral keys mean a stolen sender identity key exposes nothing that sender sent

**Does NOT protect against:**

- **Compromised client device** — `localStorage` access exposes the private key and everything sent *to* that user
- **Recipient-side key compromise** — same mechanism, other direction (full fix needs Double Ratchet)
- **Metadata** — who talks to whom, and when, is visible to the server
- **Key authenticity** — no fingerprint/QR/safety-number verification, so a compromised server could MITM by substituting a public key
- **Endpoint security** — XSS, malware, or a rogue browser extension can read decrypted messages in memory

---

## Cryptographic design

- **Identity keys** — ECDH P-256, generated client-side via WebCrypto on registration. Public key → `profiles.identity_key`. Private key → `localStorage` (PKCS8), plus a PBKDF2-wrapped copy in `profiles.wrapped_private_key` for multi-device recovery.
- **Per-message keys** — a fresh ECDH P-256 keypair is generated for every message, used once, and never persisted (only the ephemeral public key is stored, in `messages.ephemeral_key`).
- **Dual ciphertext** — since the ephemeral private key is discarded, the sender derives two equal shared secrets by ECDH symmetry — `ECDH(ephemeral_priv, recipient_pub)` and `ECDH(sender_priv, ephemeral_pub)` — and encrypts the plaintext once for each, so both parties can read their own history.
- **Key derivation** — each shared secret goes through HKDF-SHA-256 (salt `"wakytalky-v3"`, info `"msg:{messageNumber}"`) to produce a unique AES-256-GCM key.
- **Encryption** — AES-256-GCM with a 12-byte random IV. Both ciphertexts, the IV, and the ephemeral public key are Base64-encoded and stored in Supabase.
- **Multi-device recovery** — the identity private key is wrapped with `PBKDF2-SHA256(password, salt, 250_000 iterations)` → AES-256-GCM, stored as `{ wrapped, wiv, salt }` in `profiles.wrapped_private_key`. Logging in on a new device with the correct password unwraps it — no new keypair, history stays readable.

---

## Authentication

- Supabase Auth (email + password); sessions stored in `localStorage`
- Password rules enforced client-side only: 8+ characters, uppercase, lowercase, digit

---

## Database security

Row Level Security is enabled on every table:

| Table | Read | Write |
|---|---|---|
| `messages` | Sender or recipient | Sender (insert); recipient (delivered/read update) |
| `profiles` | Everyone (needed for user search) | Owner only |
| `typing_indicators` | Sender or recipient | Legacy table — client no longer writes here; typing is now pure broadcast |

- **Soft delete** — a `SECURITY DEFINER` function (`delete_message`) lets only the sender delete their own messages, enforced in SQL regardless of client behavior.
- **Account deletion** — an Edge Function (`delete-account`) uses the service role key to call `auth.admin.deleteUser()`, requiring a valid JWT from the caller. Cascading foreign keys clean up messages and profile data.
- **Rate limiting** — a Postgres trigger rejects inserts once a user exceeds 30 messages in a 1-minute window.

---

## Known weaknesses

| Issue | Severity | Notes |
|---|---|---|
| Partial forward secrecy | Medium | Sender-side compromise exposes nothing; recipient-side compromise exposes messages sent to them. Needs Double Ratchet for full mitigation. |
| Private key in `localStorage` | High | Vulnerable to XSS. Mitigation would require non-extractable keys (IndexedDB, loses multi-device portability) or hardware-backed storage. |
| Wrapped key protected only by password | Medium | Anyone with both the wrapped-key blob and the account password can recover the identity key. 250k PBKDF2 rounds raise the offline brute-force cost. |
| No key fingerprint verification | Medium | No way to verify you're talking to who you think you are — a compromised server could MITM by swapping public keys. |
| Password validation client-only | Low | Supabase Auth's built-in minimum length is the only server-side check. |
| Metadata | Low | Timestamps and conversation partners are visible to Supabase. |

---

## Reporting a vulnerability

Report privately before disclosing publicly: open a private [GitHub Security Advisory](https://github.com/haaaddhiii/WakyTalky/security/advisories/new) or email the repository owner.

Include a description, reproduction steps, potential impact, and any suggested mitigations. Allow reasonable time for a fix before public disclosure.

---

## Scope

Covers the WakyTalky web frontend and its Supabase schema. The mobile app (React Native WebView wrapper) inherits the web frontend's security properties.
