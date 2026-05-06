import type { ThemeTokenKey } from '@shared/types';

// What belongs here: the built-in MWS theme tokens (light + dark) the indexer
// applies as CSS custom properties. Host overrides merge over these.
// Source: /.claude/rules/web-branding.md.
//
// Keep these aligned with branding.md by hand — they are the single source
// of truth for token VALUES, while web-branding.md is the rule reference.

export const INDEXER_THEME_TOKENS_LIGHT: Record<ThemeTokenKey, string> = {
  'color-navy': '#000042',
  'color-blue': '#0018F2',
  'color-teal': '#00E2C1',
  'color-magenta': '#F48DFF',
  'color-orange': '#FC561D',
  'color-gold': '#E5AC2E',
  'color-error': '#FF3333',
  'color-success': '#75D957',
  'color-warning': '#F1E53C',
  'bg-page': '#F7F7FC',
  'bg-surface': '#FFFFFF',
  'bg-sidebar': '#000042',
  'text-primary': '#000042',
  'text-secondary': '#000042',
  'accent-interactive': '#0018F2',
  'icon-default': '#000042',
  'border-light': '#DEDEE5',
};

export const INDEXER_THEME_TOKENS_DARK: Record<ThemeTokenKey, string> = {
  'color-navy': '#000042',
  'color-blue': '#0018F2',
  'color-teal': '#00E2C1',
  'color-magenta': '#F48DFF',
  'color-orange': '#FC561D',
  'color-gold': '#E5AC2E',
  'color-error': '#FF3333',
  'color-success': '#75D957',
  'color-warning': '#F1E53C',
  'bg-page': '#13134E',
  'bg-surface': '#1C1C66',
  'bg-sidebar': '#0D0D46',
  'text-primary': '#FFFFFF',
  'text-secondary': '#FFFFFF',
  'accent-interactive': '#00E2C1',
  'icon-default': '#00E2C1',
  'border-light': '#2C2C80',
};
