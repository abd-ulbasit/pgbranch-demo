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

## How this repo is wired

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

## Try a migration against the PR branch by hand

```sh
PGHOST=localhost PGPORT=6432 PGUSER=postgres \
PGDATABASE='postgres@pr-1' ./scripts/migrate.sh
```

## Run the app

```sh
DATABASE_URL='postgres://postgres:pw@localhost:6432/postgres@pr-1' go run .
```
