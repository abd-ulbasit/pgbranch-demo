// GET /api/report — monthly revenue rollup (feat/orders-report).
const { pool, branch } = require('./_db');
module.exports = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT date_trunc('month', created_at)::date AS month,
             sum(amount_cents) AS total_cents, count(*) AS orders
      FROM orders WHERE status <> 'refunded'
      GROUP BY 1 ORDER BY 1 DESC LIMIT 6`);
    res.status(200).json({ database_branch: branch, months: rows });
  } catch (err) {
    res.status(503).json({ database_branch: branch, error: err.message });
  }
};
