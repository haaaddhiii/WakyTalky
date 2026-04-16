import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import { supabase } from './lib/supabase';
import LandingPage from './LandingPage';

const SimpleCrypto = window.SimpleCrypto;

// ─── URL ↔ view mapping ────────────────────────────────────────────────────
const VIEW_TO_PATH = { landing: '/', login: '/login', register: '/register', chat: '/chat' };
const PATH_TO_VIEW = { '/': 'landing', '/login': 'login', '/register': 'register', '/chat': 'chat' };

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
  const [email, setEmail] = useState('');
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
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedContactRef = useRef(null);
  const typingChannelRef = useRef(null);
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

      if (savedPriv && savedPub) {
        // Skip re-import and DB write if handleLogin already initialised the key this session.
        if (!privateKeyRef.current) {
          privateKeyRef.current = await cryptoRef.current.importPrivateKey(savedPriv);
          publicKeyCache.current.set(currentUserId, savedPub);
          await supabase.from('profiles').update({ identity_key: savedPub }).eq('id', currentUserId);
        }
        loadRecentContacts(currentUserId);
      } else {
        // No local keys — check whether a wrapped key exists in the profile BEFORE
        // generating a new pair.  Generating fresh would overwrite the user's identity
        // key in the database and permanently break decryption of all existing messages
        // (hit in incognito mode and on new devices that still have an active session).
        const { data: profile } = await supabase
          .from('profiles')
          .select('identity_key, wrapped_private_key')
          .eq('id', currentUserId)
          .single();

        if (profile?.wrapped_private_key) {
          // The real key is recoverable from the server, but unwrapping it requires the
          // login password which is not available here.  Tell the user to re-authenticate.
          showToast(
            'Encryption keys not found locally. Sign out and sign back in to restore them.',
            'info'
          );
          loadRecentContacts(currentUserId);
        } else {
          // Truly no wrapped key (brand-new account before first login completes, or very
          // old account) — safe to generate a fresh pair.
          const keyPair = await cryptoRef.current.generateKeyPair();
          const pub  = await cryptoRef.current.exportPublicKey(keyPair.publicKey);
          const priv = await cryptoRef.current.exportPrivateKey(keyPair.privateKey);
          localStorage.setItem(`wt_privkey_${currentUserId}`, priv);
          localStorage.setItem(`wt_pubkey_${currentUserId}`, pub);
          privateKeyRef.current = keyPair.privateKey;
          publicKeyCache.current.set(currentUserId, pub);
          await supabase.from('profiles').update({ identity_key: pub }).eq('id', currentUserId);
        }
      }
    };

    initKeys().catch(err => console.error('Key init failed:', err));
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

  useEffect(() => { selectedContactRef.current = selectedContact; }, [selectedContact]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);

  useEffect(() => {
    return () => {
      if (realtimeRetryRef.current) clearTimeout(realtimeRetryRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
      typingChannelRef.current?.unsubscribe();
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

  const setupRealtime = useCallback(async (userId) => {
    messagesChannelRef.current?.unsubscribe();
    typingChannelRef.current?.unsubscribe();
    if (realtimeRetryRef.current) clearTimeout(realtimeRetryRef.current);

    messagesChannelRef.current = supabase
      .channel(`user-${userId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${userId}`
      }, async (payload) => {
        const msg = payload.new;
        if (msg.sender_id === userId) return;
        const isCurrentChat = msg.sender_id === selectedContactRef.current?.id;
        await handleNewMessage(msg, msg.sender_id, isCurrentChat);
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[REALTIME] Messages error:', err);
          realtimeRetryRef.current = setTimeout(() => setupRealtime(userId), 5000);
        }
        if (status === 'TIMED_OUT') {
          console.warn('[REALTIME] Messages timed out, reconnecting...');
          realtimeRetryRef.current = setTimeout(() => setupRealtime(userId), 5000);
        }
      });

    typingChannelRef.current = supabase
      .channel(`typing-${userId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'typing_indicators',
        filter: `recipient_id=eq.${userId}`
      }, (payload) => {
        const typing = payload.new;
        if (typing.sender_id !== selectedContactRef.current?.id) return;
        setOtherUserTyping(typing.is_typing);
        if (typing.is_typing) {
          if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
          otherTypingTimeoutRef.current = setTimeout(() => setOtherUserTyping(false), 3000);
        }
      })
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR') console.error('[REALTIME] Typing error:', err);
      });
  }, [handleNewMessage]);

  useEffect(() => {
    if (currentUserId) setupRealtime(currentUserId);
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
    if (!email.includes('@') || !email.includes('.')) { showToast('Please enter a valid email address'); return; }

    try {
      const crypto = cryptoRef.current;
      const keyPair = await crypto.generateKeyPair();
      const publicKeyBase64  = await crypto.exportPublicKey(keyPair.publicKey);
      const privateKeyBase64 = await crypto.exportPrivateKey(keyPair.privateKey);

      const { wrapped, wiv, salt } = await crypto.wrapPrivateKey(keyPair.privateKey, password);
      const wrappedData = JSON.stringify({ wrapped, wiv, salt });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username, identityKey: publicKeyBase64 }
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
          showToast('Account created! Check your email to confirm, then sign in.', 'success');
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user && data.session) {
        const savedPriv = localStorage.getItem(`wt_privkey_${data.user.id}`);
        const savedPub  = localStorage.getItem(`wt_pubkey_${data.user.id}`);

        if (savedPriv && savedPub) {
          privateKeyRef.current = await cryptoRef.current.importPrivateKey(savedPriv);
          publicKeyCache.current.set(data.user.id, savedPub);
          await supabase.from('profiles').update({ identity_key: savedPub }).eq('id', data.user.id);
        } else {
          const { data: profile } = await supabase
            .from('profiles')
            .select('identity_key, wrapped_private_key')
            .eq('id', data.user.id)
            .single();

          if (profile?.wrapped_private_key) {
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
              console.warn('Key unwrap failed, generating fresh keypair:', unwrapErr);
              await generateAndSaveNewPair(data.user.id, password);
            }
          } else {
            await generateAndSaveNewPair(data.user.id, password);
          }
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
    typingChannelRef.current?.unsubscribe();
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
        `${process.env.REACT_APP_SUPABASE_URL}/functions/v1/delete-account`,
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
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, identity_key')
        .ilike('username', `%${query}%`)
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
    } else {
      showToast('Failed to delete message');
    }
  };

  const sendTypingIndicator = async (isTyping) => {
    if (!selectedContact || !currentUserId) return;
    try {
      await supabase.from('typing_indicators').upsert({
        sender_id: currentUserId,
        recipient_id: selectedContact.id,
        is_typing: isTyping,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sender_id,recipient_id' });
    } catch (error) {
      console.error('Failed to send typing indicator:', error);
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);
    if (e.target.value.length > 0) sendTypingIndicator(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTypingIndicator(false), 1000);
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

  // ─── Logo SVG ─────────────────────────────────────────────────────────────
  const LogoSVG = ({ size = 44 }) => (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
      <rect width="44" height="44" rx="12" fill="var(--accent)"/>
      <path d="M22 12C16.48 12 12 16.48 12 22s4.48 10 10 10h5v-2h-5c-3.87 0-7.42-3.02-8-6.84C13.36 18.63 17.26 14 22 14c4.18 0 7.63 3.07 8 7.14.13 1.48-.15 2.88-.73 4.12l1.46 1.46A9.94 9.94 0 0032 22c0-5.52-4.48-10-10-10zm0 14v-4h-2v4h2z" fill="white" fillOpacity=".9"/>
    </svg>
  );

  // ─── Toast icons ──────────────────────────────────────────────────────────
  const toastIcons = {
    error: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    success: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    ),
    info: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
      </svg>
    )
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={currentView === 'chat' ? `app ${darkMode ? 'dark-mode' : ''}` : 'app'}>

      {/* ── Toast notification ──────────────────────────────────────────── */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">{toastIcons[toast.type]}</span>
          <span className="toast-message">{toast.message}</span>
          <button className="toast-close" onClick={() => setToast(null)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      )}

      {/* ── Confirm dialog ──────────────────────────────────────────────── */}
      {confirmDialog && (
        <div className="confirm-overlay" onClick={handleConfirmNo}>
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
              <button className="confirm-cancel" onClick={handleConfirmNo}>Cancel</button>
              <button
                className={`confirm-ok ${confirmDialog.destructive ? 'confirm-ok-danger' : ''}`}
                onClick={handleConfirmYes}
              >
                {confirmDialog.destructive ? 'Delete' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Landing ─────────────────────────────────────────────────────── */}
      {currentView === 'landing' && (
        <LandingPage
          isLoggedIn={!!token}
          onOpenChat={() => setCurrentView('chat')}
          onGetStarted={() => setCurrentView('register')}
          onSignIn={() => setCurrentView('login')}
        />
      )}

      {/* ── Login ───────────────────────────────────────────────────────── */}
      {currentView === 'login' && (
        <div className="auth-container">
          <div className="auth-box">
            <button className="auth-back" onClick={() => setCurrentView('landing')} aria-label="Back to home">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
            </button>
            <div className="auth-logo"><LogoSVG /></div>
            <h1>WakyTalky</h1>
            <p className="tagline">Private messaging, end-to-end encrypted</p>
            <form onSubmit={handleLogin}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="submit">Sign In</button>
            </form>
            <p className="switch-view">
              Don't have an account?{' '}
              <span onClick={() => {
                setCurrentView('register');
                setPassword('');
                setConfirmPassword('');
              }}>Create one</span>
            </p>
          </div>
        </div>
      )}

      {/* ── Register ────────────────────────────────────────────────────── */}
      {currentView === 'register' && (
        <div className="auth-container">
          <div className="auth-box">
            <button className="auth-back" onClick={() => setCurrentView('landing')} aria-label="Back to home">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
              </svg>
            </button>
            <div className="auth-logo"><LogoSVG /></div>
            <h1>Create Account</h1>
            <p className="tagline">Your keys, your privacy</p>
            <form onSubmit={handleRegister}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength="8"
              />
              <input
                type="password"
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength="8"
              />
              <button type="submit">Create Account</button>
            </form>
            <p className="switch-view">
              Already have an account?{' '}
              <span onClick={() => {
                setCurrentView('login');
                setPassword('');
                setConfirmPassword('');
              }}>Sign in</span>
            </p>
          </div>
        </div>
      )}

      {/* ── Chat ────────────────────────────────────────────────────────── */}
      {currentView === 'chat' && (
        <>
          {/* Settings modal */}
          {showSettings && (
            <div className="settings-overlay" onClick={() => setShowSettings(false)}>
              <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                  <h2>Account</h2>
                  <button className="settings-close" onClick={() => setShowSettings(false)}>
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
                    <button className="settings-delete-btn" onClick={handleDeleteAccount}>
                      Delete account
                    </button>
                    <p className="settings-delete-hint">
                      Permanently deletes your account and all messages. This cannot be undone.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="chat-container">
            {/* Sidebar */}
            <div className={`sidebar ${selectedContact ? 'show-chat' : ''}`}>
              <div className="sidebar-header">
                <h2>Chats</h2>
                <div className="sidebar-actions">
                  <button onClick={toggleDarkMode} className="theme-toggle" title={darkMode ? 'Light mode' : 'Dark mode'}>
                    {darkMode ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                      </svg>
                    )}
                  </button>
                  <button onClick={() => setShowSettings(true)} className="theme-toggle" title="Account settings">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                  </button>
                  <button onClick={handleLogout} className="logout-btn">Logout</button>
                </div>
              </div>

              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
                />
              </div>

              {searchResults.length > 0 && (
                <div className="search-results">
                  {searchResults
                    .filter(user => user.id !== currentUserId)
                    .map(user => (
                      <div key={user.id} className="contact-item" onClick={() => startChat(user)}>
                        <div className="contact-avatar">{(user.username?.[0] ?? '?').toUpperCase()}</div>
                        <div className="contact-info">
                          <div className="contact-name">{user.username}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {contacts.length > 0 && (
                <div className="section-header"><h3>Recent Chats</h3></div>
              )}

              <div className="contacts-list">
                {contacts.length === 0 && !searchQuery && (
                  <div className="empty-state">
                    <p>No recent chats</p>
                    <p className="hint">Search for users to start chatting</p>
                  </div>
                )}
                {contacts
                  .filter(contact => currentUserId && contact.id !== currentUserId)
                  .sort((a, b) => {
                    const timeA = a.lastMessageTime ? new Date(a.lastMessageTime) : 0;
                    const timeB = b.lastMessageTime ? new Date(b.lastMessageTime) : 0;
                    return timeB - timeA;
                  })
                  .map(contact => (
                    <div
                      key={contact.id}
                      className={`contact-item ${selectedContact?.id === contact.id ? 'active' : ''}`}
                      onClick={() => startChat(contact)}
                    >
                      <div className="contact-avatar">
                        {(contact.username?.[0] ?? '?').toUpperCase()}
                        {contact.unread > 0 && (
                          <span className="unread-badge">{contact.unread > 9 ? '9+' : contact.unread}</span>
                        )}
                      </div>
                      <div className="contact-info">
                        <div className="contact-name-row">
                          <div className="contact-name">{contact.username}</div>
                          {contact.lastMessageTime && (
                            <div className="contact-time">{formatTime(contact.lastMessageTime)}</div>
                          )}
                        </div>
                        <div className="contact-last-message">
                          {contact.lastMessage || 'Tap to chat'}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Chat area */}
            <div className={`chat-area ${!selectedContact ? 'show-sidebar' : ''}`}>
              {selectedContact ? (
                <>
                  <div className="chat-header">
                    <button className="back-button" onClick={() => setSelectedContact(null)}>
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
                              <span className="message-status">
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
          </div>
        </>
      )}
    </div>
  );
}

export default App;
