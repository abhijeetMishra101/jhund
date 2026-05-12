-- ============================================================
-- Phase 14 — Threads, Multi-bot channels, Bot presence
-- ============================================================

-- Multi-bot channel support
CREATE TABLE IF NOT EXISTS channel_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  bot_role_id  uuid NOT NULL REFERENCES bot_roles(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(channel_id, bot_role_id)
);

CREATE INDEX IF NOT EXISTS channel_members_channel_id_idx ON channel_members(channel_id);
CREATE INDEX IF NOT EXISTS channel_members_bot_role_id_idx ON channel_members(bot_role_id);

-- Thread support on messages
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_count int NOT NULL DEFAULT 0;

-- Index for fetching thread replies
CREATE INDEX IF NOT EXISTS messages_parent_id_idx ON messages(parent_id) WHERE parent_id IS NOT NULL;

-- Function to increment reply_count on parent
CREATE OR REPLACE FUNCTION increment_reply_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    UPDATE messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if it exists so the CREATE is idempotent
DROP TRIGGER IF EXISTS on_reply_inserted ON messages;

CREATE TRIGGER on_reply_inserted
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION increment_reply_count();

-- Bot presence
ALTER TABLE bot_roles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'online'
  CHECK (status IN ('online', 'busy', 'offline')),
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

-- Add channel_type
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS channel_type text NOT NULL DEFAULT 'channel'
  CHECK (channel_type IN ('channel', 'dm', 'standup', 'retrospective'));

-- RLS for channel_members
ALTER TABLE channel_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "workspace members see channel_members"
  ON channel_members FOR SELECT
  USING (
    channel_id IN (
      SELECT id FROM channels WHERE workspace_id = get_my_workspace_id()
    )
  );

CREATE POLICY IF NOT EXISTS "workspace members manage channel_members"
  ON channel_members FOR ALL
  USING (
    channel_id IN (
      SELECT id FROM channels WHERE workspace_id = get_my_workspace_id()
    )
  );

-- Seed channel_members from existing channels.bot_role_id
INSERT INTO channel_members (channel_id, bot_role_id, is_primary)
SELECT id, bot_role_id, true
FROM channels
WHERE bot_role_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Keep bot_role_id nullable for backward compat; drop in Phase 17
ALTER TABLE channels ALTER COLUMN bot_role_id DROP NOT NULL;
