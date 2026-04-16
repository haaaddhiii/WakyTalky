import React from 'react';
import './LandingPage.css';

/* ── Inline logo (matches App.js LogoSVG) ───────────────────────────────────── */
function LandingLogo({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="12" fill="var(--accent)"/>
      <path
        d="M22 12C16.48 12 12 16.48 12 22s4.48 10 10 10h5v-2h-5c-3.87 0-7.42-3.02-8-6.84C13.36 18.63 17.26 14 22 14c4.18 0 7.63 3.07 8 7.14.13 1.48-.15 2.88-.73 4.12l1.46 1.46A9.94 9.94 0 0032 22c0-5.52-4.48-10-10-10zm0 14v-4h-2v4h2z"
        fill="white"
        fillOpacity=".9"
      />
    </svg>
  );
}

/* ── Feature icons ──────────────────────────────────────────────────────────── */
const IconLock = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconForward = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="13 17 18 12 13 7"/>
    <polyline points="6 17 11 12 6 7"/>
  </svg>
);

const IconRealtime = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
  </svg>
);

const IconKey = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
  </svg>
);

const IconShield = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);

const IconMultiDevice = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
    <line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);

const IconDelete = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
  </svg>
);

const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
  </svg>
);

/* ── Avatar color map ─────────────────────────────────────────────────────────── */
const AVATAR_COLORS = ['#d4793a', '#5e87c8', '#56a87a', '#c85e8a', '#8a6ec8'];

