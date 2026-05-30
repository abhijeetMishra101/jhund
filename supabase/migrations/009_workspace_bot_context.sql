-- Phase 23: Workspace Context
-- Adds bot_context column so founders can describe their project once;
-- the text is injected into every bot's system prompt on every Claude call.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS bot_context text;
