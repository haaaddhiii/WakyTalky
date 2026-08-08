export default function SettingsModal({ currentUser, onClose, onDeleteAccount }) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Account</h2>
          <button className="settings-close" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-row">
            <div className="settings-label">Username</div>
            <div className="settings-value">{currentUser}</div>
          </div>
          <div className="settings-section-title">Encryption keys</div>
          <div className="settings-row">
            <div className="settings-label">Key recovery</div>
            <div className="settings-value settings-value-hint">
              Stored encrypted in your profile. Sign in on another device with your password to restore your keys.
            </div>
          </div>
          <div className="settings-danger-zone">
            <div className="settings-section-title danger">Danger zone</div>
            <button className="settings-delete-btn" onClick={onDeleteAccount}>
              Delete account
            </button>
            <p className="settings-delete-hint">
              Permanently deletes your account and all messages. This cannot be undone.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
