# Security

## Threat model

WakyTalky is designed to protect message **confidentiality** against a passive or curious server. The Supabase backend sees only ciphertext, IVs, ephemeral public keys, and metadata (sender ID, recipient ID, timestamps). It never sees plaintext.

### What this protects against

- A compromised or malicious database — messages are unreadable without the recipient's private key
- Network-level interception — all traffic is HTTPS; only ciphertext transits the wire
- Server-side data breach — no plaintext is stored anywhere on the server
- Sender-side key compromise — ephemeral ECDH keys mean knowing the sender's identity private key does not expose any past messages they sent

### What this does NOT protect against

- **Compromised client device** — if an attacker has access to your browser's `localStorage`, they can extract your private key and decrypt messages sent to you
- **Recipient-side key compromise** — messages sent *to* a user are encrypted with `ECDH(ephemeral_priv, recipient_pub)`. If the recipient's identity key is compromised, those messages can be decrypted. Full mitigation requires Double Ratchet (Signal Protocol)
- **Metadata** — the server knows who you talk to, how often, and when
- **Key authenticity** — there is no out-of-band key verification (no fingerprints, QR codes, or safety numbers). A compromised server could perform a MITM attack by substituting its own public key in a user's profile
- **Endpoint security** — XSS in the browser, malware on the device, or a rogue browser extension can all read decrypted messages in memory

---

## Cryptographic design

### Key generation

On registration, the browser's WebCrypto API generates an ECDH P-256 identity keypair:

```
keyPair = WebCrypto.generateKey({ name: 'ECDH', namedCurve: 'P-256' })
```

- Public key: exported as raw (65 bytes, uncompressed), stored in `profiles.identity_key` in Supabase
- Private key: exported as PKCS8, stored in `localStorage` as `wt_privkey_{userId}`
- Wrapped private key: PBKDF2-encrypted copy stored in `profiles.wrapped_private_key` for multi-device recovery (see below)

### Per-message ephemeral keys (forward secrecy)

For every message sent, a fresh ECDH P-256 keypair is generated and used only once:

```
ephemeral = WebCrypto.generateKey({ name: 'ECDH', namedCurve: 'P-256' })
```

The ephemeral private key is held in memory for the duration of the `encrypt()` call and never persisted. Only the ephemeral public key is stored in the database (`messages.ephemeral_key`).

### Dual-ciphertext scheme

Because the ephemeral private key is discarded, the sender must pre-encrypt a copy for their own history using ECDH symmetry:

```
// Recipient copy
ssRecipient = ECDH(ephemeral_priv, recipient_identity_pub)

// Sender copy — symmetric to ECDH(ephemeral_priv, sender_identity_pub)
ssSender = ECDH(sender_identity_priv, ephemeral_pub)
```

Both `ssRecipient` and `ssSender` are equal when the sender and recipient are in possession of their respective identity keys. Two separate AES-GCM ciphertexts are produced from the same plaintext and IV.

### Per-message AES key derivation (HKDF)

Each shared secret is passed through HKDF to produce a unique AES-256-GCM key:

```
aesKey = HKDF-SHA256(
  ikm  = sharedSecret,        // 256-bit ECDH output
  salt = "wakytalky-v3",
  info = "msg:{messageNumber}" // messageNumber = Date.now() at send time
)
```

The `messageNumber` is stored as a BIGINT column and used to re-derive the AES key on decryption.

### Encryption

```
iv         = 12 random bytes (WebCrypto.getRandomValues)
ciphertext = AES-256-GCM(aesKey, iv, plaintext)
```

Both `ciphertext` (recipient copy) and `encrypted_content_sender` (sender copy) are Base64-encoded and stored in Supabase alongside the `iv` and `ephemeral_key`.

### Multi-device key recovery

To allow key recovery on a new device without generating a new identity keypair:

```
salt       = 16 random bytes
wiv        = 12 random bytes
wrapKey    = PBKDF2-SHA256(password, salt, 250_000 iterations) → AES-256-GCM key
wrappedKey = AES-256-GCM(wrapKey, wiv, PKCS8(identityPrivateKey))
```

The `{ wrapped, wiv, salt }` bundle is JSON-serialised and stored in `profiles.wrapped_private_key`. On a new device, the user's login password is used to unwrap the original identity key — the public key in the profile remains unchanged and message history stays readable.

---

## Authentication

- Supabase Auth handles registration and login (email + password)
- Sessions are stored in `localStorage` via the Supabase JS client
- Password requirements enforced client-side: 8+ characters, uppercase, lowercase, digit

---

## Database security

### Row Level Security (RLS)

Every table has RLS enabled. Key policies:

| Table | Who can read | Who can write |
|---|---|---|
| `messages` | Only sender or recipient | Sender only (insert); recipient only (delivered/read update) |
| `profiles` | Everyone (needed for user search) | Only the profile owner |
| `typing_indicators` | Only sender or recipient | Only sender |

### Soft delete

Messages are deleted via a `SECURITY DEFINER` function (`delete_message`). Only the sender can soft-delete their own messages. The function enforces this in SQL, bypassing any client-side manipulation.

### Account deletion

A Supabase Edge Function (`delete-account`) uses the service role key to call `auth.admin.deleteUser()`. Cascading foreign keys remove all associated messages and profile data. The function requires a valid JWT from the authenticated user.

### Rate limiting

A Postgres trigger (`enforce_message_rate_limit`) rejects inserts if a user sends more than 30 messages within a 1-minute window.

---

## Known weaknesses

| Issue | Severity | Notes |
|---|---|---|
| Partial forward secrecy | Medium | Ephemeral keys protect the sender: compromising the sender's identity key exposes nothing. But messages sent *to* a user are still decryptable if the recipient's identity key is compromised. Full mitigation requires Double Ratchet. |
| Private key in `localStorage` | High | Susceptible to XSS. Mitigation: non-extractable keys in IndexedDB (loses multi-device portability) or hardware-backed key storage. |
| Wrapped key protected only by password | Medium | If an attacker obtains the `wrapped_private_key` blob and the account password (e.g., via phishing), they can recover the identity key. PBKDF2 at 250,000 rounds raises the offline brute-force cost significantly. |
| No key fingerprint verification | Medium | Users cannot verify they are talking to who they think they are. A compromised server can MITM by swapping public keys. |
| Password validation client-only | Low | Password complexity rules run only in the React client. Supabase Auth's built-in minimum length is the only server-side enforcement. |
| Metadata | Low | Message timestamps and conversation partners are visible to Supabase. |

---

## Reporting a vulnerability

If you find a security issue, please report it privately before disclosing publicly.

**Contact:** Open a private [GitHub Security Advisory](https://github.com/haaaddhiii/WakyTalky/security/advisories/new) or email the repository owner directly.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

Allow reasonable time for a fix before public disclosure.

---

## Scope

This security policy covers the WakyTalky web frontend and its Supabase schema. The mobile app (React Native WebView wrapper) inherits the security properties of the web frontend.
