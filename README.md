# pgbranch-demo: branch-per-PR databases in a real workflow

A small orders API used to demonstrate [pgbranch](https://github.com/abd-ulbasit/pgbranch)
in day-to-day development: **every pull request automatically gets its own
disposable copy of the production database**, created in ~2 seconds via
copy-on-write, with PII masked before anyone can connect.

## Why

The classic failure mode this demo reproduces: a schema migration that
passes on your empty local database but **fails against real production
data** (duplicate rows, NULLs, weird encodings — things test fixtures never
have). You find out during the deploy. With pgbranch you find out on the PR,
against a masked clone of prod, minutes after pushing.

## How this repo is wired (current: EKS)

The whole pgbranch stack now runs **in a single-node EKS cluster**
([Terraform](https://github.com/abd-ulbasit/pgbranch/tree/main/deploy/terraform/eks),
[walkthrough](https://github.com/abd-ulbasit/pgbranch/blob/main/docs/eks.md)):
branchd, the webhook service, the "production" Postgres, and every branch pod.

- GitHub posts `pull_request` webhooks **directly** to the in-cluster
  webhook service behind a LoadBalancer (HMAC-verified) — no forwarders.
- CI (`pr-db-check.yml`) and Vercel reach branches through the proxy's
  **stable LoadBalancer DNS**, set once: `PGBRANCH_PROXY_HOST` /
  `PGBRANCH_HOST` + `PGBRANCH_PORT`.
- The Vercel app still derives its branch from `VERCEL_GIT_PULL_REQUEST_ID`
  — zero per-PR configuration anywhere.

[PR #3](https://github.com/abd-ulbasit/pgbranch-demo/pull/3) ran this
wiring end-to-end (webhook → branch pod → CI migration → preview on the
branch → merge → destroy). Three pgbranch bugs were found and fixed doing
it — see the [EKS doc](https://github.com/abd-ulbasit/pgbranch/blob/main/docs/eks.md#what-deploying-here-taught-us-three-real-bugs).

## How it was wired originally (zero-infra: laptop + tunnels)

1. A `pgbranch` source named `prod` is seeded from the production Postgres
   (`pgb source add prod ...`), with a masking script that scrubs PII
   deterministically.
2. The `pgbranch-github` webhook service receives this repo's `pull_request`
   events:
   - PR opened → `pgb branch create pr-<N> --from prod` (~2s) and a comment
     with the connection string appears on the PR
   - new commits pushed → the branch is reset to a pristine prod snapshot
   - PR closed/merged → the branch is destroyed
3. CI (`.github/workflows/pr-db-check.yml`) runs `scripts/migrate.sh`
   against the PR's branch through the pgbranch proxy — the database name
   `postgres@pr-<N>` routes to the right branch.

## What happened in [PR #1](https://github.com/abd-ulbasit/pgbranch-demo/pull/1)

A real, recorded run of this workflow (read the PR comments):

1. The PR adds idempotent signup, which needs `UNIQUE (email)`. The
   migration **passed on an empty local dev database**.
2. Opening the PR created branch `pr-1` — a masked CoW clone of an 80k-user,
   400k-order production database — in seconds, and commented the
   connection string.
3. Running the same migration against `postgres@pr-1` **failed**: production
   had 37 legacy duplicate signups no dev fixture ever contained. The error
   leaked only a *masked* email.
4. The fix (merge duplicates, repoint orders, then add the constraint) was
   pushed; the branch auto-reset to a pristine snapshot and the migration
   went green with all 400k orders preserved.
5. Merging the PR destroyed the branch. Production was never touched.

That is the entire pitch: the deploy-time surprise moved to the PR.

## Try a migration against the PR branch by hand

```sh
PGHOST=localhost PGPORT=6432 PGUSER=postgres \
PGDATABASE='postgres@pr-1' ./scripts/migrate.sh
```

## Run the app

```sh
DATABASE_URL='postgres://postgres:pw@localhost:6432/postgres@pr-1' go run .
```

## Replaying the zero-infra variant locally

`scripts/tunnel-up.sh` restarts the free public TCP tunnel and rewires
GitHub + Vercel to it — only needed for the no-infra setup below.

Everything ran on one laptop (Docker via Colima); GitHub reached it through
a [smee.io](https://smee.io) webhook proxy:

```sh
# 1. a "production" postgres with realistic data (incl. duplicate emails)
docker run -d --name pgdemo-prod -e POSTGRES_PASSWORD=... -p 5499:5432 postgres:16
#    + add "host replication all all scram-sha-256" to its pg_hba.conf

# 2. pgbranch control plane
PGBRANCH_TOKEN=... branchd --api-addr :7070 --pg-addr :6432
pgb source add prod --host host.docker.internal --port 5499 --pg-version 16
pgb source set-mask prod mask-pii.sql        # deterministic PII masking

# 3. branch-per-PR webhook service + forwarder
GHOOK_WEBHOOK_SECRET=... GHOOK_SOURCE=prod \
GHOOK_PGBRANCH_SERVER=http://localhost:7070 GHOOK_PGBRANCH_TOKEN=... \
GHOOK_GITHUB_TOKEN=$(gh auth token) GHOOK_PROXY_HOST=localhost:6432 \
GHOOK_REPOS=<owner>/<repo> GHOOK_RESET_ON_PUSH=true pgbranch-github
npx smee-client --url https://smee.io/<channel> --target http://localhost:8080/webhook

# 4. repo webhook: pull_request events -> the smee channel (same secret)
```
