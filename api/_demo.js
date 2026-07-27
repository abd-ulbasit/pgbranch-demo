// One place that knows whether this deployment still has a pgoverlay cluster
// behind it, and how to answer when it does not.
//
// The demo ran on a single-node EKS cluster in ap-south-1. That cluster was
// torn down in June 2026 — the proxy's LoadBalancer DNS name is NXDOMAIN now.
// So every data endpoint here answers 410 Gone by default and points at the
// recorded evidence, instead of opening a doomed connection and echoing the
// Postgres driver's error back to whoever loaded the page.
//
// This is env-gated rather than deleted so the wiring stays reusable: fork
// the repo, point PGOVERLAY_HOST / PGOVERLAY_PORT / PGPASSWORD at your own
// pgoverlay install, set DEMO_LIVE=true, and these endpoints work again.

const REPO = 'https://github.com/abd-ulbasit/pgoverlay-demo';

const live = process.env.DEMO_LIVE === 'true';

// 410, not 503: the cluster is not overloaded or briefly down, it is
// intentionally and permanently gone. A 503 invites a retry that can never
// succeed.
function gone(res) {
  res.status(410).json({
    status: 'decommissioned',
    message:
      'The demo cluster behind this endpoint was torn down in June 2026, so ' +
      'there is no database branch left to answer from. The recorded run in ' +
      'PR #1 — a migration that passed locally and failed against a masked ' +
      'clone of production — is the evidence this demo exists to show.',
    evidence: `${REPO}/pull/1`,
    source: REPO,
  });
}

// Never echo the driver's error to the client. It carries internal
// infrastructure detail: before this change every endpoint returned
// "getaddrinfo ENOTFOUND <account-specific AWS ELB hostname>" to anyone who
// clicked a link on the landing page. Log it, return something actionable.
function dbError(res, err, branch, status = 503) {
  console.error('database error:', err.message);
  res.status(status).json({
    ok: false,
    database_branch: branch,
    error: 'database error',
  });
}

module.exports = { live, gone, dbError };
