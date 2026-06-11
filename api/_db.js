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
  // serverless + tunneled TCP: don't keep idle connections around
  idleTimeoutMillis: 1000,
});

// An idle pooled connection dying (branch reset, tunnel drop) emits 'error'
// on the pool; unhandled, that crashes the function process. Log and let the
// next query open a fresh connection instead.
pool.on('error', (err) => console.error('idle client error', err.message));

module.exports = { pool, branch };
