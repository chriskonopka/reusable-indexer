# Backend Code Review Checklist — SQL Server / Database

---

## Basic Code Review

### Naming Conventions

| Object | Convention | Example |
|---|---|---|
| Tables | PascalCase, plural | `Documents`, `CaseParties` |
| Columns | PascalCase | `FirstName`, `CreatedAt` |
| Stored Procedures | `usp_` prefix + PascalCase | `usp_GetDocumentById` |
| Views | `vw_` prefix + PascalCase | `vw_ActiveCases` |
| Indexes | `IX_TableName_ColumnName` | `IX_Documents_CaseId` |
| Primary Keys | `PK_TableName` | `PK_Documents` |
| Foreign Keys | `FK_ChildTable_ParentTable` | `FK_Documents_Cases` |
| Default Constraints | `DF_TableName_ColumnName` | `DF_Documents_CreatedAt` |
| Check Constraints | `CK_TableName_ColumnName` | `CK_Documents_Status` |

### Data Types

- Use `IDENTITY(1,1)` for auto-increment columns
- Use `NVARCHAR` for all string columns unless the column is provably ASCII-only (codes, hashes, ISO enums) — use `VARCHAR` for those
- Always set an explicit length on `NVARCHAR` — use `NVARCHAR(MAX)` only when lengths genuinely exceed 4000 characters (cannot be indexed directly)
- Use `DATETIME2` for timestamps; `DATE` for date-only columns; `TIME` for time-only — never store dates as strings
- Use `BIT` for boolean columns
- Use `DECIMAL(p, s)` for monetary and fixed-point values — never `FLOAT` or `REAL` for money

### Schema Design

- Every table must have a primary key — prefer `INT IDENTITY(1,1)` as clustered PK. Use `UNIQUEIDENTIFIER` as a non-clustered secondary key only if needed.
- Always specify the schema explicitly on every object (e.g., `dbo.Documents`)
- Every table must include audit columns: `CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`, `UpdatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()`, `CreatedBy`, `UpdatedBy`
- Use `SYSUTCDATETIME()` for all audit timestamps — store all times in UTC
- Use `DATETIME2` instead of `DATETIME` — better precision and range
- Use `NVARCHAR` instead of `VARCHAR` for any user-facing text — supports Unicode
- Define columns as `NOT NULL` unless there is a documented reason for allowing nulls
- Always define foreign keys with explicit `ON DELETE` / `ON UPDATE` actions — never leave them implicit
- Never store comma-separated lists or JSON blobs in a column as a substitute for a related table
- Use soft deletes by default — add `IsDeleted BIT NOT NULL DEFAULT 0` and `DeletedAt DATETIME2 NULL`
- Soft-deleted records must be excluded from all queries by default — use `WHERE IsDeleted = 0`
- Hard deletes only when explicitly specified for a given entity
- Boolean columns: prefix with `Is`, `Has`, or `Can` (e.g., `IsActive`, `HasAccess`)
- Date/time columns: suffix with `Date` for date-only (`JobStartDate`) and `DateTime` or `Timestamp` for full timestamps
- Avoid generic column names like `Value`, `Data`, `Info`, `Flag`, `Temp` — be specific

### Query Standards

- Use `TRY_CAST`/`TRY_CONVERT` instead of `CAST`/`CONVERT` when input may be invalid
- Use `MERGE` for upsert operations with `ISNULL()` in match conditions to handle NULLs
- Use the `OUTPUT` clause instead of a follow-up `SELECT` to retrieve inserted/updated rows
- Use `NULLIF(column, '')` to normalize empty strings to NULL when loading from source systems
- Every query returning a list must support pagination — `OFFSET...FETCH` or keyset pagination
- `NOLOCK` only with documented justification
- Prefix string literals with `N''` when comparing to `NVARCHAR` columns — avoids implicit conversions

### Indexing Strategy

- Every foreign key column must have a non-clustered index
- Add indexes on columns frequently used in `WHERE`, `JOIN`, or `ORDER BY`
- Use **covering indexes** (`INCLUDE`) for frequently executed queries
- Use **filtered indexes** for high-selectivity subsets (e.g., `WHERE IsActive = 1`)
- Composite indexes should follow the selectivity rule — most selective column first
- Do not over-index — each index slows down writes. Justify every index with a query pattern. Never create duplicate or redundant indexes.
- Review execution plans for queries with high read counts or scans

### Stored Procedure Standards

- `SET NOCOUNT ON` + `SET XACT_ABORT ON` at top of every procedure
- `TRY...CATCH` with explicit transaction, check `@@TRANCOUNT > 0` before `ROLLBACK`, re-raise with `THROW` (not `RAISERROR`)
- Log errors (procedure name, error number, message) to an audit table before re-raising
- Use `OUTPUT` params or a final `SELECT` — not both
- Header comment block: author, date, description
- Use `CREATE OR ALTER PROCEDURE` — not DROP+CREATE (preserves permissions)
- Mitigate parameter sniffing by copying input params into local variables at top
- ETL pattern: staging → validate → deactivate → MERGE
- No cursors — set-based operations or WHILE with temp table

