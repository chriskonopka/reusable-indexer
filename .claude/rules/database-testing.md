# Testing Standards — SQL Server / Database (tSQLt)

## Framework

- Use **tSQLt** for all database unit tests
- Every test is a stored procedure inside a test class (schema) named after the object being tested

## Naming

- Name tests using `test_<scenario>`: `test_InactiveEmployeeIsDeactivated`, `test_MergeInsertsNewRecord`

## Structure (AAA)

Every test follows **Arrange / Act / Assert**:

1. **Arrange** — fake tables with `tSQLt.FakeTable`, insert test data
2. **Act** — call the object under test
3. **Assert** — verify the result

## Required Test Cases

### Stored Procedures
- Happy path with valid inputs
- NULL and empty input handling
- Error conditions (expected exceptions)

### ETL Procedures
- New record insertion
- Changed record update
- Deactivation of removed records

### Views
- Correct columns returned
- Filters applied correctly

## Assertions

- `tSQLt.AssertEquals` for single values
- `tSQLt.AssertEqualsTable` for result sets
- `tSQLt.ExpectException` for error conditions
- Never write a test without at least one assertion

## Isolation

- Use `tSQLt.FakeTable` to replace real tables — tests must never touch real data
- Use `tSQLt.SpyProcedure` to intercept dependent procedure calls — test one object at a time

## Rules

- Do not delete existing passing tests — only add or fix
- Every new stored procedure, function, and view must have tests before it is considered complete
