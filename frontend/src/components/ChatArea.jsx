import Logo from './Logo';

export default function ChatArea({
  selectedContact, onBack, messages, currentUserId,
  messagesContainerRef, messagesEndRef, otherUserTyping,
  handleDeleteMessage, messageInput, handleTyping, sendMessage, handleFileUpload
}) {
  return (
    <div className={`chat-area ${!selectedContact ? 'show-sidebar' : ''}`}>
      {selectedContact ? (
        <>
          <div className="chat-header">
            <button className="back-button" onClick={onBack}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <div className="contact-avatar">
              {(selectedContact.username?.[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <div className="contact-name">{selectedContact.username}</div>
              <div className="encryption-status">
                <span className="live-dot" />
                Scrambled &middot; secure link
              </div>
            </div>
          </div>

          <div className="messages-container" ref={messagesContainerRef}>
            {messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`message-wrapper ${msg.from === currentUserId ? 'sent-wrapper' : 'received-wrapper'}`}
              >
                <div
                  className={`message ${msg.from === currentUserId ? 'sent' : 'received'} ${msg.sending ? 'sending' : ''} ${!msg.read && msg.from !== currentUserId ? 'unread' : ''}`}
                >
                  <div className={`message-content ${msg.deleted ? 'deleted-msg' : ''}`}>
                    {msg.deleted ? (
                      <span className="deleted-text">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5, verticalAlign: 'middle' }}>
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                        </svg>
                        Transmission deleted
                      </span>
                    ) : (
                      <>
                        {msg.text}
                        {msg.mediaType && (
                          <div className="media-indicator">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4, verticalAlign: 'middle' }}>
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                            </svg>
                            {msg.mediaType.includes('image') ? 'Image' : 'File'}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="message-time">
                    {msg.timestamp?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit', hour12: false }) ?? ''}
                    {msg.from === currentUserId && !msg.deleted && (
                      <span className={`message-status${msg.read ? ' read' : ''}`}>
                        {msg.sending ? ' TX…' : msg.read ? ' READ' : msg.delivered ? ' RCVD' : ' SENT'}
                      </span>
                    )}
                  </div>
                </div>
                {msg.from === currentUserId && !msg.deleted && !msg.sending && (
                  <button
                    className="message-delete-btn"
                    onClick={() => handleDeleteMessage(msg.id)}
                    title="Delete message"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
            {otherUserTyping && (
              <div className="typing-indicator">
                <span>{selectedContact.username} transmitting</span>
                <span className="typing-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="message-input-container">
            <label className="file-upload-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
              <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <input
              type="text"
              placeholder="Type message…"
              value={messageInput}
              onChange={handleTyping}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button className="ptt-send-btn" onClick={sendMessage}>Send</button>
          </div>
        </>
      ) : (
        <div className="no-chat-selected">
          <div className="auth-logo"><Logo size={56} /></div>
          <h2>WakyTalky</h2>
          <p>No channel selected — search a callsign to open a secure line</p>
          <div className="features">
            <div><span className="feature-icon">[X]</span> End&#8209;to&#8209;end encryption</div>
            <div><span className="feature-icon">[X]</span> Zero&#8209;knowledge relay</div>
            <div><span className="feature-icon">[X]</span> Simple &amp; secure</div>
            <div><span className="feature-icon">[X]</span> Real&#8209;time delivery</div>
          </div>
        </div>
      )}
    </div>
  );
}
