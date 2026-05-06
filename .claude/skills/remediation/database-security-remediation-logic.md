# Backend Security Remediation Logic — SQL Server / Database

## Auto-Fixable Issues (Apply + Ask Approval)

### Obvious Fixes (one-liner)

- **Missing row-level access filter** — add `WHERE OwnerId = @UserId` (or role-based filter) to user-scoped queries
- **Hardcoded credentials** — remove entirely, manage via Azure env vars or Managed Identity. Flag for credential rotation
- **Bare `sp_` prefix** — rename to `usp_` or `_sp_` (SQL Server searches master DB first — name hijacking risk)
- **xp_cmdshell usage** — remove entirely, disable at server level. Flag as **Critical**
- **Hard delete → soft delete** — change to `UPDATE SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME()`
- **TRUSTWORTHY enabled** — set to OFF. Document justification if required
- **EXECUTE AS with broad scope** — scope to specific procedures with `WITH EXECUTE AS`, not session-level
- **OPENROWSET with dynamic connection** — remove or replace with fixed linked server

### Non-Obvious Fixes (with pattern)

**Dynamic SQL → parameterized:**
```sql
-- Bad: EXEC('SELECT * FROM Users WHERE Name = ''' + @Name + '''');
EXEC sp_executesql N'SELECT * FROM Users WHERE Name = @Name', N'@Name NVARCHAR(100)', @Name;
```

**ORDER BY injection — allowlist:**
```sql
DECLARE @SafeSort NVARCHAR(50) = CASE @SortColumn
    WHEN 'Title' THEN 'Title' WHEN 'CreatedAt' THEN 'CreatedAt' WHEN 'Status' THEN 'Status'
    ELSE 'CreatedAt' END;
```

**LIKE clause — escape wildcards:**
```sql
SET @SafeTerm = REPLACE(REPLACE(REPLACE(@SearchTerm, '[', '[[]'), '%', '[%]'), '_', '[_]');
```

**Least-privilege service account:**
```sql
-- Revoke: ALTER ROLE db_owner DROP MEMBER AppServiceAccount;
GRANT EXECUTE ON dbo.usp_GetDocuments TO AppServiceAccount;
```

**Audit table (append-only):**
```sql
CREATE TABLE dbo.AuditLog (
    Id BIGINT IDENTITY(1,1) PRIMARY KEY,
    TableName NVARCHAR(128) NOT NULL, RecordId NVARCHAR(128) NOT NULL,
    Action NVARCHAR(10) NOT NULL, ChangedBy NVARCHAR(128) NOT NULL,
    ChangedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    OldValues NVARCHAR(MAX) NULL, NewValues NVARCHAR(MAX) NULL
);
DENY UPDATE, DELETE ON dbo.AuditLog TO PUBLIC;
```

**Audit trigger:**
```sql
CREATE OR ALTER TRIGGER trg_Documents_Audit ON dbo.Documents
AFTER INSERT, UPDATE, DELETE AS
BEGIN
    SET NOCOUNT ON;
    INSERT INTO dbo.AuditLog (TableName, RecordId, Action, ChangedBy, ChangedAt, OldValues, NewValues)
    SELECT 'Documents', COALESCE(i.Id, d.Id),
        CASE WHEN i.Id IS NOT NULL AND d.Id IS NOT NULL THEN 'UPDATE'
             WHEN i.Id IS NOT NULL THEN 'INSERT' ELSE 'DELETE' END,
        COALESCE(i.UpdatedBy, d.CreatedBy, SUSER_SNAME()), SYSUTCDATETIME(),
        (SELECT d.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER),
        (SELECT i.* FOR JSON PATH, WITHOUT_ARRAY_WRAPPER)
    FROM inserted i FULL OUTER JOIN deleted d ON i.Id = d.Id;
END;
```

**EXECUTE AS + dynamic SQL (privilege escalation vector):**
Flag any combination of impersonation context and dynamic SQL as **High** severity. These must not coexist — scope EXECUTE AS to specific procedures only.

## Manual Issues (Report + Suggest Approach)

- **Row-Level Security** — implement RLS with security predicate function. Requires understanding auth model — flag for discussion
- **Always Encrypted for PII** — enable on sensitive columns, keys in Azure Key Vault. Requires app-side driver support
- **TDE not enabled** — enable at database level. Key managed by Azure SQL or customer-managed in Key Vault
- **Dynamic Data Masking** — add masking functions to sensitive columns, grant UNMASK to authorized roles only
- **CLR assembly security** — evaluate T-SQL replacement; if CLR needed, use SAFE permission. Document justification
- **Procedure-based access pattern** — create procedures for all access, revoke direct table permissions from app account
- **Temporal table access control** — apply same RLS to history table, restrict direct access to admin roles
- **Privilege escalation** — flag procedures executing GRANT/REVOKE/ALTER ROLE; permission changes belong in migrations only
- **Cross-database access** — review necessity and permission scoping
