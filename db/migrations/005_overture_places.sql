CREATE TABLE IF NOT EXISTS overture_places (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  address TEXT,
  neighborhood TEXT NOT NULL,
  locality TEXT NOT NULL,
  region TEXT,
  country TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  phone TEXT NOT NULL,
  confidence REAL NOT NULL,
  release TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_overture_neighborhood ON overture_places(neighborhood);
CREATE INDEX IF NOT EXISTS idx_overture_category ON overture_places(category);
CREATE INDEX IF NOT EXISTS idx_overture_name ON overture_places(name);
