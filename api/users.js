// GET /api/users — signup volume for the last 30 days.
const { pool, branch } = require('./_db');

module.exports = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE created_at > now() - interval '30 days') AS last_30_days
      FROM users`);
    res.status(200).json({ database_branch: branch, ...rows[0] });
  } catch (err) {
    res.status(503).json({ database_branch: branch, error: err.message });
  }
};
