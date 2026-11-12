ALTER TABLE freelancer_requests ADD COLUMN locale_tag TEXT NOT NULL DEFAULT 'unknown';
CREATE INDEX IF NOT EXISTS idx_freelancer_requests_locale ON freelancer_requests(locale_tag);
