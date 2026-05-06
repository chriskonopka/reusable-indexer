# Migration Standards — SQL Server / Database

## Deployment Order

- Applied manually: dev → staging → production
- Schema changes reviewed before production application
- Migrations are not run on startup and not run in CI/CD

## Idempotency

- Every migration must be idempotent — use `IF NOT EXISTS` guards for all structural changes
- Re-running a migration must not fail or produce duplicates

## Rollback Scripts

- Every structural change must have a corresponding rollback script
- Rollback scripts must also be idempotent

## Naming

- Sequentially numbered or timestamped
- Format: `YYYYMMDD_NNN_Description.sql` (e.g., `20260401_001_AddDocumentsTable.sql`)
- Rollback files: `YYYYMMDD_NNN_Description_Rollback.sql`

## Content Rules

- One logical change per migration (e.g., one table, one index addition)
- Never mix schema changes with data changes in the same migration
- Include a header comment with author, date, and description
- Never include hardcoded credentials, connection strings, or environment-specific values

## Data Migrations

- Data migrations (backfills, transforms) are separate files from schema migrations
- Always include a `WHERE` clause to avoid processing already-migrated rows
- Chunk large data migrations into batches to avoid lock escalation
