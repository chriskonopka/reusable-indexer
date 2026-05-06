# Backend Code Quality Remediation Logic — SQL Server / Database

## Auto-Fixable Issues (Apply + Ask Approval)

### Obvious Fixes (one-liner)

- **Table naming** — rename to PascalCase plural (e.g., `document` → `Documents`)
- **Procedure prefix** — add `usp_` or `_sp_` prefix
- **Index naming** — rename to `IX_Table_Column`
- **Column naming** — rename to PascalCase
- **Missing PK** — add `INT IDENTITY(1,1)` primary key
- **DATETIME → DATETIME2**
- **VARCHAR → NVARCHAR** for user-facing text
- **FLOAT/REAL → DECIMAL(p,s)** for monetary values
- **GETUTCDATE → SYSUTCDATETIME** (returns DATETIME2 precision)
- **SELECT \*** — replace with explicit column list
- **Missing column list in INSERT** — add explicit column names
- **Missing SET NOCOUNT ON** — add as first statement
- **Missing SET XACT_ABORT ON** — add in data-modifying procedures
- **RAISERROR → THROW** (RAISERROR is legacy)
- **COUNT(\*) → EXISTS** for existence checks
- **= NULL → IS NULL**
- **Implicit → explicit JOIN** syntax
- **Missing FK index** — add non-clustered index
- **DROP+CREATE → CREATE OR ALTER PROCEDURE** (preserves permissions)
- **Missing N prefix** on string literals compared to NVARCHAR columns
- **Missing schema prefix** — add `dbo.` to all object references
- **CAST/CONVERT → TRY_CAST/TRY_CONVERT** for potentially invalid input

### Non-Obvious Fixes (with pattern)

**Missing audit columns (project standard):**
```sql
CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
CreatedBy NVARCHAR(128) NOT NULL,
UpdatedBy NVARCHAR(128) NOT NULL,
IsDeleted BIT NOT NULL DEFAULT 0,
DeletedAt DATETIME2 NULL
```

**Stored procedure error handling template:**
```sql
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    -- operations
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    -- Log error to audit table before re-raising
    THROW;
END CATCH
```

**Hard delete → soft delete:**
```sql
UPDATE Documents SET IsDeleted = 1, DeletedAt = SYSUTCDATETIME() WHERE Id = @Id;
-- Ensure all queries filter: WHERE IsDeleted = 0
```

**Idempotent migration guard:**
```sql
IF NOT EXISTS (SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.Documents') AND name = 'Status')
BEGIN
    ALTER TABLE dbo.Documents ADD Status NVARCHAR(50) NOT NULL DEFAULT 'Draft';
END;
```

**Non-SARGable WHERE fix:**
```sql
-- Bad: WHERE YEAR(CreatedAt) = 2024
WHERE CreatedAt >= '2024-01-01' AND CreatedAt < '2025-01-01'
```

**FK with explicit actions:**
```sql
FOREIGN KEY (CaseId) REFERENCES dbo.Cases(Id) ON DELETE NO ACTION ON UPDATE NO ACTION;
```

**MERGE for upsert with OUTPUT:**
```sql
MERGE INTO dbo.Target AS t
USING @Source AS s ON t.Code = ISNULL(s.Code, '')
WHEN MATCHED THEN UPDATE SET t.Name = s.Name, t.UpdatedAt = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (Code, Name, CreatedAt) VALUES (s.Code, s.Name, SYSUTCDATETIME())
OUTPUT $action, inserted.Id;
```

## Manual Issues (Report + Suggest Approach)

- **Long query (30+ lines)** — break into CTEs with descriptive names
- **Too many JOINs (5+)** — review for denormalization, CTEs, or encapsulating views
- **Deadlock prevention** — audit table access ordering across procedures, shorten transactions, consider ROWLOCK or SNAPSHOT isolation
- **Cursor replacement** — suggest set-based alternative or WHILE loop with temp table
- **Performance** — review execution plans; suggest covering indexes; identify implicit type conversions
- **Index consolidation** — identify redundant/subset indexes; suggest filtered indexes (`FX_`) for high-selectivity subsets; suggest covering indexes with INCLUDE
- **Bulk operations** — chunk 500–2000 rows, staging temp table → MERGE, transactional rollback on failure
- **ETL pattern** — staging → validate → deactivate → MERGE
- **Parameter sniffing** — copy input params to local variables at top of procedure
- **View nesting >2 levels** — flatten; add `SCHEMABINDING` on indexed views
- **tSQLt tests** — test class per object, AAA pattern (Arrange/Act/Assert), FakeTable for isolation, SpyProcedure for dependencies, test happy path + NULL/empty + errors + ETL flows
- **Data retention** — handled outside application scope via scheduled cleanup jobs, not application code
