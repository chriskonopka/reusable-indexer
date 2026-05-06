# Styling

- **SCSS Modules** — required for all component-scoped styles.
- **CSS Custom Properties (CSS Variables)** — use for design tokens: colors, spacing, typography, radii, shadows. All tokens are defined in `branding.md` and must be declared on `:root` in `global.css`.
- **Container Queries** — prefer over media queries when the layout depends on the component's container width, not the viewport.
- No inline styles except for truly dynamic values (e.g., calculated widths set via JS).
- No CSS-in-JS libraries (styled-components, Emotion, etc.).
- Use `color-mix()` for semi-transparent tints rather than hardcoded `rgba` values.
- Use `min-height: 100dvh` (dynamic viewport height) rather than `100vh` for full-height layouts.
