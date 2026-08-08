-- ============================================
-- WakyTalky Supabase Database Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Custom type for message media types
-- (Not needed, just use TEXT with CHECK constraint)

-- ============================================
-- PROFILES TABLE (extends Supabase Auth)
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  identity_key TEXT,
  signed_pre_key TEXT,
  one_time_pre_keys JSONB DEFAULT '[]',
  wrapped_private_key TEXT,
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (needed for search)
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile on signup
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  sender_username TEXT,
  encrypted_content TEXT NOT NULL,
  encrypted_content_sender TEXT,
  iv TEXT NOT NULL,
  message_number BIGINT,
  ephemeral_key TEXT,
  media_type TEXT,
  media_url TEXT,
  media_iv TEXT,
  media_size BIGINT,
  delivered BOOLEAN DEFAULT false,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Users can only see messages they sent or received
CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- Users can insert messages (sender must be themselves)
CREATE POLICY "Users can insert messages as sender"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

-- Recipients can update delivery/read status
CREATE POLICY "Users can update messages received"
  ON public.messages FOR UPDATE
  USING (auth.uid() = recipient_id);

-- Senders can soft-delete (set deleted_at) on messages they sent.
-- Column-level restriction (deleted_at only, delivered/read only for
-- recipients) is enforced by the enforce_message_update_columns trigger
-- below — RLS alone can't express "only this column may change".
CREATE POLICY "Users can soft-delete own sent messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);

-- ============================================
-- TYPING INDICATORS TABLE (ephemeral)
-- ============================================
CREATE TABLE public.typing_indicators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  recipient_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  is_typing BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view typing for themselves"
  ON public.typing_indicators FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can insert own typing"
  ON public.typing_indicators FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update own typing"
  ON public.typing_indicators FOR UPDATE
  USING (auth.uid() = sender_id);

CREATE POLICY "Users can delete own typing"
  ON public.typing_indicators FOR DELETE
  USING (auth.uid() = sender_id);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_recipient ON public.messages(recipient_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_messages_conversation ON public.messages(sender_id, recipient_id, created_at);
CREATE INDEX idx_profiles_username ON public.profiles(username);
CREATE UNIQUE INDEX idx_typing_pair ON public.typing_indicators(sender_id, recipient_id);

-- ============================================
-- ENABLE REALTIME
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- REPLICA IDENTITY FULL is required for postgres_changes subscriptions to work
-- with RLS-enabled tables.  Without it, Supabase Realtime cannot evaluate RLS
-- policies on change events and the subscription will always time out.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- ============================================
-- STORAGE BUCKET FOR ENCRYPTED MEDIA
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('encrypted-media', 'encrypted-media', false);

-- Users can upload encrypted files
CREATE POLICY "Users can upload encrypted media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'encrypted-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Users can read their own uploaded files and files sent to them
CREATE POLICY "Users can read encrypted media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'encrypted-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR auth.uid()::text = (storage.foldername(name))[2]));

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP (TRIGGER)
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- wrapped_private_key is read from metadata so that sign-ups requiring email
  -- confirmation (no session yet) still get the password-wrapped key persisted.
  -- Without this, the client can't save it post-signup and cross-device
  -- recovery silently breaks.
  INSERT INTO public.profiles (id, username, identity_key, signed_pre_key, one_time_pre_keys, wrapped_private_key)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'identityKey', 'dummy'),
    COALESCE(NEW.raw_user_meta_data->>'signedPreKey', 'dummy'),
    COALESCE(NEW.raw_user_meta_data->'oneTimePreKeys', '[]'::jsonb),
    NEW.raw_user_meta_data->>'wrappedPrivateKey'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- FUNCTION: Mark messages as delivered
