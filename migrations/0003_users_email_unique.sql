-- Signup must be idempotent: INSERT ... ON CONFLICT (email) needs a
-- unique constraint on users.email.
--
-- Production has legacy duplicate signups (same email, multiple rows —
-- found by running this migration against the PR's pgoverlay branch).
-- Merge them first: keep the oldest account, repoint its orders.
UPDATE orders o SET user_id = k.keep_id
FROM (SELECT email, min(id) AS keep_id
      FROM users GROUP BY email HAVING count(*) > 1) k
JOIN users u ON u.email = k.email AND u.id <> k.keep_id
WHERE o.user_id = u.id;

DELETE FROM users u
USING (SELECT email, min(id) AS keep_id
       FROM users GROUP BY email HAVING count(*) > 1) k
WHERE u.email = k.email AND u.id <> k.keep_id;

ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
