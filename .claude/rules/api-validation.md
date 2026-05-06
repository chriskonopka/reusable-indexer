# Request Validation Standards

## Where validation runs

- Validate at the controller boundary — before any service call
- Internal calls within the same boundary trust their inputs (see `api-defensive-coding.md`)
- ASP.NET Core model validation runs automatically on `[ApiController]`-decorated controllers — do not re-validate annotated fields manually inside the action

## How to validate

- **Data Annotations** — for simple field validation: `[Required]`, `[MaxLength]`, `[Range]`, `[RegularExpression]`, `[EmailAddress]`
- **Manual validation** — for business rules requiring context: cross-field rules, database lookups, ownership checks
- **Do not introduce FluentValidation** without a discussion first — Data Annotations + manual checks cover the vast majority of cases

## Authorization-aware validation

- Never trust client-supplied IDs for authorization — always verify ownership server-side before processing
- A request that references a resource the caller does not own returns `403 Forbidden` — verify ownership server-side before processing
- Validate that referenced foreign-key IDs exist *and* are accessible to the caller in a single query — do not check existence and ownership in two separate round trips

## Input sanitization

- Sanitize string inputs used in file paths — strip `..`, normalize separators, reject absolute paths
- Sanitize inputs used in any kind of dynamic query — but prefer parameterized SQL or stored procedures (see `api-data-access.md`) so sanitization isn't the only line of defense
- Reject unexpected fields when the schema is closed — set `JsonSerializerOptions.UnmappedMemberHandling = Disallow` for security-sensitive endpoints

## Validation failures

- Return `400` with ProblemDetails — set the `errors` extension field to a `Dictionary<string, string[]>` of field name → messages (see `api-error-handling.md`)
- Use `ValidationProblem()` directly — never throw exceptions for expected validation failures
- Plain-language `detail` field suitable for UI display — never expose internal field names that aren't part of the public DTO contract
- No sensitive or complex parameters in query strings — use a request body
