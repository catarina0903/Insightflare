-- Migration number: 0001 	 2026-02-01T14:34:31.526Z

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  source TEXT,
  channel TEXT,
  urgent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX feedback_urgent_idx ON feedback (urgent);
CREATE INDEX feedback_created_at_idx ON feedback (created_at);
