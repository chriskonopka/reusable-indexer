A slice is one user-visible capability, not a horizontal layer.

Default to the smallest plan that ships a working capability end-to-end.

## When to split

Split a slice only if at least one is true:
- It crosses bounded contexts (e.g., chat ↔ document upload)
- The pieces have independent rollout risk (one is risky, one is safe)
- The pieces could ship in different weeks without breaking each other
- It exceeds the project's reviewable size ceiling (declared in the
  architecture doc — typically 5000-8000 LoC depending on project shape)

LoC is the backup signal, not the primary one. A 6000-LoC CRUD slice
that touches one bounded context and ships as one capability is fine.
A 800-LoC slice that touches auth and billing is not.

## Smell tests — slicing too fine

- Two adjacent slices edit the same file
- A slice produces stubs that don't compile alone
- A slice's only deliverable is "wire DI" or "add the audit constant"
- Slice count exceeds 3x the number of distinct user capabilities in the spec

## Smell tests — slicing too coarse

- Slice description has "and" or "also" three or more times
- Slice spans more than ~3 days of focused work
- Slice review would need 4+ stakeholders to sign off
- Single slice creates artifacts in 6+ unrelated rule areas
- Estimated diff exceeds the project's reviewable size ceiling

## Per-project tuning

The architecture doc (Step 1 output) MUST declare:
- Target slice count (typically 1-3x the spec's user-capability count)
- Reviewable size ceiling in LoC (typically 5000-8000; lower for
  security-critical or regulated work; higher for greenfield CRUD)

Read this file before producing the slice plan in the architecture phase.