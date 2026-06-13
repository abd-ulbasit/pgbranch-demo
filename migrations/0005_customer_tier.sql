-- Customer loyalty tiers.
ALTER TABLE users ADD COLUMN tier text NOT NULL DEFAULT 'standard'
    CHECK (tier IN ('standard','silver','gold'));
CREATE INDEX users_tier_idx ON users (tier);