/* ═══════════════════════════════════════════════════════════════════════════════
   Landing Page Component
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function LandingPage({ isLoggedIn = false, onOpenChat, onGetStarted, onSignIn }) {

  /* ── Chat Mockup ─────────────────────────────────────────────────────────── */
  const MockChat = () => (
    <div className="lp-mockup-wrap">
      <div className="lp-mockup">
        {/* Sidebar */}
        <div className="lp-mock-sidebar">
          <div className="lp-mock-sidebar-header">
            <div className="lp-mock-wt-label">WakyTalky</div>
          </div>
          {[
            { name: 'Alex', preview: 'See you then!', color: AVATAR_COLORS[1], active: false },
            { name: 'Jordan', preview: '🔒 Encrypted', color: AVATAR_COLORS[0], active: true },
            { name: 'Sam', preview: 'Thanks!', color: AVATAR_COLORS[2], active: false },
          ].map((c) => (
            <div key={c.name} className={`lp-mock-contact${c.active ? ' active' : ''}`}>
              <div className="lp-mock-avatar" style={{ background: c.color }}>
                {c.name[0]}
              </div>
              <div className="lp-mock-contact-info">
                <div className="lp-mock-contact-name">{c.name}</div>
                <div className={`lp-mock-contact-preview${c.preview.startsWith('🔒') ? ' enc' : ''}`}>
                  {c.preview}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Chat pane */}
        <div className="lp-mock-chat">
          <div className="lp-mock-chat-header">
            <div className="lp-mock-avatar" style={{ background: AVATAR_COLORS[0], width: 32, height: 32, fontSize: 13 }}>
              J
            </div>
            <div className="lp-mock-chat-title">Jordan</div>
            <div className="lp-mock-enc-badge">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Encrypted
            </div>
          </div>

          <div className="lp-mock-messages">
            <div className="lp-mock-msg recv">
              Hey! Can we chat privately? 👋
              <div className="lp-mock-msg-time">10:14</div>
            </div>
            <div className="lp-mock-msg sent">
              Sure — this is end-to-end encrypted, no one else can read this
              <div className="lp-mock-msg-time">10:14</div>
            </div>
            <div className="lp-mock-msg recv">
              Love that. Not even the server? 🔐
              <div className="lp-mock-msg-time">10:15</div>
            </div>
            <div className="lp-mock-msg sent">
              Correct. Keys never leave your device.
              <div className="lp-mock-msg-time">10:15</div>
            </div>
            <div className="lp-mock-msg recv">
              This is exactly what I needed ✨
              <div className="lp-mock-msg-time">10:16</div>
            </div>
          </div>

          <div className="lp-mock-input-row">
            <div className="lp-mock-input">Message Jordan…</div>
            <div className="lp-mock-send"><IconSend /></div>
          </div>
        </div>
      </div>

      {/* Floating lock badge */}
      <div className="lp-mockup-lock">
        <IconShield />
        Messages encrypted on your device
      </div>
    </div>
  );

  return (
    <div className="lp">

      {/* ══ Nav ══════════════════════════════════════════════════════════════ */}
      <nav className="lp-nav">
        <div className="lp-nav-brand">
          <LandingLogo size={28} />
          WakyTalky
        </div>
        <div className="lp-nav-actions">
          {isLoggedIn ? (
            <button className="lp-btn-primary" onClick={onOpenChat}>Open App</button>
          ) : (
            <>
              <button className="lp-btn-ghost" onClick={onSignIn}>Sign in</button>
              <button className="lp-btn-primary" onClick={onGetStarted}>Get started</button>
            </>
          )}
        </div>
      </nav>

      {/* ══ Hero ═════════════════════════════════════════════════════════════ */}
      <section className="lp-hero">
        <div className="lp-orb lp-orb-a" />
        <div className="lp-orb lp-orb-b" />
        <div className="lp-orb lp-orb-c" />

        <div className="lp-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          End-to-end encrypted
        </div>

        <h1 className="lp-headline">
          Private by<br /><em>design.</em>
        </h1>

        <p className="lp-sub">
          Messages are encrypted on your device before they leave.
          The server stores only ciphertext — it never sees your words.
        </p>

        <div className="lp-hero-ctas">
          {isLoggedIn ? (
            <button className="lp-btn-cta" onClick={onOpenChat}>
              Open App
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </button>
          ) : (
            <>
              <button className="lp-btn-cta" onClick={onGetStarted}>
                Start messaging free
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
              <button className="lp-btn-outline" onClick={onSignIn}>
                Sign in
              </button>
            </>
          )}
        </div>

        <MockChat />
      </section>

      {/* ══ Features ═════════════════════════════════════════════════════════ */}
      <section className="lp-features">
        <div className="lp-features-inner">
          <div className="lp-features-header">
            <div className="lp-section-tag">Built different</div>
            <h2 className="lp-section-heading">Privacy isn't a setting.<br />It's the default.</h2>
          </div>

          <div className="lp-features-grid">
            {[
              {
                icon: <IconLock />,
                title: 'Zero-knowledge server',
                desc: 'Supabase stores only ciphertext, IVs, and ephemeral public keys. Your plaintext never transits the server — not even transiently.',
              },
              {
                icon: <IconForward />,
                title: 'Per-message forward secrecy',
                desc: 'A fresh ECDH keypair is generated for every message and discarded immediately. Past messages stay safe even if your identity key is later compromised.',
              },
              {
                icon: <IconRealtime />,
                title: 'Real-time delivery',
                desc: 'Messages arrive instantly via Supabase Realtime. Delivered and read receipts, plus live typing indicators — all with end-to-end encryption.',
              },
              {
                icon: <IconKey />,
                title: 'Multi-device key recovery',
                desc: 'Your private key is wrapped with PBKDF2 (250,000 rounds) and stored encrypted in your profile. Sign in on a new device with your password to recover your full history.',
              },
              {
                icon: <IconMultiDevice />,
                title: 'Works everywhere',
                desc: 'A polished web app that adapts to any screen size. An Android app wraps the same experience natively. Your conversations follow you.',
              },
              {
                icon: <IconDelete />,
                title: 'Delete for everyone',
                desc: 'Changed your mind? Delete any message you sent and it disappears from both sides — enforced in the database with Row Level Security.',
              },
            ].map((f) => (
              <div key={f.title} className="lp-feature-card">
                <div className="lp-feature-icon">{f.icon}</div>
                <div className="lp-feature-title">{f.title}</div>
                <div className="lp-feature-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ Security section ═════════════════════════════════════════════════ */}
      <section className="lp-security">
        <div className="lp-security-inner">
          <div className="lp-security-text">
            <div className="lp-section-tag">Cryptographic design</div>
            <h2 className="lp-section-heading">Mathematics you can trust.</h2>
            <p className="lp-section-sub">
              No proprietary crypto. No trust-us claims. WakyTalky uses
              well-audited primitives from the browser's built-in WebCrypto API —
              the same engine that powers HTTPS.
            </p>
          </div>

          <div className="lp-security-cards">
            {[
              {
                title: 'ECDH P-256',
                desc: 'Elliptic-curve Diffie-Hellman key exchange. Shared secrets are computed client-side and never sent to the server.',
              },
              {
                title: 'HKDF-SHA-256',
                desc: 'Every message gets a unique AES key derived from its shared secret and a per-message info tag.',
              },
              {
                title: 'AES-256-GCM',
                desc: 'Industry-standard authenticated encryption. A fresh 12-byte IV is generated for every message.',
              },
              {
                title: 'PBKDF2 · 250k rounds',
                desc: 'Your identity private key is wrapped with a password-derived key. Stored encrypted in your profile for safe multi-device recovery.',
              },
            ].map((c) => (
              <div key={c.title} className="lp-security-card">
                <div className="lp-security-card-icon">
                  <IconShield />
                </div>
                <div>
                  <div className="lp-security-card-title">{c.title}</div>
                  <div className="lp-security-card-desc">{c.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA banner ═══════════════════════════════════════════════════════ */}
      <section className="lp-cta-banner">
        <div className="lp-cta-banner-inner">
          <h2>Ready to message privately?</h2>
          <p>Create an account in seconds. No phone number required.</p>
          <div className="lp-cta-banner-btns">
            {isLoggedIn ? (
              <button className="lp-btn-cta" onClick={onOpenChat}>
                Open App
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                </svg>
              </button>
            ) : (
              <>
                <button className="lp-btn-cta" onClick={onGetStarted}>
                  Create free account
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                  </svg>
                </button>
                <button className="lp-btn-outline" onClick={onSignIn}>Sign in instead</button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ══ Footer ═══════════════════════════════════════════════════════════ */}
      <footer className="lp-footer">
        <div className="lp-footer-brand">
          <LandingLogo size={20} />
          WakyTalky
        </div>
        <div className="lp-footer-note">
          Open source · MIT License
        </div>
        <div className="lp-footer-links">
          <a
            className="lp-footer-link"
            href="https://github.com/haaaddhiii/WakyTalky"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          {isLoggedIn ? (
            <span className="lp-footer-link" onClick={onOpenChat}>Open App</span>
          ) : (
            <>
              <span className="lp-footer-link" onClick={onSignIn}>Sign in</span>
              <span className="lp-footer-link" onClick={onGetStarted}>Get started</span>
            </>
          )}
        </div>
      </footer>

    </div>
  );
}
