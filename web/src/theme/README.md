# theme/

MWS theme tokens, dark/light mode wiring, and the pre-paint script. Tier 2.

## What belongs here

- `tokens.ts` — built-in MWS tokens for light and dark modes. Single source of truth for token values.
- `ThemeProvider.tsx` — applies tokens as CSS custom properties on a scoped wrapper; sets `data-theme` on `<html>`; merges host overrides.
- `prePaintScript.ts` — the inline `<head>` script that sets `data-theme` before first paint to avoid flash.

## What does not belong here

- Component styles — those live next to each component as `*.module.scss`.
- Imports from `features/*` — features depend on theme, never the reverse.
- Colour or font values for anything outside the documented `ThemeTokenKey` set — extend the type in `/shared/types/host-contract.ts` first.

## Notes

Hard-coded colours and fonts are forbidden anywhere in the codebase per `web-branding.md` and `web-styling.md`. Always read tokens via the CSS custom property (`var(--color-navy)`), never the literal hex.
