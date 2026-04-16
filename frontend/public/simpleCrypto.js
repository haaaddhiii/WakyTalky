// WakyTalky E2EE v3
//
// FORWARD SECRECY — per-message ephemeral ECDH keys
//   encrypt() generates a fresh ephemeral keypair for every message.
//   The ephemeral private key is discarded immediately after the call returns.
//   Two ciphertexts are produced:
//     • ciphertext        — for the recipient:  ECDH(ephemeral_priv, recipient_pub)  → HKDF → AES
//     • ciphertextSender  — for the sender:     ECDH(sender_priv, ephemeral_pub)     → HKDF → AES
//   ECDH symmetry: ECDH(E_priv, S_pub) = ECDH(S_priv, E_pub), so both sides compute the
//   same shared secret without extra key material.
//
// MULTI-DEVICE — password-wrapped key storage
//   wrapPrivateKey(privateKey, password) encrypts the PKCS8 private key with
//   AES-256-GCM using a key derived from PBKDF2(password, randomSalt, 250_000 rounds).
//   The ciphertext is safe to store in the Supabase profile.
//   Any device can call unwrapPrivateKey(..., password) at login to recover the key.

class SimpleCrypto {
  // ── Key generation & serialisation ──────────────────────────────────────

  async generateKeyPair() {
    return crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
  }

  async exportPublicKey(publicKey) {
    const raw = await crypto.subtle.exportKey('raw', publicKey);
    return this._b64(raw);
  }

  async exportPrivateKey(privateKey) {
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
    return this._b64(pkcs8);
  }

  async importPublicKey(b64) {
    return crypto.subtle.importKey(
      'raw', this._buf(b64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false, []
    );
  }

  async importPrivateKey(b64) {
    return crypto.subtle.importKey(
      'pkcs8', this._buf(b64),
      { name: 'ECDH', namedCurve: 'P-256' },
      false, ['deriveBits']
    );
  }

  // ── Core ECDH + HKDF primitives ──────────────────────────────────────────

  async _ecdh(myPriv, theirPub) {
    return crypto.subtle.deriveBits({ name: 'ECDH', public: theirPub }, myPriv, 256);
  }

  async _hkdfAESKey(sharedBits, messageNumber) {
    const km = await crypto.subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
    const enc = new TextEncoder();
    return crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: enc.encode('wakytalky-v3'),
        info: enc.encode(`msg:${messageNumber}`)
      },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ── Encryption ───────────────────────────────────────────────────────────
  // Returns { ciphertext, ciphertextSender, iv, ephemeralPublicKey } — all base64.

  async encrypt(message, senderIdentityPrivate, recipientPublicKeyB64, messageNumber) {
    // Fresh ephemeral pair — private key never persisted
    const ephemeral = await this.generateKeyPair();
    const ePubB64 = await this.exportPublicKey(ephemeral.publicKey);
    const ePubKey = await this.importPublicKey(ePubB64); // re-import as non-extractable

    const recipientPub = await this.importPublicKey(recipientPublicKeyB64);

    // Recipient: ECDH(E_priv, R_pub)
    const ssRecv = await this._ecdh(ephemeral.privateKey, recipientPub);
    // Sender copy: ECDH(S_priv, E_pub)  [= ECDH(E_priv, S_pub) by symmetry]
    const ssSend = await this._ecdh(senderIdentityPrivate, ePubKey);

    const [kRecv, kSend] = await Promise.all([
      this._hkdfAESKey(ssRecv, messageNumber),
      this._hkdfAESKey(ssSend, messageNumber)
    ]);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const msg = new TextEncoder().encode(message);

    const [encRecv, encSend] = await Promise.all([
      crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kRecv, msg),
      crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kSend, msg)
    ]);

    return {
      ciphertext: this._b64(encRecv),
      ciphertextSender: this._b64(encSend),
      iv: this._b64(iv),
      ephemeralPublicKey: ePubB64
    };
  }

  // ── Decryption ───────────────────────────────────────────────────────────

  async decryptForRecipient(ciphertext, iv, recipientPrivate, ephemeralPubB64, messageNumber) {
    const ePub = await this.importPublicKey(ephemeralPubB64);
    const ss = await this._ecdh(recipientPrivate, ePub);
    const k = await this._hkdfAESKey(ss, messageNumber);
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this._buf(iv) }, k, this._buf(ciphertext)
    );
    return new TextDecoder().decode(dec);
  }

  async decryptSenderCopy(ciphertextSender, iv, senderPrivate, ephemeralPubB64, messageNumber) {
    const ePub = await this.importPublicKey(ephemeralPubB64);
    const ss = await this._ecdh(senderPrivate, ePub);
    const k = await this._hkdfAESKey(ss, messageNumber);
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this._buf(iv) }, k, this._buf(ciphertextSender)
    );
    return new TextDecoder().decode(dec);
  }

  // ── Key wrapping (multi-device) ──────────────────────────────────────────
  // Encrypts the ECDH private key with a password-derived AES key.
  // The result is safe to store in the Supabase profile.

  async wrapPrivateKey(privateKey, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wiv  = crypto.getRandomValues(new Uint8Array(12));
    const wk   = await this._pbkdf2Key(password, salt);
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey);
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, wk, pkcs8);
    return {
      wrapped: this._b64(wrapped),
      wiv:     this._b64(wiv),
      salt:    this._b64(salt)
    };
  }

  // Returns an extractable CryptoKey so the caller can re-export it to localStorage.
  async unwrapPrivateKey(wrappedB64, wivB64, saltB64, password) {
    const wk  = await this._pbkdf2Key(password, this._buf(saltB64));
    const pkcs8 = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this._buf(wivB64) },
      wk,
      this._buf(wrappedB64)
    );
    return crypto.subtle.importKey(
      'pkcs8', pkcs8,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,          // extractable — caller saves raw bytes to localStorage
      ['deriveBits']
    );
  }

  async _pbkdf2Key(password, salt) {
    const raw = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password),
      'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 250_000, hash: 'SHA-256' },
      raw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ── Utilities ────────────────────────────────────────────────────────────

  _b64(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  _buf(b64) {
    const s = atob(b64);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b.buffer;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SimpleCrypto;
} else if (typeof window !== 'undefined') {
  window.SimpleCrypto = SimpleCrypto;
}
