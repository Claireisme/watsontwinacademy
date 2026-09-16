-- Keep UUIDs for relationships and idempotency; existing references remain valid.
ALTER TABLE enquiries ADD COLUMN reference TEXT CHECK(reference IS NULL OR (length(reference)=9 AND reference GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][a-z][a-z][a-z]'));
CREATE UNIQUE INDEX idx_enquiries_reference ON enquiries(reference);
