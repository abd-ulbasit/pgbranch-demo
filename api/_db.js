// Each Vercel preview deployment talks to its OWN pgbranch database branch.
// No per-PR secrets, no injection step: Vercel already exposes the PR number
// (VERCEL_GIT_PULL_REQUEST_ID), and the pgbranch proxy routes by database
// name — so the connection is fully derived from three static env vars
// (PGBRANCH_HOST, PGBRANCH_PORT, PGPASSWORD) plus the PR number.
const { Pool } = require('pg');

const prNumber = process.env.VERCEL_GIT_PULL_REQUEST_ID;
const branch = prNumber
  ? `pr-${prNumber}`
  : process.env.PGBRANCH_DEFAULT_BRANCH || 'main-stable';

const pool = new Pool({
  host: process.env.PGBRANCH_HOST,
  port: Number(process.env.PGBRANCH_PORT || 6432),
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD,
  database: `postgres@${branch}`,
  max: 3,
  connectionTimeoutMillis: 8000,
});

module.exports = { pool, branch };
