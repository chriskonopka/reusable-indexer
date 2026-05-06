# Backend Security Review Checklist — SQL Server / Database

---

## OWASP Top 10 — SQL Server Scope

---

### A01: Broken Access Control

- **Missing row-level security** — queries that return data without filtering by the requesting user's ownership or access level. Every query that returns user-specific data must include an ownership or role-based filter.
- **Stored procedures without authorization checks** — procedures that modify or return sensitive data without verifying the caller's identity or role.
- **Direct table access granted to application accounts** — application service accounts should access data through stored procedures only, not via direct `SELECT`/`INSERT`/`UPDATE`/`DELETE` on tables.

---

### A02: Cryptographic Failures

- **Hardcoded credentials in SQL scripts** — connection strings, passwords, API keys, or service account credentials embedded in migration scripts, stored procedures, or seed data.
- **Sensitive data stored unencrypted** — PII, financial data, or legal case details stored in plain text columns without column-level encryption (Always Encrypted) or Transparent Data Encryption (TDE).
- **Passwords stored without hashing** — user passwords stored in plain text or with reversible encryption instead of proper hashing.

---

### A03: Injection

- **Stored procedures using bare `sp_` prefix** — SQL Server searches the `master` database first for procedures prefixed with `sp_`, which creates a security risk (name hijacking). Use a project-specific prefix (e.g., `usp_`, `_sp_`).
- **Dynamic SQL with string concatenation** — any use of `EXEC('SELECT ... ' + @userInput)` or string concatenation to build SQL statements. Must use `sp_executesql` with parameters.
  ```sql
  -- Bad — injectable
  EXEC('SELECT * FROM Users WHERE Name = ''' + @Name + '''');

  -- Good — parameterized
  EXEC sp_executesql N'SELECT * FROM Users WHERE Name = @Name', N'@Name NVARCHAR(100)', @Name;
  ```
- **`xp_cmdshell` usage** — enables arbitrary command execution on the server. Must never be enabled or used. Flag every occurrence as Critical.
- **Unparameterized stored procedure inputs** — stored procedures that accept input but do not use parameters in their internal queries.
- **Second-order injection** — user input stored in a table and later retrieved and used in dynamic SQL without parameterization.

---

### A04: Insecure Design

- **Hard deletes without soft delete alternative** — records deleted permanently when soft delete (`IsDeleted` flag) should be the default. Hard deletes only when explicitly specified.
- **Bulk operations without confirmation** — stored procedures that perform mass updates or deletes without safeguards (row count limits, confirmation parameters).
- **Missing pagination on list queries** — queries that return unbounded result sets.

---

### A05: Security Misconfiguration

- **Overly permissive service account** — application database accounts with `db_owner`, `sysadmin`, or `ALTER` permissions. Apply least privilege — grant only `EXECUTE` on stored procedures and `SELECT`/`INSERT`/`UPDATE`/`DELETE` on specific tables as needed.
- **`TRUSTWORTHY` database property enabled** — allows the database to access resources outside its scope. Must be `OFF` unless explicitly justified and documented.
- **CLR assemblies with `UNSAFE` permission** — CLR code running with unrestricted access. Must use `SAFE` or `EXTERNAL_ACCESS` with documented justification.
- **Ownership chaining across schemas** — cross-schema ownership chaining can bypass intended permission boundaries. Verify that ownership chains are intentional and documented.
- **`xp_cmdshell` enabled** — must be disabled at the server level.

---

### A07: Authentication and Authorization

- **`EXECUTE AS` with overly broad scope** — impersonation context that grants more permissions than necessary. Scope to specific procedures, not entire sessions.
- **`IMPERSONATE` permission granted broadly** — ability to impersonate other users should be restricted to specific, justified use cases.
- **Direct table access instead of procedure-based access** — application accounts should interact through stored procedures, not direct table operations, to enforce business rules at the data layer.
- **`GRANT OPTION` used without justification** — `WITH GRANT OPTION` allows users to propagate their permissions to others. Flag and require documented approval.

---

### A09: Security Logging and Monitoring

- **No audit table for sensitive operations** — data changes to sensitive tables (cases, documents, user accounts) must be tracked in an audit table with: who changed it, what changed, when, and the old/new values.
- **Audit tables without append-only enforcement** — audit tables must not allow `UPDATE` or `DELETE`. Enforce with triggers or table permissions.
- **Missing audit triggers** — tables containing sensitive data should have `AFTER INSERT, UPDATE, DELETE` triggers that write to the audit table.
- **Sensitive data in error messages** — stored procedures that expose table names, column names, or data values in error messages returned to the application.

---

### A10: Server-Side Request Forgery (SSRF)

- **Linked servers with user-controlled targets** — linked server configurations that could be manipulated to access unintended targets.
- **`OPENROWSET` or `OPENDATASOURCE` with dynamic connection strings** — these functions can be used to access external data sources. Connection strings must be hardcoded or from secure configuration, never user-supplied.
- **Unrestricted linked server access** — linked servers should be configured with minimal permissions and restricted to specific databases/tables.

---

## Advanced: Data Protection

- **Always Encrypted not used for PII columns** — columns containing SSNs, financial data, or other PII should use Always Encrypted with column-level encryption keys managed in Azure Key Vault.
- **Dynamic Data Masking not configured** — columns with sensitive data visible to application queries should use dynamic masking to limit exposure (e.g., `MASKED WITH (FUNCTION = 'partial(1,"***",0)')`).
- **TDE not enabled** — Transparent Data Encryption should be enabled on databases containing sensitive data to protect data at rest.
- **Backup encryption not configured** — database backups must be encrypted to prevent data exposure from stolen backup files.

---

## Advanced: Privilege Escalation Prevention

- **Stored procedures that change permissions** — any procedure that executes `GRANT`, `REVOKE`, or `ALTER ROLE` must be flagged for review. Permission changes should go through migration scripts, not runtime procedures.
- **Dynamic SQL executing with elevated context** — `EXECUTE AS` combined with dynamic SQL can escalate privileges. Flag any combination of impersonation and dynamic SQL.
- **Cross-database access without justification** — queries or procedures that reference objects in other databases should be reviewed for necessity and proper permission scoping.

---

## Advanced: Temporal Data Security

- **Temporal tables without access control** — SQL Server temporal tables (system-versioned) store historical data automatically. Access to the history table must be restricted so users cannot query previous values of sensitive data.
- **History table exposed without filtering** — queries against temporal history should apply the same row-level security filters as the base table.

---

## Advanced: SQL Injection Deep Patterns

- **Second-order injection** — data stored from one request used unsafely in a later query. Check that data retrieved from tables is not concatenated into dynamic SQL.
- **ORDER BY injection** — `ORDER BY` clauses built from user input must use allowlists of valid column names, not direct concatenation.
- **LIKE clause injection** — user input used in `LIKE` patterns must escape wildcard characters (`%`, `_`, `[`).
- **Comment injection** — user input containing `--` or `/* */` that could terminate or alter a query. Parameterization prevents this, but flag any non-parameterized usage.
