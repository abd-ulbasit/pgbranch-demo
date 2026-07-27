// GET /api/whoami — proves which database branch THIS deployment uses,
// from its very first build (branch derived from VERCEL_GIT_COMMIT_REF).
const { pool, branch } = require('./_db');
const { live, gone, dbError } = require('./_demo');

module.exports = async (req, res) => {
  if (!live) return gone(res);
  try {
    const { rows } = await pool.query(
      `SELECT (SELECT count(*) FROM users) AS users,
              (SELECT email FROM users WHERE id = 5) AS masked_sample`);
    res.status(200).json({
      database_branch: branch,
      git_ref: process.env.VERCEL_GIT_COMMIT_REF || null,
      vercel_env: process.env.VERCEL_ENV || null,
      ...rows[0],
    });
  } catch (err) {
    dbError(res, err, branch);
  }
};
