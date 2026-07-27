// POST /api/signup {email, full_name} — idempotent signup (PR #1's feature).
// Writes land only in THIS deployment's database branch.
const { pool, branch } = require('./_db');
const { live, gone, dbError } = require('./_demo');

module.exports = async (req, res) => {
  if (!live) return gone(res);
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const { email, full_name } = req.body || {};
  if (!email || !full_name) {
    res.status(400).json({ error: 'email and full_name required' });
    return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (email, full_name) VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [email, full_name],
    );
    res.status(200).json({ id: rows[0].id, database_branch: branch });
  } catch (err) {
    // a failed INSERT is a server-side fault, not an unreachable branch
    dbError(res, err, branch, 500);
  }
};
