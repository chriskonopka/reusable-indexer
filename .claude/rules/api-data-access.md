- EF Core for single-table operations with no joins, aggregations, or business logic
- Stored procedures for everything else — called via `ExecuteSqlRawAsync()` or `FromSqlRaw()`
- No repository abstraction
- Soft deletes by default — `IsDeleted` flag + `DeletedAt` timestamp
- Soft-deleted records are excluded from all queries by default — every query against a soft-deletable table filters `WHERE IsDeleted = 0` (or the equivalent EF Core query filter)
- Migrations run manually by developers — not on startup, not in CI/CD

## SQL injection — mandatory parameterization
`ExecuteSqlRawAsync` and `FromSqlRaw` are the two most injection-prone EF Core
APIs. They are permitted only when every dynamic value is passed as a
`SqlParameter` — never via string concatenation or interpolation. Any value
that comes (directly or transitively) from a request, a queue message, a
stored row, or any other non-literal source counts as dynamic.

**Allowed**:
```csharp
await db.Database.ExecuteSqlRawAsync(
    "EXEC dbo.usp_DeleteDocument @DocumentId, @UserId",
    new SqlParameter("@DocumentId", documentId),
    new SqlParameter("@UserId", userId),
    cancellationToken);

var rows = db.Documents.FromSqlRaw(
    "EXEC dbo.usp_GetDocumentsByUser @UserId",
    new SqlParameter("@UserId", userId)).ToListAsync(cancellationToken);
```

Equivalently, `FromSqlInterpolated` / `ExecuteSqlInterpolatedAsync` may be used
because they accept a `FormattableString` and parameterize each interpolated
value automatically:
```csharp
await db.Database.ExecuteSqlInterpolatedAsync(
    $"EXEC dbo.usp_DeleteDocument {documentId}, {userId}",
    cancellationToken);
```

**Forbidden** — any dynamic value spliced into the SQL string:
```csharp
// NEVER — string concatenation
await db.Database.ExecuteSqlRawAsync(
    $"EXEC dbo.usp_GetUser '{userId}'", cancellationToken);

// NEVER — string.Format / interpolation passed to ExecuteSqlRawAsync
await db.Database.ExecuteSqlRawAsync(
    string.Format("EXEC dbo.usp_GetUser '{0}'", userId), cancellationToken);
```
Note: `ExecuteSqlRawAsync($"...")` looks safe but is **not** — the `Raw`
overload takes a plain `string`, so the interpolation happens before the call
and the value is concatenated. Use the `Interpolated` variant if you want the
interpolation syntax.

Code review and `/security-review` must reject any `ExecuteSqlRaw*` /
`FromSqlRaw` call where the SQL string is not a compile-time constant unless
every dynamic value is a `SqlParameter`.
