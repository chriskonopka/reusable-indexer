# Coding Standards — SQL Server / Database

## Object Naming

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

## Column Naming

- Boolean columns: prefix with `Is`, `Has`, or `Can` (e.g., `IsActive`, `HasAccess`)
- Date-only columns: suffix with `Date` (e.g., `JobStartDate`)
- Timestamp columns: suffix with `At` or `Timestamp` (e.g., `CreatedAt`, `UpdatedAt`)
- Avoid generic names like `Value`, `Data`, `Info`, `Flag`, `Temp` — be specific

## Schema Qualification

- Always specify the schema explicitly on every object (e.g., `dbo.Documents`)
- Never use the bare `sp_` prefix — SQL Server searches `master` first, creating a performance penalty and security risk

## Schema Design

### Primary Keys

- Every table must have a primary key
- Prefer `INT IDENTITY(1,1)` as clustered PK
- Use `UNIQUEIDENTIFIER` as a non-clustered secondary key only if needed for external exposure

### Required Audit Columns

Every table must include:

```sql
CreatedAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
UpdatedAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
CreatedBy   NVARCHAR(256) NOT NULL,
UpdatedBy   NVARCHAR(256) NOT NULL,
IsDeleted   BIT NOT NULL DEFAULT 0,
DeletedAt   DATETIME2 NULL
```

### Data Types

- Use `NVARCHAR` for all user-facing string columns — supports Unicode
- Use `VARCHAR` only for provably ASCII-only data (codes, hashes, ISO enums)
- Always set an explicit length on `NVARCHAR` — use `NVARCHAR(MAX)` only when lengths genuinely exceed 4000 characters
- Use `DATETIME2` for timestamps — never `DATETIME` (better precision and range)
- Use `DATE` for date-only columns, `TIME` for time-only
- Use `BIT` for boolean columns
- Use `DECIMAL(p, s)` for monetary and fixed-point values — never `FLOAT` or `REAL` for money
- Never store dates as strings

### Nullability

- Define columns as `NOT NULL` unless there is a documented reason for allowing nulls

### Soft Deletes

- Soft deletes by default — `IsDeleted BIT NOT NULL DEFAULT 0` and `DeletedAt DATETIME2 NULL`
- Soft-deleted records must be excluded from all queries by default (`WHERE IsDeleted = 0`)
- Hard deletes only when explicitly specified for a given entity

### Referential Integrity

- Always define foreign keys with explicit `ON DELETE` / `ON UPDATE` actions — never leave them implicit
- Never store comma-separated lists or JSON blobs in a column as a substitute for a related table

### Timestamps

- Use `SYSUTCDATETIME()` for all audit timestamps — store all times in UTC

## Views

- Prefix all views with `vw_` (e.g., `vw_ActiveCases`)
- Use views to encapsulate complex joins and business logic reused across queries
- Use `CASE` expressions to derive display values rather than storing them redundantly
- Use `WITH SCHEMABINDING` on views that will be indexed
- Do not nest views more than two levels deep
- Always specify explicit columns — never use `SELECT *`
- Filter out soft-deleted records (`WHERE IsDeleted = 0`) unless the view is explicitly for admin/audit use
