---
name: mai3-design-system
description: 'Use when building UI, creating components, styling elements, generating HTML/CSS/JSX, or when the user mentions branding, design system, colors, typography, layout, buttons, cards, icons, or theme.'
version: 1.1.0
---

# MWS UI Toolkit v1.1 — Design System for Claude

All tokens must be declared as CSS custom properties on `:root`. Never hardcode color or font values — always use `var(--token)`.

## Colors

**Primary:** `--color-navy` `#000042` | `--color-blue` `#0018F2` | `--color-white` `#FFFFFF`
**Secondary:** `--color-magenta` `#F48DFF` | `--color-orange` `#FC561D` | `--color-gold` `#E5AC2E`
**Highlights:** `--color-teal` `#00E2C1` (primary CTA/highlight) | `--color-neon` `#D2FF3E` (use sparingly)
**Backgrounds:** `--color-pale-gold` `#F9E9D2` | `--color-pale-magenta` `#FFEDFF` | `--color-pale-orange` `#FFE2DE` | `--color-pale-blue` `#E2E8FF`
**Utility BGs (internal UIs only):** `--color-navy-gray-1` `#EBEBF2` | `--color-navy-gray-2` `#DEDEE5` | `--color-navy-gray-3` `#D2D2D9`
**Alerts (background fills only, text on alerts must be navy):**
`--color-error` `#FF3333` | `--color-success` `#75D957` | `--color-warning` `#F1E53C`

## Typography

**Typeface:** System fonts — no custom web fonts required.

- `--font-sans`: `-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` — body text, UI elements, buttons
- `--font-mix`: `Georgia, 'Times New Roman', serif` — navigation, display headings, card titles
- `--font-serif`: `Georgia, serif` — editorial content

**Capitalization:** Eyebrows/labels -> ALL CAPS | Buttons -> ALL CAPS | Headlines/page titles -> Sentence case | Proper nouns -> Title Case | Everything else -> Sentence case

## Buttons

All buttons: font-family: var(--font-sans), ALL CAPS, 14pt, 2px border-radius, min 140x36px.

- **Primary** — Light: teal bg `#00E2C1` + navy text. Hover: navy bg + white text. Dark: teal bg + navy text. Hover: white bg + navy text.
- **Secondary** — Light: white bg + 1px `#D9D9D9` border + navy text. Hover: navy bg + white text. Dark: teal bg + navy text. Hover: white bg + navy text.

## Links

- **CTA text links:** Sans Medium, ALL CAPS, 16pt, 10% letter-spacing, with arrow. Light: navy -> blue on hover. Dark: white -> teal on hover.
- **Hyperlinks:** Underlined, Sans Light, 18pt. Light: navy -> blue on hover. Dark: navy -> teal on hover.
- **Content titles:** Sans Light, 18pt, -2% letter-spacing, no underline. Light: navy -> blue on hover. Dark: navy -> teal on hover.
- **Navigation links:** Mix Light, 16pt, Initial caps. Default: navy. Hover: blue. Hit: teal.

## Icons

Source: Phosphor Icons (`@phosphor-icons/react`). Use the **regular** weight only (2px stroke). Monoline, no fill, single color, 24x24px area, rounded caps/corners. Max 48px. Navy on light, teal on dark. Use `display: inline-flex` on icon wrappers.

## Cards

Optional top stroke (any secondary color, full-width x 30px). Optional image area (400x400px @2x) or solid color fill. Text area: eyebrow (Sans Light, ALL CAPS, 16pt, 10% letter-spacing), title (Mix Regular, 38-60pt, -4% letter-spacing, 95% leading), body (Sans Light, 20pt, 140% leading). Use `border-radius: 2px` (`var(--radius)`).

## Dark/Light Theme

Theme is controlled via `[data-theme="light"]` or `[data-theme="dark"]` on the root element. Use semantic CSS variables — never reference raw colors directly:

| Purpose            | Light                       | Dark                        |
| ------------------ | --------------------------- | --------------------------- |
| Page background    | `--bg-page` #F7F7FC         | `--bg-page` #13134E         |
| Surface/card       | `--bg-surface` #FFFFFF      | `--bg-surface` #1C1C66      |
| Sidebar            | `--bg-sidebar` navy         | `--bg-sidebar` #0D0D46      |
| Primary text       | `--text-primary` navy       | `--text-primary` #FFFFFF    |
| Secondary text     | `--text-secondary`          | `--text-secondary`          |
| Interactive accent | `--accent-interactive` blue | `--accent-interactive` teal |
| Icon default       | `--icon-default` navy       | `--icon-default` teal       |
| Border             | `--border-light`            | `--border-light` #2C2C80    |

## Layout Tokens

`--sidebar-w: 260px` | `--control-h: 40px` | `--radius: 2px` | `--transition: 0.2s ease`

## Anti-patterns — Never Do This

- Hardcode hex colors instead of using CSS variables
- Use Tailwind utility classes — this project uses custom CSS
- Use border-radius > 2px (except pills/circles which use 999px)
- Use custom/web fonts — stick to the system font stacks defined in `--font-sans`, `--font-mix`, `--font-serif`
- Apply alert colors (#FF3333, #75D957, #F1E53C) to text — they are background fills only; text on alerts must be navy
- Use `<i>` tags for icons — use Phosphor React components
- Use navy-gray utility backgrounds in external/client-facing designs — they are for internal UIs only
- Use neon (`#D2FF3E`) liberally — reserve it for moments where maximum attention is needed
- Use filled Phosphor icons — all icons must be outline/monoline style only
- Skip hover states — every interactive element needs default, hover, and hit states
