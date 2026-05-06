---
name: web-create-feature
description: Scaffold a new feature module following the vertical-slice project structure
---

# Create Feature

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `web-file-structure.md` — feature module layout and what goes where
- `web-state-management.md` — useReducer + Context vs TanStack Query rules
- `web-coding-standards.md` — TypeScript conventions and forbidden patterns
- `web-component-architecture.md` — component structure within a feature
- `web-testing.md` — required test coverage for features

---

Scaffold a new feature module under `src/features/FeatureName/`.

## Directory structure to create

```
src/features/FeatureName/
├── components/         # UI components used only by this feature
├── hooks/              # Hooks scoped to this feature
├── types.ts            # Feature-specific TypeScript types
├── utils.ts            # Feature-specific pure utilities (omit if not needed)
└── index.ts            # Public API barrel — export only what other features need
```

## index.ts (public barrel)

Export only the symbols that are part of this feature's public API.
Do **not** export internal implementation details.

```ts
export { FeatureComponent } from './components/FeatureComponent';
export { useFeatureHook } from './hooks/useFeatureHook';
export type { FeatureType } from './types';
```

## types.ts

Define all TypeScript types, interfaces, and action unions for this feature.

```ts
export interface FeatureItem {
  id: string;
  // ...
}

export type FeatureAction =
  | { type: 'ADD_ITEM'; payload: string }
  | { type: 'REMOVE_ITEM'; payload: string };
```

## State management guidance

| Scope | Tool |
|---|---|
| Local UI state | `useState` |
| Derived or complex feature state | `useReducer` (defined in a hook in `hooks/`) |
| Shared state across the whole app | Redux Toolkit slice in `src/store/` |

## Rules

- Never import directly from a feature's internal files from outside that feature — use `index.ts`.
- Shared components used by 2+ features belong in `src/components/`, not inside a feature.
- Shared hooks used by 2+ features belong in `src/hooks/`.
- Keep `utils.ts` for pure, stateless functions only — no React, no side effects.
- Every new component must have a corresponding `.test.tsx` file with an axe assertion.
