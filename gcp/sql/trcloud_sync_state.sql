CREATE TABLE IF NOT EXISTS trcloud_sync_documents (
  doc_key TEXT PRIMARY KEY,
  doc_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  source_created_at TIMESTAMPTZ,
  source_updated_at TIMESTAMPTZ,
  issue_date DATE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trcloud_sync_documents_type_updated
  ON trcloud_sync_documents (doc_type, source_updated_at);

CREATE TABLE IF NOT EXISTS trcloud_sync_runs (
  run_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  doc_types TEXT[] NOT NULL,
  manifest_uri TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
);
