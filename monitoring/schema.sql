CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  check_url TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  expected_interval_seconds INTEGER NOT NULL DEFAULT 300,
  heartbeat_at TEXT
);

CREATE TABLE IF NOT EXISTS checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL REFERENCES services(id),
  state TEXT NOT NULL CHECK (state IN ('live','offline','degraded','unknown')),
  checked_at TEXT NOT NULL,
  latency_ms INTEGER,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS checks_service_time ON checks(service_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service_id TEXT NOT NULL REFERENCES services(id),
  state TEXT NOT NULL CHECK (state IN ('open','resolved')),
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  last_notified_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_incident_per_service ON incidents(service_id) WHERE state = 'open';

UPDATE services SET enabled=0 WHERE id IN ('free-bot','mtx-bot','mirai-bot');

INSERT OR IGNORE INTO services (id, name, kind, check_url, expected_interval_seconds) VALUES
 ('website','MTXProject Website','static','',300),
 ('better-api','Better-Api','http','',300),
 ('mtxallapi','MTXALLAPI','http','',300),
 ('messenger-bot','Messenger Bot','heartbeat',NULL,300);
