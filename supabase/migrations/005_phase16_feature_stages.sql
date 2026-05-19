CREATE TABLE IF NOT EXISTS features (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text NOT NULL,
  stage           int  NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 7),
  complexity      text NOT NULL DEFAULT 'medium'
    CHECK (complexity IN ('hotfix', 'small', 'medium', 'large')),
  status          text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'blocked', 'shipped', 'cancelled')),
  blocking_reason text,
  pr_url          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_use_cases (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id   uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  uc_id        text NOT NULL,
  description  text NOT NULL,
  verified_at  timestamptz,
  waived_at    timestamptz,
  waive_reason text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gate_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id  uuid NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  from_stage  int NOT NULL,
  to_stage    int NOT NULL,
  gate_type   text NOT NULL CHECK (gate_type IN ('founder_approval','auto_clear','bot_signoff')),
  actor_role  text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS features_workspace_id_idx ON features(workspace_id);
CREATE INDEX IF NOT EXISTS feature_use_cases_feature_id_idx ON feature_use_cases(feature_id);
CREATE INDEX IF NOT EXISTS gate_events_feature_id_idx ON gate_events(feature_id);

ALTER TABLE features ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_use_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace members manage features"
  ON features FOR ALL USING (workspace_id = get_my_workspace_id());

CREATE POLICY "workspace members manage feature_use_cases"
  ON feature_use_cases FOR ALL
  USING (feature_id IN (SELECT id FROM features WHERE workspace_id = get_my_workspace_id()));

CREATE POLICY "workspace members see gate_events"
  ON gate_events FOR SELECT
  USING (feature_id IN (SELECT id FROM features WHERE workspace_id = get_my_workspace_id()));
