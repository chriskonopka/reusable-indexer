---
name: database-add-tests
description: Scaffold tSQLt unit tests for an existing stored procedure, function, or view
---

# Add Database Tests

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `database-testing.md` — tSQLt test structure, naming conventions, and required test scenarios

---

Add tSQLt unit tests for an existing database object. The user will specify the target (e.g., `usp_GetDocumentById` or `vw_ActiveCases`).

## Steps

1. Read the target object to understand its inputs, outputs, dependencies, and branching logic.
2. Check whether a test class (schema) already exists for this object.
   - If it exists, extend it — do not replace it.
   - If it does not exist, create it using the templates below.
3. Determine the object type and write the appropriate tests:
   - **Stored procedure** — happy path, NULL/empty inputs, error conditions
   - **ETL procedure** — new record insert, changed record update, deactivation of removed records
   - **View** — correct columns returned, filters applied correctly
4. Run the tests and fix any failures before finishing.

## Test Class Template

```sql
-- Create test class for the object under test
EXEC tSQLt.NewTestClass 'test_{{ObjectName}}';
GO
```

## Stored Procedure Test Template

```sql
CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_HappyPath_ReturnsExpectedResult]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';

    INSERT INTO dbo.{{TableName}} (Id, Column1, IsDeleted)
    VALUES (1, N'TestValue', 0);

    -- Act
    EXEC dbo.usp_{{ObjectName}} @Param1 = 1;

    -- Assert
    SELECT TOP 1 *
    INTO #Actual
    FROM dbo.{{TableName}};

    EXEC tSQLt.AssertEquals @Expected = N'TestValue', @Actual = (SELECT Column1 FROM #Actual);
END
GO

CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_NullInput_ReturnsEmpty]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';

    -- Act / Assert
    EXEC dbo.usp_{{ObjectName}} @Param1 = NULL;

    DECLARE @RowCount INT = (SELECT COUNT(*) FROM dbo.{{TableName}});
    EXEC tSQLt.AssertEquals @Expected = 0, @Actual = @RowCount;
END
GO

CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_ErrorCondition_ThrowsExpectedException]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';
    EXEC tSQLt.ExpectException;

    -- Act
    EXEC dbo.usp_{{ObjectName}} @Param1 = -1;
END
GO
```

## View Test Template

```sql
CREATE OR ALTER PROCEDURE test_{{ObjectName}}.[test_ReturnsCorrectColumns]
AS
BEGIN
    -- Arrange
    EXEC tSQLt.FakeTable 'dbo.{{TableName}}';

    INSERT INTO dbo.{{TableName}} (Id, Column1, IsDeleted)
    VALUES (1, N'Active', 0), (2, N'Deleted', 1);

    -- Act
    SELECT * INTO #Actual FROM dbo.vw_{{ObjectName}};

    -- Assert — only non-deleted rows returned
    DECLARE @RowCount INT = (SELECT COUNT(*) FROM #Actual);
    EXEC tSQLt.AssertEquals @Expected = 1, @Actual = @RowCount;
END
GO
```

## Rules

- Every test is a stored procedure inside a test class (schema) named `test_{{ObjectName}}`
- Follow **AAA**: Arrange (fake tables, insert data), Act (call the object), Assert (verify result)
- Use `tSQLt.FakeTable` to replace real tables — tests must never touch real data
- Use `tSQLt.SpyProcedure` to intercept dependent procedure calls — test one object at a time
- Never write a test without at least one assertion
- Do not delete existing passing tests — only add or fix
- Name tests: `test_<Scenario>_<ExpectedResult>`
