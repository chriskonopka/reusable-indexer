---
name: database-add-table
description: Scaffold a new SQL Server table with standard audit columns, primary key, indexes, and soft delete support
---

# Add Table

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `database-coding-standards.md` — naming conventions, required audit columns, data types, and soft delete rules
- `database-migrations.md` — idempotency requirements and rollback script standards

---

Scaffold a new table in the `database/` project with all required columns and constraints.

## Steps

1. Ask the user for the table name (PascalCase, plural) and the business columns needed.
2. Check whether a migration or script for this table already exists. If it does, stop and tell the user.
3. Create a migration script using the template below.
4. Create a corresponding rollback script.
5. If the table has foreign keys, create non-clustered indexes for each FK column.
6. Tell the user the migration must be applied manually: dev → staging → production.

## Template

```sql
-- =============================================
-- Author:      [Author]
-- Create Date: [YYYY-MM-DD]
-- Description: Create {{TableName}} table
-- =============================================

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '{{TableName}}' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.{{TableName}}
    (
        Id              INT IDENTITY(1,1) NOT NULL,
        -- Business columns go here
        CreatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedBy       NVARCHAR(256) NOT NULL,
        UpdatedBy       NVARCHAR(256) NOT NULL,
        IsDeleted       BIT NOT NULL DEFAULT 0,
        DeletedAt       DATETIME2 NULL,

        CONSTRAINT PK_{{TableName}} PRIMARY KEY CLUSTERED (Id)
    );
END
GO
```

## Rollback Template

```sql
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = '{{TableName}}' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP TABLE dbo.{{TableName}};
END
GO
```

## Rules

- Replace `{{TableName}}` with the actual table name (PascalCase, plural)
- Every table must include the full set of audit columns (`CreatedAt`, `UpdatedAt`, `CreatedBy`, `UpdatedBy`, `IsDeleted`, `DeletedAt`)
- Use `INT IDENTITY(1,1)` as the clustered primary key unless the user specifies otherwise
- Use `NVARCHAR` for user-facing text columns, `VARCHAR` only for provably ASCII-only data
- Define all columns as `NOT NULL` unless the user specifies a column is nullable
- Use `DATETIME2` for all date/time columns — never `DATETIME`
- Add foreign key constraints with explicit `ON DELETE` / `ON UPDATE` actions
- Add a non-clustered index for every foreign key column
- Migration files follow the naming format: `YYYYMMDD_NNN_Create{{TableName}}.sql`
