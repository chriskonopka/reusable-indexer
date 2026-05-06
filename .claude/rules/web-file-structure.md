# Application File Structure

Organize source files by feature/domain, not by type. Group everything related to a feature together so it can be reasoned about and deleted as a unit.

## Top-level `src/` layout

```
src/
├── assets/            # Static assets (images, fonts, icons)
├── components/        # Shared, reusable UI components
├── features/          # Feature modules (see structure below)
├── hooks/             # Shared custom hooks
├── pages/             # Route-level page components
├── store/             # Global state (Redux store, slices, context providers)
├── styles/            # Global styles, SCSS custom properties, resets
├── types/             # Shared TypeScript types and interfaces
└── utils/             # Pure utility functions
```

## Component folder structure

Each component lives in its own folder. All related files are colocated:

```
ComponentName/
├── index.tsx               # Component implementation and named export
├── ComponentName.module.scss  # Scoped styles (SCSS Modules)
├── ComponentName.test.tsx  # Unit/integration tests
└── ComponentName.types.ts  # Local TypeScript types (if non-trivial)
```

## Feature folder structure

Features encapsulate a vertical slice of the application:

```
features/
└── FeatureName/
    ├── components/         # UI components used only by this feature
    ├── hooks/              # Hooks scoped to this feature
    ├── types.ts            # Feature-specific TypeScript types
    ├── utils.ts            # Feature-specific utilities
    └── index.ts            # Public API — export only what other features need
```

**Rules:**

- Never import directly from a feature's internal files from outside that feature — use its `index.ts` barrel export.
- Shared components used by 2+ features belong in `src/components/`, not inside a feature.
- Shared hooks used by 2+ features belong in `src/hooks/`.
- Do not create `index.ts` barrel files in `src/components/` or `src/hooks/` — import from the component folder directly to avoid re-export chains that hurt tree-shaking.
- Keep `src/utils/` for pure, stateless functions only — no React, no side effects.
- Test files live next to the file they test, not in a separate `__tests__/` directory.
- No circular dependencies — module A must not import from B if B imports from A. Restructure shared code into a third module to break the cycle.
