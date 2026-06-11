// GET /api/health — liveness + database-branch connectivity in one probe.
const { pool, branch } = require('./_db');

module.exports = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT current_database() AS db, now() AS at,
              pg_postmaster_start_time() AS branch_started`);
    res.status(200).json({ ok: true, database_branch: branch, ...rows[0] });
  } catch (err) {
    res.status(503).json({ ok: false, database_branch: branch, error: err.message });
  }
};
