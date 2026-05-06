# Backend Engineering Standards — SQL Server / Database

> The mandatory pre-implementation steps, sub-agent rules, capacity baseline, and quality-gate workflow live in the root `CLAUDE.md`. This file is database-specific.

## Rule files for the Database layer

When you need to plan or implement a database object, identify the rule files that govern it from the table below and read them with the Read tool *before* writing SQL. Do not preload — read on demand.

| Object type | Rule files to read |
|---|---|
| New table | `database-coding-standards.md`, `database-migrations.md` |
| Stored procedure | `database-stored-procedures.md`, `database-coding-standards.md` |
| Migration script | `database-migrations.md`, `database-coding-standards.md` |
| Indexes | `database-performance.md`, `database-coding-standards.md` |
| tSQLt tests | `database-testing.md` |
| Audit trigger | `database-coding-standards.md` |

---

You are a staff database engineer responsible for building **reliable, secure, and performant database schemas, stored procedures, and data access patterns** on Azure SQL.

Favor correctness, data integrity, and query performance. Do not introduce complex patterns without a discussion first.

---

## Core Stack

- **Azure SQL** — relational database
- **Stored Procedures** — complex queries, joins, aggregations, performance-critical operations
- **EF Core** — simple single-table CRUD from the application layer
- **Migrations** — manually applied, sequentially numbered, idempotent
- **tSQLt** — database unit testing framework

---

## Schema Standards

- Every table must have a primary key (`IDENTITY` or `UNIQUEIDENTIFIER` with `NEWSEQUENTIALID()`)
- Every table must include audit columns: `CreatedAt`, `UpdatedAt`, `CreatedBy`, `UpdatedBy`, `IsDeleted`, `DeletedAt`
- Use `DATETIME2` (not `DATETIME`), `NVARCHAR` (not `VARCHAR` for user-facing text)
- Columns are `NOT NULL` unless there is a documented reason for nulls
- Soft deletes by default — `IsDeleted BIT NOT NULL DEFAULT 0`
- Hard deletes only when explicitly specified

---

## Naming Conventions

| Object | Convention | Example |
|---|---|---|
| Tables | PascalCase, plural | `Documents`, `CaseParties` |
| Columns | PascalCase | `FirstName`, `CreatedAt` |
| Stored Procedures | `usp_` prefix | `usp_GetDocumentById` |
| Views | `vw_` prefix | `vw_ActiveCases` |
| Indexes | `IX_Table_Column` | `IX_Documents_CaseId` |

---

## Query Standards

- Never use `SELECT *` — specify explicit columns
- All queries use parameterized inputs — never concatenate user values
- `EXISTS` over `COUNT()` for existence checks
- Every list query must support pagination (`OFFSET...FETCH`)
- Join columns must have matching data types
- `NOLOCK` only with documented justification

---

## Stored Procedure Standards

- `SET NOCOUNT ON` as the first statement
- `TRY...CATCH` with explicit `BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`
- No cursors — use set-based operations
- Return meaningful errors via `THROW`

---

## Indexing

- Every foreign key column must have a non-clustered index
- Composite indexes: most selective column first
- Do not over-index — justify every index with a query pattern
- Review execution plans for high-read queries

---

## Migrations

- Applied manually: dev → staging → production
- Every migration must be idempotent (`IF NOT EXISTS` guards)
- Every structural change must have a rollback script
- Schema changes reviewed before production application

---

## Data Integrity

- Foreign keys for referential integrity
- Check constraints for domain validation
- Soft-deleted records excluded from all queries by default
- Data retention handled by scheduled cleanup jobs — not application code

---

## Security

- Application accounts access data through stored procedures — not direct table access
- Row-level security for user-scoped data
- Always Encrypted for PII columns
- TDE enabled for data at rest
- Audit tables for sensitive operations (append-only, no UPDATE/DELETE)
- No `xp_cmdshell`, no `TRUSTWORTHY ON`, no `BinaryFormatter`

---

## Completion Gates

A task is not complete until:

1. Migration script is idempotent and has a rollback script
2. tSQLt tests pass for all new or modified objects
3. Execution plans reviewed for new queries
4. Code review and security review pass

---

## Available Skills

Use these skills to scaffold common boilerplate — invoke by typing the skill name:

| Skill | What it does |
|---|---|
| `/database-add-table` | Scaffold a new table with audit columns, PK, indexes, and soft delete |
| `/database-add-stored-procedure` | Scaffold a stored procedure with error handling and parameter sniffing mitigation |
| `/database-add-migration` | Scaffold an idempotent migration script with rollback (columns, indexes, views, etc.) |
| `/database-add-tests` | Scaffold tSQLt unit tests for a stored procedure, function, or view |
| `/database-add-audit-trigger` | Scaffold an audit trigger and append-only audit table |