-- p_recipient_id is no longer trusted as-is: previously this had no
-- auth check at all, so any authenticated caller could pass someone
-- else's id and flip their delivery flags. Now scoped to auth.uid()
-- and no longer SECURITY DEFINER, so the "Users can update messages
-- received" RLS policy (recipient-only) enforces it too — same
-- belt-and-suspenders pattern as delete_message above.
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_messages_delivered(p_recipient_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.messages
  SET delivered = true
  WHERE recipient_id = auth.uid() AND recipient_id = p_recipient_id AND delivered = false;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ============================================
-- FUNCTION: Mark messages as read
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_messages_read(p_message_ids UUID[])
RETURNS void AS $$
BEGIN
  UPDATE public.messages
  SET read = true
  WHERE id = ANY(p_message_ids) AND recipient_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================
-- TRIGGER: Restrict which columns each side of a message
-- may change on UPDATE. RLS policies only gate row visibility,
-- not column contents, so without this a sender-side UPDATE
-- policy would let a sender rewrite encrypted_content after
-- delivery, and the existing recipient policy would let a
-- recipient rewrite anything on a message addressed to them.
-- ============================================
CREATE OR REPLACE FUNCTION public.enforce_message_update_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() = OLD.sender_id THEN
    -- Senders may only soft-delete (deleted_at NULL -> now), once.
    IF NOT (
      OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
      AND NEW.sender_id = OLD.sender_id AND NEW.recipient_id = OLD.recipient_id
      AND NEW.sender_username IS NOT DISTINCT FROM OLD.sender_username
      AND NEW.encrypted_content = OLD.encrypted_content
      AND NEW.encrypted_content_sender IS NOT DISTINCT FROM OLD.encrypted_content_sender
      AND NEW.iv = OLD.iv
      AND NEW.message_number IS NOT DISTINCT FROM OLD.message_number
      AND NEW.ephemeral_key IS NOT DISTINCT FROM OLD.ephemeral_key
      AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
      AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
      AND NEW.media_iv IS NOT DISTINCT FROM OLD.media_iv
      AND NEW.media_size IS NOT DISTINCT FROM OLD.media_size
      AND NEW.delivered = OLD.delivered
      AND NEW.read = OLD.read
      AND NEW.created_at = OLD.created_at
    ) THEN
      RAISE EXCEPTION 'Senders may only soft-delete their own message (deleted_at only, once)';
    END IF;
  ELSIF auth.uid() = OLD.recipient_id THEN
    -- Recipients may only flip delivered/read.
    IF NOT (
      NEW.sender_id = OLD.sender_id AND NEW.recipient_id = OLD.recipient_id
      AND NEW.sender_username IS NOT DISTINCT FROM OLD.sender_username
      AND NEW.encrypted_content = OLD.encrypted_content
      AND NEW.encrypted_content_sender IS NOT DISTINCT FROM OLD.encrypted_content_sender
      AND NEW.iv = OLD.iv
      AND NEW.message_number IS NOT DISTINCT FROM OLD.message_number
      AND NEW.ephemeral_key IS NOT DISTINCT FROM OLD.ephemeral_key
      AND NEW.media_type IS NOT DISTINCT FROM OLD.media_type
      AND NEW.media_url IS NOT DISTINCT FROM OLD.media_url
      AND NEW.media_iv IS NOT DISTINCT FROM OLD.media_iv
      AND NEW.media_size IS NOT DISTINCT FROM OLD.media_size
      AND NEW.created_at = OLD.created_at
      AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    ) THEN
      RAISE EXCEPTION 'Recipients may only update delivered/read status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER enforce_message_update_columns_trigger
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_update_columns();

-- ============================================
-- FUNCTION: Soft-delete a sent message
-- Only the sender can delete their own message. No longer
-- SECURITY DEFINER: enforcement now genuinely comes from the
-- "Users can soft-delete own sent messages" RLS policy plus the
-- column-restriction trigger above, not from bypassing RLS.
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_message(p_message_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.messages
  SET deleted_at = NOW()
  WHERE id = p_message_id
    AND sender_id = auth.uid()
    AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SET search_path = '';

-- ============================================
-- TRIGGER: Rate limit messages (max 30/min per user)
-- ============================================
CREATE OR REPLACE FUNCTION public.check_message_rate_limit()
RETURNS TRIGGER AS $$
DECLARE
  msg_count INT;
BEGIN
  SELECT COUNT(*) INTO msg_count
  FROM public.messages
  WHERE sender_id = NEW.sender_id
    AND created_at > NOW() - INTERVAL '1 minute';

  IF msg_count >= 30 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 30 messages per minute';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER enforce_message_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.check_message_rate_limit();