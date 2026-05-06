# Performance & Indexing Standards — SQL Server / Database

## Indexing Strategy

### Required Indexes

- Every foreign key column must have a non-clustered index
- Add indexes on columns frequently used in `WHERE`, `JOIN`, or `ORDER BY`

### Covering Indexes

- Use `INCLUDE` columns for frequently executed queries to avoid key lookups
- Only include columns that are selected — do not include the entire row

### Filtered Indexes

- Use filtered indexes for high-selectivity subsets (e.g., `WHERE IsActive = 1`)

### Composite Indexes

- Most selective column first
- Order columns to match the most common query patterns
- A composite index on `(A, B, C)` supports queries filtering on `A`, `A + B`, or `A + B + C` — but not `B` or `C` alone

### Do Not Over-Index

- Each index slows down writes (`INSERT`, `UPDATE`, `DELETE`)
- Justify every index with a specific query pattern
- Never create duplicate or redundant indexes
- Periodically review unused indexes via `sys.dm_db_index_usage_stats`

---

## Deadlock Prevention

- Access tables in a consistent order across all stored procedures — inconsistent ordering is the primary cause of deadlocks
- Keep transactions as short as possible — no HTTP calls, file I/O, or non-database work inside a transaction
- Use `ROWLOCK` hints on high-contention updates if row-level locking is appropriate

## Transaction Isolation

- Default `READ COMMITTED` is appropriate for most operations
- Use `SNAPSHOT` isolation for long-running reads that must not block or be blocked by writes
- Use `SERIALIZABLE` only when phantom reads are a genuine concern — it holds range locks
- Document the isolation level choice for any non-default setting

## Temp Tables vs Table Variables

- Use temp tables (`#temp`) for large result sets (1000+ rows) — they support statistics and indexes
- Use table variables (`@table`) only for small result sets (<100 rows) — they do not support statistics
- Always explicitly `DROP` temp tables at the end of the procedure

## Query Performance Red Flags

- **Non-SARGable WHERE clauses** — functions on indexed columns prevent index usage
- **Implicit conversions** — mismatched data types in joins or `WHERE` clauses force runtime conversion
- **Too many JOINs** — queries with 5+ joins should be reviewed for restructuring as CTEs or denormalization
- **Missing indexes on filter/join columns** — check execution plans for index scan warnings

## Execution Plans

- Review execution plans for any query that runs frequently or processes large datasets
- Look for: table scans, key lookups, hash joins on large tables, sort operations
- Add query hints (`OPTION (RECOMPILE)`, `OPTION (OPTIMIZE FOR ...)`) only with documented justification

---

## Bulk Operations

### Staging Pattern

- Always load data into a staging temp table first, then `MERGE` into the target
- Never insert directly into production tables from external sources

### Batching

- Chunk large inserts into batches of 500-2000 rows
- Batching prevents lock escalation and reduces transaction log pressure

### Transactions

- Wrap bulk operations in an explicit transaction
- Roll back the entire load if any step fails — no partial loads

### ETL Flow

1. Load raw data into staging temp table
2. Validate and transform staged data
3. Deactivate records in target that are no longer in source
4. `MERGE` validated data into target table

### Rules

- Log row counts at each stage (staged, validated, inserted, updated, deactivated)
- Never truncate production tables as part of a bulk load — use `MERGE` for incremental updates
- Bulk operations must be idempotent — re-running must not produce duplicates
