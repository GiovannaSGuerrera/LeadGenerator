CREATE TABLE IF NOT EXISTS pncp_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  request_type TEXT NOT NULL,
  organization TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  budget REAL,
  published_at TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_name TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pncp_requests_deadline ON pncp_requests(deadline_at DESC);
CREATE INDEX IF NOT EXISTS idx_pncp_requests_type ON pncp_requests(request_type);
