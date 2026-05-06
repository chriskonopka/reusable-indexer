---
name: api-add-tests
description: Scaffold unit and integration tests for an existing .NET service, controller, or worker that lacks coverage
---

# Add Web API Tests

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `api-testing-guidelines.md` — test structure, naming, and what must be integration-tested vs unit-tested
- `document-pipeline/api-pipeline-tests.md` — pipeline-specific test requirements (only if the project uses the document-upload reference; skip otherwise)

---

Add or improve tests for an existing .NET service, controller, or worker. The user will specify the target (e.g. `Services/DocumentService` or `Controllers/CasesController`).

## Steps

1. Read the target file(s) to understand the methods, dependencies, and branching logic.
2. Check whether a test file already exists (e.g. `DocumentServiceTests.cs`).
   - If it exists, extend it — do not replace it.
   - If it does not exist, create it using the templates below.
3. Determine test type:
   - **Unit test** — for services, validators, and business logic with no I/O.
   - **Integration test** — for controllers and workers that touch real endpoints, queues, or databases.
4. Write tests that satisfy the required cases (see below).
5. Run the tests and fix any failures before finishing.

## Rules

- Do not delete existing passing tests — only add or fix
- All test conventions (xUnit, Moq, naming, unit-vs-integration scope, required test cases per service, always-test list, Worker test approach) are defined in `@.claude/rules/api-testing-guidelines.md` — verify the generated tests comply
- For pipeline / Worker tests in projects that include the document-upload reference, additionally consult `.claude/rules/document-pipeline/api-pipeline-tests.md`
