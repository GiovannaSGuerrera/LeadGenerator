ALTER TABLE fsq_places ADD COLUMN phone TEXT;
CREATE INDEX IF NOT EXISTS idx_fsq_places_phone ON fsq_places(phone) WHERE phone IS NOT NULL;
