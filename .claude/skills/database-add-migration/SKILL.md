---
name: database-add-migration
description: Scaffold an idempotent migration script and its corresponding rollback script for a database schema change (tables, columns, indexes, views, etc.)
---

# Add Migration

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `database-migrations.md` — idempotency guards, naming convention, and rollback requirements
- `database-coding-standards.md` — naming conventions and data type standards

---

Scaffold a pair of migration scripts (forward + rollback) for a database schema change.

## Steps

1. Ask the user what schema change is needed (add column, add index, alter table, create view, etc.).
2. Determine the next sequence number by checking existing migration files in the `database/migrations/` folder.
3. Create the forward migration script with `IF NOT EXISTS` guards using the appropriate template below.
4. Create the corresponding rollback script with `IF EXISTS` guards.
5. Tell the user the migration must be applied manually: dev → staging → production.

## Add Column Template

```sql
-- =============================================
-- Migration: {{SequenceNumber}}_{{Description}}
-- Author:    [Author]
-- Date:      [YYYY-MM-DD]
-- Purpose:   [What this migration does]
-- =============================================

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.{{TableName}}')
    AND name = '{{ColumnName}}'
)
BEGIN
    ALTER TABLE dbo.{{TableName}}
    ADD {{ColumnName}} {{DataType}} {{Nullability}} {{Default}};
END
GO
```

## Add View Template

```sql
-- =============================================
-- Migration: {{SequenceNumber}}_Create_vw_{{ViewName}}
-- Author:    [Author]
-- Date:      [YYYY-MM-DD]
-- Purpose:   [What this view exposes and why]
-- =============================================

CREATE OR ALTER VIEW dbo.vw_{{ViewName}}
AS
    SELECT
        t.Id,
        t.Column1,
        t.Column2,
        t.CreatedAt,
        t.UpdatedAt
    FROM dbo.{{TableName}} t
    WHERE t.IsDeleted = 0;
GO
```

For indexed views, add `WITH SCHEMABINDING` and a unique clustered index after creation.

## Rollback Template

```sql
-- =============================================
-- Rollback:  {{SequenceNumber}}_{{Description}}
-- Author:    [Author]
-- Date:      [YYYY-MM-DD]
-- Purpose:   Reverts: [What the forward migration did]
-- =============================================

-- Column rollback
IF EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.{{TableName}}')
    AND name = '{{ColumnName}}'
)
BEGIN
    ALTER TABLE dbo.{{TableName}}
    DROP COLUMN {{ColumnName}};
END
GO

-- View rollback
IF EXISTS (SELECT 1 FROM sys.views WHERE name = '{{ViewName}}' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP VIEW dbo.vw_{{ViewName}};
END
GO
```

## Rules

- File naming format: `YYYYMMDD_NNN_Description.sql` and `YYYYMMDD_NNN_Description_Rollback.sql`
- Every migration must be idempotent — wrap all structural changes in `IF NOT EXISTS` / `IF EXISTS` guards
- Every forward migration must have a corresponding rollback script
- One logical change per migration — do not combine unrelated changes
- Never mix schema changes with data changes in the same migration
- Never include hardcoded credentials, connection strings, or environment-specific values
- Include a header comment with author, date, and description
- Data migrations (backfills) go in separate files, chunked into batches with `WHERE` clauses to avoid reprocessing
- Views: prefix with `vw_`, use `CREATE OR ALTER VIEW`, filter soft-deleted records by default, never use `SELECT *`
