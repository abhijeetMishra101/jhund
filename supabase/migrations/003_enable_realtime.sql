-- Enable Supabase Realtime for the messages table so the frontend
-- receives live INSERT events without polling.
alter publication supabase_realtime add table messages;
