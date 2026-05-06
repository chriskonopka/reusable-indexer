# Accessibility

Follow **WCAG 2.1 AA** as the baseline. The `jsx-a11y/recommended` ESLint ruleset and jest-axe assertions catch most violations automatically.

## Common gotchas

- Toggle and filter buttons must use `aria-pressed` — not just a visual active class.
- Dynamic text updates (counts, status messages) need `aria-live="polite"` and `aria-atomic="true"`.
- Modals must trap focus, return focus to the trigger on close, and close on Escape.
- Every page must include a visible "Skip to main content" link as the first focusable element.
- Decorative SVGs need both `aria-hidden="true"` and `focusable="false"`.
