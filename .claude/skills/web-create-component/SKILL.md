---
name: web-create-component
description: Scaffold a new React component following project conventions
---

# Create Component

## Required reading before executing this skill

Read these rule files in full before writing any code:

- `web-component-architecture.md` — component structure, prop patterns, and composition rules
- `web-coding-standards.md` — TypeScript conventions, naming, and forbidden patterns
- `web-styling.md` — SCSS Modules usage, class naming, and theming
- `web-accessibility.md` — ARIA requirements and keyboard navigation
- `web-testing.md` — required test coverage for every component

---

Scaffold a new React component at the path the user specifies (or in `src/components/` by default).

## What to create

Given a component name (e.g. `Button`), create the following files:

```
ComponentName/
├── index.tsx               # Component implementation
├── ComponentName.module.scss  # SCSS Modules styles
└── ComponentName.test.tsx  # Tests including jest-axe assertion
```

## index.tsx template

```tsx
import styles from './ComponentName.module.scss';

interface ComponentNameProps {
  // define props here
}

export const ComponentName = ({}: ComponentNameProps) => {
  return <div className={styles.root}>{/* component content */}</div>;
};
```

Rules:

- Named export, not default export
- Arrow function `const` — not `function` declarations
- Props typed with an explicit interface
- No `React.FC` — type props directly on the arrow function signature
- Use semantic HTML elements first; reach for ARIA only when needed
- All interactive elements must have visible focus styles and be keyboard navigable
- Touch/click targets must be at least 44×44px

## ComponentName.module.scss template

```css
.root {
  /* component styles using SCSS custom properties from global.scss */
}
```

Rules:

- Use CSS custom properties (e.g. `var(--color-primary)`) for all design tokens
- No inline styles except for truly dynamic values
- No CSS-in-JS

## ComponentName.test.tsx template

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ComponentName } from '.';

expect.extend(toHaveNoViolations);

describe('ComponentName', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<ComponentName />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  // add behaviour tests here
});
```

Rules:

- Every test file MUST include an axe accessibility assertion
- Query by role, label, and text — not by class or test ID
- Use `userEvent` over `fireEvent` for interactions
