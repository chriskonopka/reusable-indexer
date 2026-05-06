# Backend API — Test Guidelines

## Unit tests
Cover all business logic, validation, and branching. No database, no external services.
Mock all dependencies with Moq. Use xUnit.
Name test classes `{Class}Tests`. Name methods `{Method}_{Scenario}_{ExpectedResult}`.

## Integration tests
Hit real dev environment resources — no in-memory databases, no mocks.
Every endpoint needs at least one integration test covering the full request/response cycle.
Test auth (valid token, invalid token, expired token), pagination, validation failures, and error responses.
Workers tested by publishing real messages and asserting on side effects.

## Always test
- Every validation rule and every branch
- Every boundary value
- Every error response
- Duplicate message handling
- Soft-delete exclusion

## Required test cases for every service
- **Happy path** — valid inputs, assert expected output and dependencies called with correct arguments
- **Permanent failure (400/401/403)** — mock to throw once; assert no retry and no rethrow
- **Cancellation** — pass cancelled `CancellationToken`; assert exits cleanly without calling dependencies