### Migration Standards

- Applied manually: dev → staging → prod. Reviewed before production. Not on startup, not in CI/CD
- Every migration must be idempotent (`IF NOT EXISTS` guards) with a rollback script
- Sequentially numbered or timestamped

### Data Integrity

- Use foreign keys to enforce referential integrity between tables
- Use check constraints for domain-level validation (e.g., status values, ranges)
- Prefer soft deletes over hard deletes — add `IsDeleted` flag and `DeletedAt` timestamp
- Data retention handled outside application scope via scheduled cleanup jobs — applications do not manage their own data lifecycle

### Views

- Use views to encapsulate complex joins and business logic reused across queries
- Use `CASE` expressions to derive display values rather than storing them redundantly
- Use `WITH SCHEMABINDING` on views that will be indexed
- Do not nest views more than two levels deep

### Bulk Operations

- Chunk large inserts into batches of 500–2000 rows
- Always load into a staging temp table first, then `MERGE` into the target
- Wrap bulk operations in an explicit transaction — roll back the whole load if any step fails

### Testing (tSQLt)

- Write tSQLt unit tests for every stored procedure, function, and view
- Every test is a stored procedure inside a test class (schema) named after the object being tested
- Name tests using `test_<scenario>`: `test_InactiveEmployeeIsDeactivated`, `test_MergeInsertsNewRecord`
- Follow **AAA**: **Arrange** (fake tables, insert test data), **Act** (call the object), **Assert** (verify result)
- Stored procedures: test happy path, NULL/empty input, and error conditions
- ETL procedures: test new record insertion, changed record update, and deactivation of removed records
- Views: test correct columns returned and filters applied correctly
- Use `tSQLt.FakeTable` to replace real tables — tests must never touch real data
- Use `tSQLt.SpyProcedure` to intercept dependent procedure calls — test one object at a time
- Use `tSQLt.AssertEquals` for single values, `tSQLt.AssertEqualsTable` for result sets, `tSQLt.ExpectException` for error conditions
- Never write a test without at least one assertion

### General Quality

- Queries >30 lines → break into CTEs. Use meaningful table aliases
- Repeated query logic → extract into views or inline table-valued functions
- Join columns must have matching data types — mismatched types cause implicit conversions
- Do not mix `VARCHAR` and `NVARCHAR` in joins or comparisons

---

## Advanced Code Review

### Query Performance

- **Non-SARGable WHERE clauses** — functions on indexed columns prevent index usage:
  ```sql
  -- Bad — cannot use index
  WHERE YEAR(CreatedAt) = 2024
  -- Good — SARGable
  WHERE CreatedAt >= '2024-01-01' AND CreatedAt < '2025-01-01'
  ```
- **Implicit conversions** — mismatched data types in joins or `WHERE` clauses force SQL Server to convert values at runtime, preventing index seeks
- **`DISTINCT` masking duplicate joins** — if `DISTINCT` is needed, the query likely has a join producing unintended duplicates. Fix the join instead.
- **Too many JOINs** — queries with 5+ joins should be reviewed for denormalization opportunities or restructured as CTEs
- **Missing indexes on filter/join columns** — check execution plans for index scan warnings

### Deadlock Prevention

- Access tables in a consistent order across all stored procedures — inconsistent ordering is the primary cause of deadlocks
- Keep transactions as short as possible — do not include non-database work (HTTP calls, file I/O) inside a transaction
- Use `ROWLOCK` hints on high-contention updates if row-level locking is appropriate
- Consider `SNAPSHOT` isolation for read-heavy workloads that must not block writers

### Temp Tables vs Table Variables

- Use temp tables (`#temp`) for large result sets (1000+ rows) — they support statistics and indexes
- Use table variables (`@table`) only for small result sets (<100 rows) — they do not support statistics
- Always explicitly `DROP` temp tables at the end of the procedure

### Cursor Avoidance

- Replace cursors with set-based operations wherever possible
- If row-by-row processing is unavoidable, use a `WHILE` loop with a temp table instead of a cursor
- If a cursor must be used, declare it as `LOCAL FAST_FORWARD READ_ONLY`

### Transaction Isolation

- Default `READ COMMITTED` is appropriate for most operations
- Use `SNAPSHOT` isolation for long-running reads that must not block or be blocked by writes
- Use `SERIALIZABLE` only when phantom reads are a genuine concern — it holds range locks
- Document the isolation level choice for any non-default setting

### Execution Plans

- Review execution plans for any query that runs frequently or processes large datasets
- Look for: table scans (should be index seeks), key lookups (consider covering indexes), hash joins on large tables (consider indexing), sort operations (consider indexed order)
- Add query hints (`OPTION (RECOMPILE)`, `OPTION (OPTIMIZE FOR ...)`) only with documented justification
