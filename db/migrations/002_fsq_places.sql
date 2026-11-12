CREATE TABLE IF NOT EXISTS fsq_places (
  fsq_place_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT,
  neighborhood TEXT,
  locality TEXT NOT NULL,
  region TEXT,
  country TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  date_refreshed TEXT,
  imported_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'new',
  retention_until TEXT
);
CREATE INDEX IF NOT EXISTS idx_fsq_places_neighborhood ON fsq_places(neighborhood);
CREATE INDEX IF NOT EXISTS idx_fsq_places_category ON fsq_places(category);
CREATE INDEX IF NOT EXISTS idx_fsq_places_name ON fsq_places(name);
CREATE TABLE IF NOT EXISTS fsq_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_at TEXT NOT NULL,
  source_file TEXT NOT NULL,
  seen_count INTEGER NOT NULL,
  accepted_count INTEGER NOT NULL,
  rejected_count INTEGER NOT NULL
);
