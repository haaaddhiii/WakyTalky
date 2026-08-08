export default function ConfirmDialog({ confirmDialog, onYes, onNo }) {
  if (!confirmDialog) return null;
  return (
    <div className="confirm-overlay" onClick={onNo}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-icon-wrap">
          {confirmDialog.destructive ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          )}
        </div>
        <h3 className="confirm-title">{confirmDialog.title}</h3>
        <p className="confirm-message">{confirmDialog.message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onNo}>Cancel</button>
          <button
            className={`confirm-ok ${confirmDialog.destructive ? 'confirm-ok-danger' : ''}`}
            onClick={onYes}
          >
            {confirmDialog.destructive ? 'Delete' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
