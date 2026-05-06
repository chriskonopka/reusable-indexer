# Stored Procedure & Query Standards — SQL Server / Database

## Required Boilerplate

Every stored procedure must begin with:

```sql
SET NOCOUNT ON;
SET XACT_ABORT ON;
```

## Error Handling

- Wrap data-modifying logic in `TRY...CATCH` with explicit `BEGIN TRANSACTION` / `COMMIT`
- Check `@@TRANCOUNT > 0` before `ROLLBACK` in the `CATCH` block
- Re-raise errors with `THROW` — never use `RAISERROR` for re-raising
- Log errors (procedure name, error number, message) to an audit table before re-raising

## Parameter Sniffing

- Copy input parameters into local variables at the top of the procedure
- Use local variables in the query body — not the parameters directly

## Output

- Use `OUTPUT` params or a final `SELECT` — not both
- Use the `OUTPUT` clause instead of a follow-up `SELECT` to retrieve inserted/updated rows

## Header Comment

Every procedure must include a header comment block:

```sql
-- =============================================
-- Author:      [Name]
-- Create Date: [YYYY-MM-DD]
-- Description: [What this procedure does]
-- =============================================
```

## Creation

- Use `CREATE OR ALTER PROCEDURE` — not `DROP` + `CREATE` (preserves permissions)

## Cursors

- No cursors — use set-based operations
- If row-by-row processing is unavoidable, use a `WHILE` loop with a temp table
- If a cursor must be used, declare it as `LOCAL FAST_FORWARD READ_ONLY`

## ETL Pattern

- Follow: staging table → validate → deactivate removed records → `MERGE` into target

---

## Query Standards

### General

- Never use `SELECT *` — specify explicit columns
- All queries use parameterized inputs — never concatenate user values
- Use `EXISTS` over `COUNT()` for existence checks
- Every query returning a list must support pagination (`OFFSET...FETCH` or keyset pagination)
- Queries >30 lines → break into CTEs with meaningful names
- Use meaningful table aliases — not single letters

### SARGability

- Never wrap indexed columns in functions — prevents index usage:

```sql
-- Bad — cannot use index
WHERE YEAR(CreatedAt) = 2024

-- Good — SARGable
WHERE CreatedAt >= '2024-01-01' AND CreatedAt < '2025-01-01'
```

### Data Type Matching

- Join columns must have matching data types — mismatched types cause implicit conversions
- Do not mix `VARCHAR` and `NVARCHAR` in joins or comparisons
- Prefix string literals with `N''` when comparing to `NVARCHAR` columns

### Safe Conversions

- Use `TRY_CAST` / `TRY_CONVERT` instead of `CAST` / `CONVERT` when input may be invalid
- Use `NULLIF(column, '')` to normalize empty strings to NULL when loading from source systems

### Upserts

- Use `MERGE` for upsert operations with `ISNULL()` in match conditions to handle NULLs

### Locking

- `NOLOCK` only with documented justification
- Prefer `SNAPSHOT` isolation for read-heavy workloads that must not block writers

### DISTINCT

- If `DISTINCT` is needed, the query likely has a join producing unintended duplicates — fix the join instead
