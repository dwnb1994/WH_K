CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS trcloud_sync_state (
  doc_type        TEXT PRIMARY KEY,
  last_synced_at  TIMESTAMPTZ,
  last_run_id     TEXT,
  record_count    INT DEFAULT 0,
  stale_at        TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO trcloud_sync_state (doc_type)
VALUES ('gr'), ('mr'), ('inc'), ('po')
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS open_documents (
  doc_type         TEXT NOT NULL,
  doc_id           TEXT NOT NULL,
  issue_date       DATE,
  status           TEXT,
  list_hash        TEXT,
  first_open_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doc_type, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_open_docs_type ON open_documents (doc_type);

CREATE TABLE IF NOT EXISTS trcloud_push_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  our_id           TEXT NOT NULL,
  doc_type         TEXT NOT NULL,
  trcloud_doc_id   TEXT,
  pushed_at        TIMESTAMPTZ DEFAULT NOW(),
  pull_status      TEXT NOT NULL DEFAULT 'PENDING'
                   CHECK (pull_status IN ('PENDING', 'PULLED', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_push_log_pull
  ON trcloud_push_log (pull_status)
  WHERE pull_status = 'PENDING';
