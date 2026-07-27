# pgbranch-demo: branch-per-PR databases in a real workflow

A small orders API built to demonstrate [pgbranch](https://github.com/abd-ulbasit/pgbranch)
in day-to-day development: every pull request gets its own disposable
copy-on-write copy of the production database, with PII masked before anyone
can connect.

> **This demo is archived — read [PR #1](https://github.com/abd-ulbasit/pgbranch-demo/pull/1) instead.**
>
> The single-node EKS cluster that ran the pgbranch stack was decommissioned
> in June 2026. The hosted app, the branch databases and the LoadBalancers
> are gone, so there is nothing live to click: the `/api` endpoints answer
> `410 Gone` and the deployed page says so.
>
> **What survives is the thing worth showing.** PR #1 is a complete recorded
> run of the workflow, comments and all. The point of this repo was never the
> uptime — it was that a migration failed on a PR instead of in production,
> and you can still read exactly how.
>
> [pgbranch](https://github.com/abd-ulbasit/pgbranch) itself is a separate,
> maintained repo. Only this demo's hosting is retired.

## Why

The classic failure mode this demo reproduces: a schema migration that
passes on your empty local database but **fails against real production
data** (duplicate rows, NULLs, weird encodings — things test fixtures never
have). You find out during the deploy. With pgbranch you find out on the PR,
against a masked clone of prod, minutes after pushing.

## The recorded run: [PR #1](https://github.com/abd-ulbasit/pgbranch-demo/pull/1)

This is the evidence. It is two comments on a merged pull request, and it
takes about a minute to read.

1. The PR adds idempotent signup, which needs `UNIQUE (email)`. The migration
   **passed on an empty local dev database**.
2. Opening the PR created branch `pr-1` — a masked copy-on-write clone of a
   production database with ~80,000 users and ~400,000 orders — and commented
   the connection string on the PR.
3. Running the same migration against `postgres@pr-1` **failed**, because
   production had 37 legacy duplicate signups no dev fixture ever contained:

   ```
   apply 0003_users_email_unique
   ERROR:  could not create unique index "users_email_key"
   DETAIL:  Key (email)=(u09f343255921@masked.local) is duplicated.
   ```

   Note the address in the error is *masked* — the branch never held real PII.
4. The fix (merge duplicates, repoint their orders, then add the constraint)
   was pushed. The branch auto-reset to a pristine snapshot and the migration
   went green with every order preserved:

   ```
   users after dedupe: 80000   orders preserved: 400000
   orphaned orders: 0          remaining dup emails: 0
   ```
5. Merging the PR destroyed the branch. Production was never touched.

That is the entire pitch: the deploy-time surprise moved to the PR.

[PR #3](https://github.com/abd-ulbasit/pgbranch-demo/pull/3) is a second
recorded run, useful because its CI failed twice on the way to green.

## How it was wired

Kept because the wiring, not the deployment, is the reusable part. Both
workflow files are still in `.github/workflows/`, now `workflow_dispatch`
only — they cannot run against the cluster that no longer exists.

### EKS (the final setup)

The whole pgbranch stack ran in a single-node EKS cluster
([Terraform](https://github.com/abd-ulbasit/pgbranch/tree/main/deploy/terraform/eks),
[walkthrough](https://github.com/abd-ulbasit/pgbranch/blob/main/docs/eks.md)):
branchd, the webhook service, the "production" Postgres, and every branch pod.

- GitHub posted `pull_request` webhooks **directly** to the in-cluster webhook
  service behind a LoadBalancer (HMAC-verified) — no forwarders.
- CI (`pr-db-check.yml`) and the deployed app reached branches through the
  proxy's LoadBalancer DNS name.
- The app derived its branch from its own git ref, so there was zero per-PR
  configuration anywhere.

Deploying it surfaced three real pgbranch bugs, written up in the
[EKS doc](https://github.com/abd-ulbasit/pgbranch/blob/main/docs/eks.md#what-deploying-here-taught-us-three-real-bugs).

### The earlier zero-infra variant (laptop + tunnels)

Everything ran on one laptop (Docker via Colima), with GitHub reaching it
through a [smee.io](https://smee.io) webhook proxy. `scripts/tunnel-up.sh`
restarted the public TCP tunnel and rewired GitHub to it.

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

In this setup the webhook named branches `pr-<N>` (as in PR #1); the later
EKS setup named them after the git branch instead.

## Running it against your own pgbranch

Nothing here is pinned to the dead cluster. Point it at a pgbranch install:

```sh
# the API endpoints
DEMO_LIVE=true \
PGBRANCH_HOST=<proxy host> PGBRANCH_PORT=6432 PGPASSWORD=<pw> \
  vercel dev            # or any Node host; /api/*.js are plain handlers

# migrations, by hand, against one branch
PGHOST=<proxy host> PGPORT=6432 PGUSER=postgres \
PGDATABASE='postgres@pr-1' ./scripts/migrate.sh

# the Go app
DATABASE_URL='postgres://postgres:pw@<proxy host>:6432/postgres@pr-1' go run .
```

`DEMO_LIVE` is the switch that turns the `410 Gone` responses back into real
queries; without it the endpoints refuse to pretend they have a database.

To restore the CI integration, set `vars.PGBRANCH_PROXY_HOST` and
`secrets.PGBRANCH_PG_PASSWORD` and put the `pull_request:` trigger back in
`.github/workflows/pr-db-check.yml`.

## Layout

| path | what |
|---|---|
| `api/` | the serverless handlers (`_db.js` derives the branch from the git ref) |
| `main.go` | the same app as a plain Go server |
| `migrations/` | including `0003_users_email_unique.sql`, the one that failed |
| `scripts/migrate.sh` | the migration runner CI invoked against each branch |
| `.github/workflows/` | the branch-per-PR CI and preview wiring |

## Licence

Apache-2.0, same as pgbranch. See [LICENSE](LICENSE).
