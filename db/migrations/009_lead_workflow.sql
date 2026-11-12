CREATE TABLE IF NOT EXISTS lead_workflow (
  source TEXT NOT NULL CHECK (source IN ('overture', 'fsq')),
  source_id TEXT NOT NULL,
  place_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (place_status IN ('unchecked', 'confirmed', 'not_found')),
  website_review TEXT NOT NULL DEFAULT 'unchecked' CHECK (website_review IN ('unchecked', 'no_site', 'has_site')),
  contact_status TEXT NOT NULL DEFAULT 'new' CHECK (contact_status IN ('new', 'to_contact', 'contacted', 'replied', 'proposal', 'won', 'lost')),
  last_contact_at TEXT,
  next_action_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_workflow_next_action ON lead_workflow(next_action_at);
