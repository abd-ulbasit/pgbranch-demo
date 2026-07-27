// Each Vercel preview deployment talks to its OWN pgoverlay database branch.
// No per-PR secrets, no injection step: Vercel already exposes the PR number
// (VERCEL_GIT_PULL_REQUEST_ID), and the pgoverlay proxy routes by database
// name — so the connection is fully derived from three static env vars
// (PGOVERLAY_HOST, PGOVERLAY_PORT, PGPASSWORD) plus the PR number.
const { Pool } = require('pg');

// pgoverlay names PR branches after the git ref (sanitized the same way),
// and VERCEL_GIT_COMMIT_REF is present from the very first preview build —
// no PR-association timing race, nothing injected per deployment.
const sanitize = (ref) =>
  ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 41).replace(/-+$/, '');

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const isPreview = process.env.VERCEL_ENV === 'preview';
const branch = isPreview && ref
  ? sanitize(ref)
  : process.env.PGOVERLAY_DEFAULT_BRANCH || 'main-stable';

const pool = new Pool({
  host: process.env.PGOVERLAY_HOST,
  port: Number(process.env.PGOVERLAY_PORT || 6432),
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
