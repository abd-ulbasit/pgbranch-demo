-- Signup must be idempotent: INSERT ... ON CONFLICT (email) needs a
-- unique constraint on users.email.
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
