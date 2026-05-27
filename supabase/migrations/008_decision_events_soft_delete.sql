-- Add soft-delete support to decision_events.
-- Hard deletes are forbidden: undo preserves the audit trail via deleted_at.

ALTER TABLE public.decision_events
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Partial index so "most recent non-deleted decision for this workspace+channel"
-- queries stay O(log n) even as the table grows.
CREATE INDEX IF NOT EXISTS idx_decision_events_active
  ON public.decision_events (workspace_id, channel_id, created_at DESC)
  WHERE deleted_at IS NULL;
