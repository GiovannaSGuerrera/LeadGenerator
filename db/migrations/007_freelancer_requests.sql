CREATE TABLE IF NOT EXISTS freelancer_requests (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  request_type TEXT NOT NULL,
  budget_text TEXT,
  published_at TEXT NOT NULL,
  source_url TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_freelancer_requests_published ON freelancer_requests(published_at DESC);
