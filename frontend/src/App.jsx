import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import { supabase } from './lib/supabase';
import LandingPage from './LandingPage';
import Toast from './components/Toast';
import ConfirmDialog from './components/ConfirmDialog';
import LoginView from './components/LoginView';
import RegisterView from './components/RegisterView';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';

const SimpleCrypto = window.SimpleCrypto;

// ─── URL ↔ view mapping ────────────────────────────────────────────────────
const VIEW_TO_PATH = { landing: '/', login: '/login', register: '/register', chat: '/chat' };
const PATH_TO_VIEW = { '/': 'landing', '/login': 'login', '/register': 'register', '/chat': 'chat' };

// Every key-recovery decision below hinges on being able to read the profile
// row. A single transient network blip here used to hard-stop straight into
// "sign out and sign back in" — retry once before treating it as a real
// failure. This does NOT change behavior for genuine mismatches (those are a
// deliberate security stop, not a network problem).
// Supabase Auth requires an email on every account. We collect only a
// username, so we derive a non-routable internal address from it — this
// never leaves the client and is never used to send mail.
function usernameToAuthEmail(username) {
  return `${username.trim().toLowerCase()}@wakytalky.local`;
}

async function fetchProfileWithRetry(userId, columns) {
  const attempt = () => supabase.from('profiles').select(columns).eq('id', userId).single();
  let result = await attempt();
  if (result.error) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    result = await attempt();
  }
  return result;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // ─── Auth state ───────────────────────────────────────────────────────────
  const [currentView, setCurrentView] = useState(() => {
    // Set initial view from URL path so deep links work on first render.
    // '/chat' is treated as 'landing' here; the auth listener promotes it once
    // the session is confirmed.
    return PATH_TO_VIEW[window.location.pathname] === 'chat'
      ? 'landing'
      : (PATH_TO_VIEW[window.location.pathname] || 'landing');
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // ─── Chat state ───────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [otherUserTyping, setOtherUserTyping] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // ─── UI overlays ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState(null);           // { message, type: 'error'|'success'|'info' }
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, destructive }
  const confirmResolveRef = useRef(null);
  const toastTimerRef = useRef(null);

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const cryptoRef = useRef(null);
  const privateKeyRef = useRef(null);
  const publicKeyCache = useRef(new Map());
  const typingTimeoutRef = useRef(null);
  const otherTypingTimeoutRef = useRef(null);
  const typingActiveRef = useRef(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedContactRef = useRef(null);
  const messagesChannelRef = useRef(null);
  const currentUserIdRef = useRef(null);
  const forceScrollRef = useRef(false);
  const realtimeRetryRef = useRef(null);

  // ─── Toast & Confirm helpers ──────────────────────────────────────────────

  const showToast = useCallback((message, type = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const showConfirm = useCallback((message, { title = 'Are you sure?', destructive = false } = {}) => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmDialog({ title, message, destructive });
    });
  }, []);

  const handleConfirmYes = () => {
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setConfirmDialog(null);
  };

  const handleConfirmNo = () => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setConfirmDialog(null);
  };

  // ─── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    cryptoRef.current = new SimpleCrypto();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) {
      setDarkMode(saved === 'true');
    } else if (window.matchMedia) {
      setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }, []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (localStorage.getItem('darkMode') === null) setDarkMode(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Sync currentView → URL
  useEffect(() => {
    const path = VIEW_TO_PATH[currentView] || '/';
    if (location.pathname !== path) {
      navigate(path, { replace: currentView === 'landing' || currentView === 'chat' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView]);

  // Auth listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'INITIAL_SESSION' && session) {
        // Page loaded with an existing session.
        // If the user navigated directly to /chat, honour that and skip the landing page.
        // Otherwise stay on the landing page and let them click "Open App".
        const userId = session.user.id;
        const usernameVal = session.user.user_metadata?.username;
        setToken(session.access_token);
        setCurrentUser(usernameVal);
        setCurrentUserId(userId);
        if (window.location.pathname === '/chat') {
          setCurrentView('chat');
        }
        // otherwise currentView stays 'landing'
      } else if (event === 'SIGNED_IN' && session) {
        // Keep user state in sync (handles token refresh too).
        // Navigation to chat is driven explicitly by handleLogin / handleRegister,
        // so we never redirect here — that would yank the user off the landing page
        // when Supabase silently refreshes an expired access token.
        const userId = session.user.id;
        const usernameVal = session.user.user_metadata?.username;
        setToken(session.access_token);
        setCurrentUser(usernameVal);
        setCurrentUserId(userId);
      } else if (event === 'INITIAL_SESSION' && !session) {
        setCurrentView('landing');
      } else if (event === 'SIGNED_OUT') {
        setToken(null);
        setCurrentUser(null);
        setCurrentUserId(null);
        privateKeyRef.current = null;
        publicKeyCache.current.clear();
        setCurrentView('landing');
        setContacts([]);
        setSelectedContact(null);
        setMessages([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Initialize crypto keys whenever userId is set
  useEffect(() => {
    if (!currentUserId || !cryptoRef.current) return;

    const initKeys = async () => {
      const savedPriv = localStorage.getItem(`wt_privkey_${currentUserId}`);
      const savedPub  = localStorage.getItem(`wt_pubkey_${currentUserId}`);

      // Always fetch the remote profile first so we can compare local vs remote keys
      // before doing anything destructive.
      const { data: profile, error: profileError } = await fetchProfileWithRetry(
        currentUserId, 'identity_key, wrapped_private_key'
      );

      // If we couldn't read the profile (network flake, RLS error, etc.) we must
      // NOT fall through to any branch that writes identity_key or generates a
      // new keypair — doing so on a transient failure would permanently destroy
      // message history.
      if (profileError || !profile) {
        console.error('Failed to load profile during key init:', profileError);
        if (savedPriv && savedPub && !privateKeyRef.current) {
          // At least make the existing local keys usable for this session.
          try {
            privateKeyRef.current = await cryptoRef.current.importPrivateKey(savedPriv);
            publicKeyCache.current.set(currentUserId, savedPub);
          } catch (importErr) {
            console.error('Failed to import local private key:', importErr);
          }
        }
        showToast('Could not reach server to verify keys. Some features may be limited.', 'error');
        return;
      }

      const remoteKey = profile.identity_key;
      const remoteKeyIsReal = remoteKey && remoteKey !== 'dummy';

      if (savedPriv && savedPub) {
        if (!privateKeyRef.current) {
          privateKeyRef.current = await cryptoRef.current.importPrivateKey(savedPriv);
          publicKeyCache.current.set(currentUserId, savedPub);
        }
        // Only write identity_key to the DB if it is missing or a placeholder.
        // Overwriting a real remote key with a stale/mismatched local copy would
        // permanently break decryption of every past message.
        if (!remoteKeyIsReal) {
          await supabase.from('profiles').update({ identity_key: savedPub }).eq('id', currentUserId);
        } else if (remoteKey !== savedPub) {
          // Local pubkey disagrees with what the server has.  Trust the server and
          // refuse to decrypt with the local copy — the user must re-authenticate to
          // unwrap the real key.
          console.warn('Local public key does not match profile identity_key; clearing local keys.');
          localStorage.removeItem(`wt_privkey_${currentUserId}`);
          localStorage.removeItem(`wt_pubkey_${currentUserId}`);
          privateKeyRef.current = null;
          showToast(
            'Encryption keys on this device do not match your account. Sign out and sign back in to restore them.',
            'error'
          );
        }
        loadRecentContacts(currentUserId);
      } else if (profile?.wrapped_private_key) {
        // Wrapped key exists on the server but we have nothing locally. Unwrapping
        // needs the login password, which we don't have here.
        showToast(
          'Encryption keys not found locally. Sign out and sign back in to restore them.',
          'info'
        );
        loadRecentContacts(currentUserId);
      } else if (remoteKeyIsReal) {
        // Server has an identity_key but no wrapped private key. Generating a fresh
        // pair here would silently replace it and lock the user out of their own
        // history. Stop and surface the problem instead.
        console.error('Profile has identity_key but no wrapped_private_key; refusing to overwrite.');
        showToast(
          'Encryption keys cannot be restored on this device. Sign out and sign back in with your password.',
          'error'
        );
        loadRecentContacts(currentUserId);
      } else {
        // Truly fresh account — no remote key, no wrapped key. Safe to generate.
        const keyPair = await cryptoRef.current.generateKeyPair();
        const pub  = await cryptoRef.current.exportPublicKey(keyPair.publicKey);
        const priv = await cryptoRef.current.exportPrivateKey(keyPair.privateKey);
        localStorage.setItem(`wt_privkey_${currentUserId}`, priv);
        localStorage.setItem(`wt_pubkey_${currentUserId}`, pub);
        privateKeyRef.current = keyPair.privateKey;
        publicKeyCache.current.set(currentUserId, pub);
        await supabase.from('profiles').update({ identity_key: pub }).eq('id', currentUserId);
      }
    };

    initKeys().catch(err => console.error('Key init failed:', err));
  // loadRecentContacts and showToast are stable useCallback refs — adding them
  // as deps would re-run this initialiser on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // Scroll on new messages
  useEffect(() => {
    if (!messagesEndRef.current || !messagesContainerRef.current) return;
    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      messagesEndRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
      return;
    }
    const container = messagesContainerRef.current;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  // Persist contacts
  useEffect(() => {
    if (currentUser && contacts.length > 0) {
      localStorage.setItem(`contacts_${currentUser}`, JSON.stringify(contacts));
    }
  }, [contacts, currentUser]);

  useEffect(() => {
    if (currentUser) {
      const saved = localStorage.getItem(`contacts_${currentUser}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setContacts(parsed.map(c => ({ ...c, unread: 0 })));
        } catch { setContacts([]); }
      }
    } else {
      setContacts([]);
    }
  }, [currentUser]);

  useEffect(() => {
    const prev = selectedContactRef.current;
    selectedContactRef.current = selectedContact;
    // When the active conversation changes, clear any "typing" we left on the
    // previous recipient so they don't see a stale indicator hanging around
    // until their client-side 3s timeout lapses.
    if (prev && prev.id !== selectedContact?.id && typingActiveRef.current) {
      typingActiveRef.current = false;
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (currentUserIdRef.current) {
        // Broadcast stop-typing directly (notify() isn't in scope here yet).
        try {
          supabase.channel(`user-${prev.id}`)
            .httpSend('typing', { from: currentUserIdRef.current, is_typing: false })
            .catch(() => {});
        } catch {}
      }
    }
  }, [selectedContact]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  useEffect(() => {
    return () => {
      if (realtimeRetryRef.current) clearTimeout(realtimeRetryRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
      messagesChannelRef.current?.unsubscribe();
    };
  }, []);

  // ─── Recent contacts sync (cross-device) ─────────────────────────────────
  // Fetches the most recent message per conversation from the database so the
  // sidebar is populated on any device, not just where localStorage has data.

  const loadRecentContacts = useCallback(async (userId) => {
    if (!userId || !cryptoRef.current) return;
    try {
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('id, sender_id, recipient_id, encrypted_content, encrypted_content_sender, iv, ephemeral_key, message_number, created_at, deleted_at')
        .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!recentMessages?.length) return;

      // Keep only the most recent message per conversation partner
      const contactMap = new Map();
      for (const msg of recentMessages) {
        const contactId = msg.sender_id === userId ? msg.recipient_id : msg.sender_id;
        if (!contactMap.has(contactId)) contactMap.set(contactId, msg);
      }

      const contactIds = [...contactMap.keys()];

      // Batch-fetch profiles and unread counts in parallel
      const [{ data: profiles }, { data: unreadRows }] = await Promise.all([
        supabase.from('profiles').select('id, username, identity_key').in('id', contactIds),
        supabase.from('messages').select('sender_id').eq('recipient_id', userId).eq('read', false).is('deleted_at', null)
      ]);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));
      const unreadCounts = {};
      for (const row of (unreadRows || [])) {
        unreadCounts[row.sender_id] = (unreadCounts[row.sender_id] || 0) + 1;
      }

      const freshContacts = [];
      for (const [contactId, msg] of contactMap) {
        const profile = profileMap.get(contactId);
        if (!profile) continue;

        if (profile.identity_key && profile.identity_key !== 'dummy') {
          publicKeyCache.current.set(contactId, profile.identity_key);
        }

        let lastMessage = '';
        if (msg.deleted_at) {
          lastMessage = 'This message was deleted';
        } else if (privateKeyRef.current && msg.ephemeral_key) {
          try {
            if (msg.sender_id === userId) {
              lastMessage = await cryptoRef.current.decryptSenderCopy(
                msg.encrypted_content_sender, msg.iv, privateKeyRef.current,
                msg.ephemeral_key, msg.message_number
              );
            } else {
              lastMessage = await cryptoRef.current.decryptForRecipient(
                msg.encrypted_content, msg.iv, privateKeyRef.current,
                msg.ephemeral_key, msg.message_number
              );
            }
          } catch { lastMessage = ''; }
        }

        freshContacts.push({
          id: contactId,
          username: profile.username,
          identity_key: profile.identity_key,
          lastMessage,
          lastMessageTime: new Date(msg.created_at),
          unread: unreadCounts[contactId] || 0
        });
      }

      if (freshContacts.length > 0) setContacts(freshContacts);
    } catch (err) {
      console.error('Failed to load recent contacts:', err);
    }
  }, []);

  // ─── Crypto helpers ───────────────────────────────────────────────────────

  const getPublicKey = useCallback(async (userId) => {
    if (publicKeyCache.current.has(userId)) {
      return publicKeyCache.current.get(userId);
    }
    try {
      const { data } = await supabase
        .from('profiles')
        .select('identity_key')
        .eq('id', userId)
        .single();
      const key = data?.identity_key;
      if (key && key !== 'dummy') {
        publicKeyCache.current.set(userId, key);
        return key;
      }
    } catch (err) {
      console.error('Failed to fetch public key for', userId, err);
    }
    return null;
  }, []);

  // ─── Realtime ─────────────────────────────────────────────────────────────

  const handleNewMessage = useCallback(async (msg, senderId, isCurrentChat) => {
    try {
      if (!privateKeyRef.current) {
        console.warn('Cannot decrypt incoming message: private key not loaded');
        return;
      }

      let plaintext;
      if (msg.ephemeral_key) {
        plaintext = await cryptoRef.current.decryptForRecipient(
          msg.encrypted_content,
          msg.iv,
          privateKeyRef.current,
          msg.ephemeral_key,
          msg.message_number
        );
      } else {
        plaintext = '[Legacy message — cannot decrypt]';
      }

      const newMessage = {
        id: msg.id,
        from: senderId,
        text: plaintext,
        timestamp: new Date(msg.created_at),
        mediaType: msg.media_type,
        mediaUrl: msg.media_url,
        read: false,
        deleted: !!msg.deleted_at
      };

      if (isCurrentChat) {
        setMessages(prev => {
          if (prev.some(m => m.id === newMessage.id)) return prev;
          return [...prev, newMessage];
        });
      }

      setContacts(prev => {
        const exists = prev.find(c => c.id === senderId);
        if (exists) {
          return prev.map(contact =>
            contact.id === senderId
              ? {
                  ...contact,
                  lastMessage: plaintext,
                  lastMessageTime: new Date(msg.created_at),
                  unread: isCurrentChat ? 0 : (contact.unread || 0) + 1
                }
              : contact
          );
        }
        // Someone new messaged us — add them to the sidebar
        return [{
          id: senderId,
          username: msg.sender_username || senderId,
          lastMessage: plaintext,
          lastMessageTime: new Date(msg.created_at),
          unread: isCurrentChat ? 0 : 1
        }, ...prev];
      });
    } catch (error) {
      console.error('Failed to decrypt incoming message:', error);
    }
  }, []);

  // Applied to message rows the user sent — picks up read/delivered/deleted
  // changes made by the recipient (or by the sender on another device).
  const handleMessageUpdate = useCallback((updated) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== updated.id) return m;
      const next = {
        ...m,
        read: updated.read,
        delivered: updated.delivered
      };
      if (updated.deleted_at && !m.deleted) {
        next.deleted = true;
        next.text = null;
      }
      return next;
    }));
    if (updated.deleted_at) {
      // Keep the sidebar's "last message" preview in sync with deletions.
      setContacts(prev => prev.map(c => {
        const partnerId = updated.sender_id === currentUserIdRef.current
          ? updated.recipient_id : updated.sender_id;
        if (c.id !== partnerId) return c;
        return { ...c, lastMessage: 'This message was deleted' };
      }));
    }
  }, []);

  // A message inserted while this device was online, but sent FROM this user on
  // another device. Decrypt the sender copy and sync it into the UI.
  const handleOwnMessageFromOtherDevice = useCallback(async (msg) => {
    try {
      if (!privateKeyRef.current || !msg.ephemeral_key || !msg.encrypted_content_sender) return;
      const plaintext = await cryptoRef.current.decryptSenderCopy(
        msg.encrypted_content_sender, msg.iv, privateKeyRef.current,
        msg.ephemeral_key, msg.message_number
      );
      const isCurrentChat = msg.recipient_id === selectedContactRef.current?.id;
      if (isCurrentChat) {
        setMessages(prev => {
          // Dedupe against both the final id and any optimistic entry we may
          // already hold for this send (matched by message_number, since the
          // optimistic temp id won't match the server-assigned uuid).
          const existingIdx = prev.findIndex(m =>
            m.id === msg.id ||
            (m.message_number != null && m.message_number === msg.message_number)
          );
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...prev[existingIdx],
              id: msg.id,
              message_number: msg.message_number,
              sending: false,
              read: msg.read,
              delivered: msg.delivered,
              deleted: !!msg.deleted_at
            };
            return updated;
          }
          return [...prev, {
            id: msg.id,
            message_number: msg.message_number,
            from: msg.sender_id,
            text: plaintext,
            timestamp: new Date(msg.created_at),
            read: msg.read,
            delivered: msg.delivered,
            deleted: !!msg.deleted_at
          }];
        });
      }
      setContacts(prev => prev.map(c =>
        c.id === msg.recipient_id
          ? { ...c, lastMessage: plaintext, lastMessageTime: new Date(msg.created_at) }
          : c
      ));
    } catch (err) {
      console.error('Failed to decrypt own message from other device:', err);
    }
  }, []);

  // Fire-and-forget broadcast to a recipient's user channel. Uses httpSend,
  // which POSTs to /realtime/v1/api/broadcast — no websocket join on their
  // channel, so we don't receive their inbound traffic just to notify them.
  // The Realtime tenant's Postgres replication pool is NOT involved, so this
  // works even when postgres_changes subscriptions are wedged.
  const notify = useCallback((recipientId, event, payload) => {
    try {
      const ch = supabase.channel(`user-${recipientId}`);
      ch.httpSend(event, payload).catch((err) =>
        console.warn('[REALTIME] notify failed:', err?.message || err)
      );
    } catch (err) {
      console.warn('[REALTIME] notify threw:', err);
    }
  }, []);

  const setupRealtime = useCallback(async (userId) => {
    messagesChannelRef.current?.unsubscribe();
    if (realtimeRetryRef.current) clearTimeout(realtimeRetryRef.current);

    // supabase-js only auto-wires the realtime JWT on SIGNED_IN / TOKEN_REFRESHED.
    // On INITIAL_SESSION (page reload) the socket still holds the anon key, so
    // authenticated broadcasts would be rejected. Push the current access token
    // in before we subscribe.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token);
    }

    messagesChannelRef.current = supabase
      .channel(`user-${userId}`)
      // new_message { id, from } — the sender broadcasts after a successful
      // insert. Payload carries only the id; we fetch the row (RLS-protected)
      // to get the ciphertext.
      .on('broadcast', { event: 'new_message' }, async ({ payload }) => {
        if (!payload?.id) return;
        const { data: msg } = await supabase
          .from('messages').select('*').eq('id', payload.id).single();
        if (!msg) return;
        if (msg.recipient_id === userId) {
          const isCurrentChat = msg.sender_id === selectedContactRef.current?.id;
          await handleNewMessage(msg, msg.sender_id, isCurrentChat);
          if (isCurrentChat) {
            // Recipient is actively viewing the chat — mark read immediately
            // so the sender's "read" tick flips live, not only on next open.
            supabase.from('messages').update({ read: true }).eq('id', msg.id).then(
              () => notify(msg.sender_id, 'message_update', { id: msg.id }),
              () => {}
            );
          } else {
            supabase.rpc('mark_messages_delivered', { p_recipient_id: userId }).then(
              () => {}, () => {}
            );
          }
        } else if (msg.sender_id === userId) {
          await handleOwnMessageFromOtherDevice(msg);
        }
      })
      // message_update { id } — sender broadcasts after read/delivered/delete
      // mutations; recipient re-fetches so RLS still gates the row.
      .on('broadcast', { event: 'message_update' }, async ({ payload }) => {
        if (!payload?.id) return;
        const { data: msg } = await supabase
          .from('messages').select('*').eq('id', payload.id).single();
        if (msg) handleMessageUpdate(msg);
      })
      // typing { from, is_typing } — direct state, no DB round-trip.
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.from !== selectedContactRef.current?.id) return;
        setOtherUserTyping(!!payload.is_typing);
        if (payload.is_typing) {
          if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
          otherTypingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
        }
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[REALTIME] Channel error:', err);
          realtimeRetryRef.current = setTimeout(() => setupRealtime(userId), 5000);
        }
        if (status === 'TIMED_OUT') {
          console.warn('[REALTIME] Channel timed out, reconnecting...');
          realtimeRetryRef.current = setTimeout(() => setupRealtime(userId), 5000);
        }
      });
  }, [handleNewMessage, handleMessageUpdate, handleOwnMessageFromOtherDevice, notify]);

  useEffect(() => {
    if (!currentUserId) return;
    setupRealtime(currentUserId);
    // Flip delivered=true for any messages the user received while offline.
    supabase.rpc('mark_messages_delivered', { p_recipient_id: currentUserId }).then(
      () => {}, () => {}
    );
  }, [currentUserId, setupRealtime]);

  // The channel goes quietly stale after a laptop sleep/wake, a tab spending a
  // long time backgrounded, or a wifi drop — none of which reliably fire
  // CHANNEL_ERROR/TIMED_OUT on their own. Re-check on the events that actually
  // signal "we might be back": the tab regaining focus, or the network
  // coming back online.
  useEffect(() => {
    if (!currentUserId) return;

    const reconnectIfStale = () => {
      const state = messagesChannelRef.current?.state;
      if (state === 'joined' || state === 'joining') return;
      if (realtimeRetryRef.current) clearTimeout(realtimeRetryRef.current);
      setupRealtime(currentUserId);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') reconnectIfStale();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', reconnectIfStale);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', reconnectIfStale);
    };
  }, [currentUserId, setupRealtime]);

  // ─── Auth handlers ────────────────────────────────────────────────────────

  const handleRegister = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) { showToast('Passwords do not match'); return; }
    if (password.length < 8) { showToast('Password must be at least 8 characters long'); return; }
    if (!/[A-Z]/.test(password)) { showToast('Password must contain at least one uppercase letter'); return; }
    if (!/[a-z]/.test(password)) { showToast('Password must contain at least one lowercase letter'); return; }
    if (!/[0-9]/.test(password)) { showToast('Password must contain at least one number'); return; }
    if (username.length < 3 || username.length > 20) { showToast('Username must be 3–20 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { showToast('Username can only contain letters, numbers, and underscores'); return; }

    try {
      const crypto = cryptoRef.current;
      const keyPair = await crypto.generateKeyPair();
      const publicKeyBase64  = await crypto.exportPublicKey(keyPair.publicKey);
      const privateKeyBase64 = await crypto.exportPrivateKey(keyPair.privateKey);

      const { wrapped, wiv, salt } = await crypto.wrapPrivateKey(keyPair.privateKey, password);
      const wrappedData = JSON.stringify({ wrapped, wiv, salt });

      // Pass wrappedPrivateKey through user_metadata so the handle_new_user trigger
      // writes it to the profile row even when email confirmation is enabled and
      // no session is available to us on this side of signUp.
      const { data, error } = await supabase.auth.signUp({
        email: usernameToAuthEmail(username),
        password,
        options: {
          data: { username, identityKey: publicKeyBase64, wrappedPrivateKey: wrappedData }
        }
      });

      if (error) throw error;

      if (data.user) {
        localStorage.setItem(`wt_privkey_${data.user.id}`, privateKeyBase64);
        localStorage.setItem(`wt_pubkey_${data.user.id}`, publicKeyBase64);
        privateKeyRef.current = keyPair.privateKey;
        publicKeyCache.current.set(data.user.id, publicKeyBase64);

        if (data.session) {
          await supabase.from('profiles').update({
            identity_key: publicKeyBase64,
            wrapped_private_key: wrappedData
          }).eq('id', data.user.id);
          setToken(data.session.access_token);
          setCurrentUser(username);
          setCurrentUserId(data.user.id);
          setCurrentView('chat');
        } else {
          // No session means Supabase is waiting on email confirmation — but we
          // never collect a real email, so that link can never be delivered.
          // "Confirm email" must be disabled in the Supabase Auth settings.
          showToast('Account created, but could not sign you in automatically. Please try signing in.', 'success');
          setCurrentView('login');
        }
      }
    } catch (error) {
      console.error('Registration error:', error);
      showToast(error.message || 'Registration failed');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: usernameToAuthEmail(username),
        password
      });
      if (error) throw error;

      if (data.user && data.session) {
        const savedPriv = localStorage.getItem(`wt_privkey_${data.user.id}`);
        const savedPub  = localStorage.getItem(`wt_pubkey_${data.user.id}`);

        const { data: profile, error: profileError } = await fetchProfileWithRetry(
          data.user.id, 'identity_key, wrapped_private_key'
        );

        // Refuse to touch keys if we can't verify the server's state — the
        // alternative is silently overwriting identity_key on a transient error.
        // (fetchProfileWithRetry already retried once, so this is a real failure.)
        if (profileError || !profile) {
          throw new Error('Could not load your profile. Please check your connection and try again.');
        }

        const remoteKey = profile.identity_key;
        const remoteKeyIsReal = remoteKey && remoteKey !== 'dummy';

        if (savedPriv && savedPub) {
          // Local keys present. Refuse to load them if they disagree with the
          // server — that means this device has a stale or foreign key.
          if (remoteKeyIsReal && remoteKey !== savedPub) {
            throw new Error(
              'This device has an out-of-date encryption key. Please clear site data and sign in again.'
            );
          }

          privateKeyRef.current = await cryptoRef.current.importPrivateKey(savedPriv);
          publicKeyCache.current.set(data.user.id, savedPub);

          if (!remoteKeyIsReal) {
            await supabase.from('profiles').update({ identity_key: savedPub }).eq('id', data.user.id);
          }

          // Backfill wrapped_private_key if the server never got one (e.g. user
          // registered before the trigger wrote it, or email-confirmation path).
          if (!profile?.wrapped_private_key) {
            try {
              const { wrapped, wiv, salt } = await cryptoRef.current.wrapPrivateKey(
                privateKeyRef.current, password
              );
              await supabase.from('profiles').update({
                wrapped_private_key: JSON.stringify({ wrapped, wiv, salt })
              }).eq('id', data.user.id);
            } catch (wrapErr) {
              console.warn('Failed to backfill wrapped_private_key:', wrapErr);
            }
          }
        } else if (profile?.wrapped_private_key) {
          // No local keys — recover from the password-wrapped copy.
          try {
            const { wrapped, wiv, salt } = JSON.parse(profile.wrapped_private_key);
            const recoveredKey = await cryptoRef.current.unwrapPrivateKey(wrapped, wiv, salt, password);
            const privB64 = await cryptoRef.current.exportPrivateKey(recoveredKey);
            const pubB64  = profile.identity_key;
            localStorage.setItem(`wt_privkey_${data.user.id}`, privB64);
            localStorage.setItem(`wt_pubkey_${data.user.id}`, pubB64);
            privateKeyRef.current = recoveredKey;
            publicKeyCache.current.set(data.user.id, pubB64);
          } catch (unwrapErr) {
            // DO NOT silently generate a new keypair here — that would overwrite
            // the profile's identity_key and destroy all past message decryption.
            console.error('Key unwrap failed:', unwrapErr);
            throw new Error(
              'Could not recover your encryption keys. The stored key may be corrupted.'
            );
          }
        } else if (remoteKeyIsReal) {
          // Server has a real identity_key but no wrapped private key. Generating
          // fresh here would orphan every message ever sent to this user.
          throw new Error(
            'Your encryption keys cannot be recovered on this device. ' +
            'Previous messages will not be readable. Contact support before continuing.'
          );
        } else {
          // Brand new account (no remote identity_key, no wrapped key). Safe to
          // generate, wrap, and save.
          await generateAndSaveNewPair(data.user.id, password);
        }

        setToken(data.session.access_token);
        setCurrentUser(data.user.user_metadata?.username);
        setCurrentUserId(data.user.id);
        setCurrentView('chat');
      }
    } catch (error) {
      console.error('Login error:', error);
      showToast(error.message || 'Login failed');
    }
  };

  const generateAndSaveNewPair = async (userId, userPassword) => {
    const keyPair = await cryptoRef.current.generateKeyPair();
    const pub  = await cryptoRef.current.exportPublicKey(keyPair.publicKey);
    const priv = await cryptoRef.current.exportPrivateKey(keyPair.privateKey);
    const { wrapped, wiv, salt } = await cryptoRef.current.wrapPrivateKey(keyPair.privateKey, userPassword);
    const wrappedData = JSON.stringify({ wrapped, wiv, salt });
    localStorage.setItem(`wt_privkey_${userId}`, priv);
    localStorage.setItem(`wt_pubkey_${userId}`, pub);
    privateKeyRef.current = keyPair.privateKey;
    publicKeyCache.current.set(userId, pub);
    await supabase.from('profiles').update({
      identity_key: pub,
      wrapped_private_key: wrappedData
    }).eq('id', userId);
  };

  const handleLogout = async () => {
    messagesChannelRef.current?.unsubscribe();
    await supabase.auth.signOut();
    if (currentUser) localStorage.removeItem(`contacts_${currentUser}`);
    setToken(null);
    setCurrentUser(null);
    setCurrentUserId(null);
    privateKeyRef.current = null;
    publicKeyCache.current.clear();
    setContacts([]);
    setSelectedContact(null);
    setMessages([]);
    setShowSettings(false);
    setCurrentView('landing');
  };

  const handleDeleteAccount = async () => {
    const confirmed = await showConfirm(
      'This will permanently erase your account and all messages. It cannot be undone.',
      { title: 'Delete account?', destructive: true }
    );
    if (!confirmed) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          }
        }
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || 'Delete failed');
      }

      if (currentUserId) {
        localStorage.removeItem(`wt_privkey_${currentUserId}`);
        localStorage.removeItem(`wt_pubkey_${currentUserId}`);
      }
      if (currentUser) localStorage.removeItem(`contacts_${currentUser}`);
      await supabase.auth.signOut();
      setToken(null);
      setCurrentUser(null);
      setCurrentUserId(null);
      privateKeyRef.current = null;
      publicKeyCache.current.clear();
      setContacts([]);
      setSelectedContact(null);
      setMessages([]);
      setShowSettings(false);
      setCurrentView('landing');
    } catch (err) {
      console.error('Delete account error:', err);
      showToast(err.message || 'Failed to delete account. Please try again.');
    }
  };

  // ─── Chat ─────────────────────────────────────────────────────────────────

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    localStorage.setItem('darkMode', newMode);
  };

  const searchUsers = async (query) => {
    if (!query.trim()) { setSearchResults([]); return; }
    try {
      // Escape PostgREST ilike wildcards so a user typing "%" or "_" doesn't get
      // a wildcard match — they should only match the literal character.
      const escaped = query.replace(/([\\%_])/g, '\\$1');
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, identity_key')
        .ilike('username', `%${escaped}%`)
        .neq('id', currentUserId)
        .limit(20);
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const startChat = async (contact) => {
    try {
      if (contact.identity_key && contact.identity_key !== 'dummy') {
        publicKeyCache.current.set(contact.id, contact.identity_key);
      } else {
        await getPublicKey(contact.id);
      }
      setSelectedContact({ ...contact, unread: 0 });
      setContacts(prev => {
        const exists = prev.find(c => c.id === contact.id);
        if (exists) return [{ ...contact, unread: 0 }, ...prev.filter(c => c.id !== contact.id)];
        return [{ ...contact, unread: 0 }, ...prev];
      });
      setSearchResults([]);
      setSearchQuery('');
      forceScrollRef.current = true;
      const loaded = await loadMessages(contact.id);
      await markMessagesRead(contact.id, loaded);
    } catch (error) {
      console.error('Failed to start chat:', error);
      showToast('Failed to start chat');
    }
  };

  const loadMessages = async (contactId) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${currentUserId},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${currentUserId})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const decryptedMessages = [];

      for (const msg of (data || [])) {
        if (msg.deleted_at) {
          decryptedMessages.push({
            id: msg.id,
            from: msg.sender_id,
            text: null,
            timestamp: new Date(msg.created_at),
            deleted: true,
            read: msg.read,
            delivered: msg.delivered
          });
          continue;
        }

        if (!privateKeyRef.current || !msg.ephemeral_key) {
          decryptedMessages.push({
            id: msg.id,
            from: msg.sender_id,
            text: msg.ephemeral_key ? '[Cannot decrypt: keys not loaded]' : '[Legacy message — cannot decrypt]',
            timestamp: new Date(msg.created_at),
            read: msg.read,
            delivered: msg.delivered
          });
          continue;
        }

        try {
          let plaintext;
          if (msg.sender_id === currentUserId) {
            if (!msg.encrypted_content_sender) {
              plaintext = '[Cannot decrypt own message]';
            } else {
              plaintext = await cryptoRef.current.decryptSenderCopy(
                msg.encrypted_content_sender,
                msg.iv,
                privateKeyRef.current,
                msg.ephemeral_key,
                msg.message_number
              );
            }
          } else {
            plaintext = await cryptoRef.current.decryptForRecipient(
              msg.encrypted_content,
              msg.iv,
              privateKeyRef.current,
              msg.ephemeral_key,
              msg.message_number
            );
          }
          decryptedMessages.push({
            id: msg.id,
            from: msg.sender_id,
            text: plaintext,
            timestamp: new Date(msg.created_at),
            mediaType: msg.media_type,
            mediaUrl: msg.media_url,
            read: msg.read,
            delivered: msg.delivered,
            deleted: false
          });
        } catch {
          decryptedMessages.push({
            id: msg.id,
            from: msg.sender_id,
            text: '[Unable to decrypt]',
            timestamp: new Date(msg.created_at),
            read: msg.read,
            delivered: msg.delivered
          });
        }
      }

      setMessages(decryptedMessages);
      return decryptedMessages;
    } catch (error) {
      console.error('Failed to load messages:', error);
      return [];
    }
  };

  const sendMessage = async () => {
    if (!messageInput.trim() || !selectedContact) return;

    if (!privateKeyRef.current) {
      showToast('Encryption keys not loaded. Please sign out and sign back in.');
      return;
    }

    try {
      const theirPublicKey = await getPublicKey(selectedContact.id);
      if (!theirPublicKey) {
        showToast('Cannot send message: recipient has not set up their encryption keys yet.');
        return;
      }

      const messageText = messageInput;
      const messageNumber = Date.now();
      const tempId = `temp-${messageNumber}`;

      const encrypted = await cryptoRef.current.encrypt(
        messageText,
        privateKeyRef.current,
        theirPublicKey,
        messageNumber
      );

      const tempMessage = {
        id: tempId,
        message_number: messageNumber,
        from: currentUserId,
        text: messageText,
        timestamp: new Date(),
        sending: true
      };
      setMessages(prev => [...prev, tempMessage]);
      setContacts(prev => prev.map(contact =>
        contact.id === selectedContact.id
          ? { ...contact, lastMessage: messageText, lastMessageTime: new Date() }
          : contact
      ));
      setMessageInput('');

      // Send is itself an "I stopped typing" signal — cancel any pending false
      // and emit it now so the recipient's indicator clears immediately.
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        sendTypingIndicator(false);
      }

      const { data, error } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUserId,
          sender_username: currentUser,
          recipient_id: selectedContact.id,
          encrypted_content: encrypted.ciphertext,
          encrypted_content_sender: encrypted.ciphertextSender,
          iv: encrypted.iv,
          ephemeral_key: encrypted.ephemeralPublicKey,
          message_number: messageNumber
        })
        .select()
        .single();

      if (error) throw error;

      setMessages(prev => prev.map(msg =>
        msg.id === tempId ? { ...msg, id: data.id, sending: false } : msg
      ));

      // Notify the recipient (and our other devices) that a new message landed.
      notify(selectedContact.id, 'new_message', { id: data.id });
      notify(currentUserId,      'new_message', { id: data.id });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.filter(msg => !msg.sending));
      showToast(`Failed to send: ${error.message}`);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    const confirmed = await showConfirm('Delete this message for everyone?', { destructive: true });
    if (!confirmed) return;
    const { error } = await supabase.rpc('delete_message', { p_message_id: messageId });
    if (!error) {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, deleted: true, text: null } : m
      ));
      // Tell the recipient (and our other devices) the row changed.
      if (selectedContact?.id) notify(selectedContact.id, 'message_update', { id: messageId });
      notify(currentUserId, 'message_update', { id: messageId });
    } else {
      showToast('Failed to delete message');
    }
  };

  const sendTypingIndicator = (isTyping) => {
    if (!selectedContact || !currentUserId) return;
    notify(selectedContact.id, 'typing', { from: currentUserId, is_typing: isTyping });
  };

  const handleTyping = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    if (value.length === 0) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (typingActiveRef.current) {
        typingActiveRef.current = false;
        sendTypingIndicator(false);
      }
      return;
    }

    // Only fire `true` on the edge (first keystroke or after a pause). The stop
    // signal is sent by a trailing timer once the user has been idle for 2s.
    if (!typingActiveRef.current) {
      typingActiveRef.current = true;
      sendTypingIndicator(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      typingActiveRef.current = false;
      sendTypingIndicator(false);
    }, 2000);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    showToast('File upload coming soon', 'info');
  };

  const markMessagesRead = async (contactId, msgList = messages) => {
    try {
      const unreadMessages = msgList.filter(
        m => m.from !== currentUserId && !m.read && m.from === contactId
      );
      if (unreadMessages.length === 0) return;
      const unreadIds = unreadMessages.map(m => m.id);
      await supabase.from('messages').update({ read: true }).in('id', unreadIds);
      setMessages(prev => prev.map(msg =>
        unreadIds.includes(msg.id) ? { ...msg, read: true } : msg
      ));
      setContacts(prev => prev.map(contact =>
        contact.id === contactId ? { ...contact, unread: 0 } : contact
      ));
      // Tell the sender to refresh these rows so their read receipts flip live.
      unreadIds.forEach(id => notify(contactId, 'message_update', { id }));
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
    }
  };

  const formatTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={currentView === 'chat' ? `app ${darkMode ? 'dark-mode' : ''}` : 'app'}>

      <Toast toast={toast} onClose={() => setToast(null)} />

      <ConfirmDialog confirmDialog={confirmDialog} onYes={handleConfirmYes} onNo={handleConfirmNo} />

      {currentView === 'landing' && (
        <LandingPage
          isLoggedIn={!!token}
          onOpenChat={() => setCurrentView('chat')}
          onGetStarted={() => setCurrentView('register')}
          onSignIn={() => setCurrentView('login')}
        />
      )}

      {currentView === 'login' && (
        <LoginView
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          onSubmit={handleLogin}
          onBack={() => setCurrentView('landing')}
          onSwitchToRegister={() => {
            setCurrentView('register');
            setPassword('');
            setConfirmPassword('');
          }}
        />
      )}

      {currentView === 'register' && (
        <RegisterView
          username={username}
          setUsername={setUsername}
          password={password}
          setPassword={setPassword}
          confirmPassword={confirmPassword}
          setConfirmPassword={setConfirmPassword}
          onSubmit={handleRegister}
          onBack={() => setCurrentView('landing')}
          onSwitchToLogin={() => {
            setCurrentView('login');
            setPassword('');
            setConfirmPassword('');
          }}
        />
      )}

      {currentView === 'chat' && (
        <>
          {showSettings && (
            <SettingsModal
              currentUser={currentUser}
              onClose={() => setShowSettings(false)}
              onDeleteAccount={handleDeleteAccount}
            />
          )}

          <div className="chat-container">
            <Sidebar
              darkMode={darkMode}
              toggleDarkMode={toggleDarkMode}
              onOpenSettings={() => setShowSettings(true)}
              onLogout={handleLogout}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              searchUsers={searchUsers}
              searchResults={searchResults}
              currentUserId={currentUserId}
              startChat={startChat}
              contacts={contacts}
              selectedContact={selectedContact}
              formatTime={formatTime}
            />

            <ChatArea
              selectedContact={selectedContact}
              onBack={() => setSelectedContact(null)}
              messages={messages}
              currentUserId={currentUserId}
              messagesContainerRef={messagesContainerRef}
              messagesEndRef={messagesEndRef}
              otherUserTyping={otherUserTyping}
              handleDeleteMessage={handleDeleteMessage}
              messageInput={messageInput}
              handleTyping={handleTyping}
              sendMessage={sendMessage}
              handleFileUpload={handleFileUpload}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default App;
