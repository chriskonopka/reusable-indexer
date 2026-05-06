---
name: database-add-audit-trigger
description: Scaffold an audit trigger and audit table to track changes to sensitive data in a SQL Server table
---

# Add Audit Trigger

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `database-coding-standards.md` — audit table requirements, append-only rules, and naming conventions

---

Scaffold an audit trigger that logs all inserts, updates, and deletes on a specified table to an append-only audit table.

## Steps

1. Ask the user which table needs auditing.
2. Check whether an audit table and trigger already exist for this table. If they do, stop and tell the user.
3. Create the audit table using the template below.
4. Create the `AFTER INSERT, UPDATE, DELETE` trigger.
5. Wrap everything in a migration script with idempotency guards.
6. Create a corresponding rollback script.
7. Tell the user the migration must be applied manually: dev → staging → production.

## Audit Table Template

```sql
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '{{TableName}}_Audit' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.{{TableName}}_Audit
    (
        AuditId         INT IDENTITY(1,1) NOT NULL,
        Action          NVARCHAR(10) NOT NULL,  -- INSERT, UPDATE, DELETE
        RecordId        INT NOT NULL,
        OldValues       NVARCHAR(MAX) NULL,
        NewValues       NVARCHAR(MAX) NULL,
        ChangedBy       NVARCHAR(256) NOT NULL DEFAULT SYSTEM_USER,
        ChangedAt       DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_{{TableName}}_Audit PRIMARY KEY CLUSTERED (AuditId)
    );

    -- Audit tables are append-only — deny UPDATE and DELETE
    DENY UPDATE, DELETE ON dbo.{{TableName}}_Audit TO public;
END
GO
```

## Trigger Template

```sql
CREATE OR ALTER TRIGGER dbo.TR_{{TableName}}_Audit
ON dbo.{{TableName}}
AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;

    -- Inserts
    INSERT INTO dbo.{{TableName}}_Audit (Action, RecordId, NewValues)
    SELECT
        'INSERT',
        i.Id,
        (SELECT i.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM inserted i
    LEFT JOIN deleted d ON i.Id = d.Id
    WHERE d.Id IS NULL;

    -- Updates
    INSERT INTO dbo.{{TableName}}_Audit (Action, RecordId, OldValues, NewValues)
    SELECT
        'UPDATE',
        i.Id,
        (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT i.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM inserted i
    INNER JOIN deleted d ON i.Id = d.Id;

    -- Deletes
    INSERT INTO dbo.{{TableName}}_Audit (Action, RecordId, OldValues)
    SELECT
        'DELETE',
        d.Id,
        (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM deleted d
    LEFT JOIN inserted i ON d.Id = i.Id
    WHERE i.Id IS NULL;
END
GO
```

## Rules

- Replace `{{TableName}}` with the actual table name
- Audit tables are append-only — enforce with `DENY UPDATE, DELETE`
- The trigger must capture all three operations: `INSERT`, `UPDATE`, `DELETE`
- Store old and new values as JSON for flexibility
- `ChangedBy` defaults to `SYSTEM_USER` — the application layer should set the session context if a specific user identity is needed
- Never add business logic to audit triggers — they only log changes
- Audit triggers must not throw errors that would roll back the original operation unless data integrity is at risk
