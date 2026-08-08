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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                End-to-end encrypted
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
                        This message was deleted
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
                    {msg.timestamp?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' }) ?? ''}
                    {msg.from === currentUserId && !msg.deleted && (
                      <span className={`message-status${msg.read ? ' read' : ''}`}>
                        {msg.sending ? ' sending' : msg.read ? ' read' : msg.delivered ? ' delivered' : ' sent'}
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
                <span>{selectedContact.username} is typing</span>
                <span className="typing-dots">
                  <span>.</span><span>.</span><span>.</span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="message-input-container">
            <label className="file-upload-btn">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
              </svg>
              <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <input
              type="text"
              placeholder="Type a message..."
              value={messageInput}
              onChange={handleTyping}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </>
      ) : (
        <div className="no-chat-selected">
          <div className="auth-logo">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <rect width="56" height="56" rx="14" fill="var(--accent)"/>
              <path d="M28 16C22.48 16 18 20.48 18 26s4.48 10 10 10h5v-2h-5c-3.87 0-7.42-3.02-8-6.84C19.36 22.63 23.26 18 28 18c4.18 0 7.63 3.07 8 7.14.13 1.48-.15 2.88-.73 4.12l1.46 1.46A9.94 9.94 0 0038 26c0-5.52-4.48-10-10-10zm0 14v-4h-2v4h2z" fill="white" fillOpacity=".9"/>
            </svg>
          </div>
          <h2>WakyTalky</h2>
          <p>Select a contact or search for a user to start chatting</p>
          <div className="features">
            <div><span className="feature-icon">&#10003;</span> End-to-end encryption</div>
            <div><span className="feature-icon">&#10003;</span> Zero-knowledge architecture</div>
            <div><span className="feature-icon">&#10003;</span> Simple &amp; secure</div>
            <div><span className="feature-icon">&#10003;</span> Real-time messaging</div>
          </div>
        </div>
      )}
    </div>
  );
}
