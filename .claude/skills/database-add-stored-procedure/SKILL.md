---
name: database-add-stored-procedure
description: Scaffold a stored procedure with standard error handling, parameter sniffing mitigation, and header comment
---

# Add Stored Procedure

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `database-stored-procedures.md` — required boilerplate, error handling, transaction patterns, and parameter sniffing mitigation
- `database-coding-standards.md` — naming conventions and query standards

---

Scaffold a new stored procedure with the required boilerplate, error handling, and documentation.

## Steps

1. Ask the user for the procedure name and purpose. Determine whether it reads data, modifies data, or both.
2. Check whether a procedure with this name already exists in the project. If it does, stop and tell the user.
3. Create the stored procedure using the appropriate template below (read-only or data-modifying).
4. If the procedure is part of an ETL flow, use the ETL template instead.
5. Tell the user the procedure must be deployed via a migration script.

## Data-Modifying Template

```sql
-- =============================================
-- Author:      [Author]
-- Create Date: [YYYY-MM-DD]
-- Description: [What this procedure does]
-- =============================================

CREATE OR ALTER PROCEDURE dbo.usp_{{ProcedureName}}
    @Param1 INT,
    @Param2 NVARCHAR(256)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    -- Copy params to local variables to mitigate parameter sniffing
    DECLARE @LocalParam1 INT = @Param1;
    DECLARE @LocalParam2 NVARCHAR(256) = @Param2;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Business logic here

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Log error before re-raising
        INSERT INTO dbo.ErrorLog (ProcedureName, ErrorNumber, ErrorMessage, ErrorDate)
        VALUES ('usp_{{ProcedureName}}', ERROR_NUMBER(), ERROR_MESSAGE(), SYSUTCDATETIME());

        THROW;
    END CATCH
END
GO
```

## Read-Only Template

```sql
-- =============================================
-- Author:      [Author]
-- Create Date: [YYYY-MM-DD]
-- Description: [What this procedure does]
-- =============================================

CREATE OR ALTER PROCEDURE dbo.usp_{{ProcedureName}}
    @Param1 INT,
    @PageNumber INT = 1,
    @PageSize INT = 20
AS
BEGIN
    SET NOCOUNT ON;

    -- Copy params to local variables to mitigate parameter sniffing
    DECLARE @LocalParam1 INT = @Param1;
    DECLARE @LocalPageNumber INT = @PageNumber;
    DECLARE @LocalPageSize INT = @PageSize;

    SELECT
        -- Columns here
    FROM dbo.{{TableName}}
    WHERE IsDeleted = 0
    ORDER BY Id
    OFFSET (@LocalPageNumber - 1) * @LocalPageSize ROWS
    FETCH NEXT @LocalPageSize ROWS ONLY;
END
GO
```

## Rules

- Replace `{{ProcedureName}}` with PascalCase name (without the `usp_` prefix — it is already in the template)
- Use `CREATE OR ALTER PROCEDURE` — never `DROP` + `CREATE`
- `SET NOCOUNT ON` must be the first statement
- `SET XACT_ABORT ON` required for any procedure that modifies data
- Copy all input parameters into local variables at the top
- Data-modifying procedures must use `TRY...CATCH` with explicit transactions
- Read-only procedures must support pagination via `OFFSET...FETCH`
- Always filter soft-deleted records: `WHERE IsDeleted = 0`
- Use `OUTPUT` clause to return inserted/updated rows — not a follow-up `SELECT`
- No cursors — use set-based operations
