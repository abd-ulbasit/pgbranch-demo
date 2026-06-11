// GET /api/db — which database branch is this deployment on, and what's in it?
const { pool, branch } = require('./_db');

module.exports = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT (SELECT count(*) FROM users)  AS users,
             (SELECT count(*) FROM orders) AS orders,
             (SELECT count(*) FROM users u
              WHERE EXISTS (SELECT 1 FROM users d
                            WHERE d.email = u.email AND d.id <> u.id)) AS rows_with_duplicate_email,
             EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conname = 'users_email_key') AS unique_email_constraint,
             (SELECT coalesce(json_agg(v ORDER BY v), '[]'::json)
              FROM (SELECT version AS v FROM schema_migrations) m) AS migrations`);
    res.status(200).json({ database_branch: branch, ...rows[0] });
  } catch (err) {
    res.status(503).json({ database_branch: branch, error: err.message });
  }
};
