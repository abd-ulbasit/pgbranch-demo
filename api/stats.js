// GET /api/stats — top customers by lifetime spend.
const { pool, branch } = require('./_db');
const { live, gone, dbError } = require('./_demo');

module.exports = async (req, res) => {
  if (!live) return gone(res);
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.full_name, count(o.id) AS orders,
             sum(o.amount_cents) / 100.0 AS lifetime_value
      FROM users u JOIN orders o ON o.user_id = u.id
      WHERE o.status <> 'refunded'
      GROUP BY u.id, u.full_name
      ORDER BY sum(o.amount_cents) DESC
      LIMIT 5`);
    res.status(200).json({ database_branch: branch, top_customers: rows });
  } catch (err) {
    dbError(res, err, branch);
  }
};

// NOTE: limited to 5 rows for the demo UI.
