import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2020,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
      import: importPlugin,
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: {
          project: './tsconfig.app.json',
        },
        node: {
          extensions: ['.ts', '.tsx', '.js', '.jsx'],
        },
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'no-console': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      // TypeScript's compiler checks for undefined identifiers and knows
      // about lib types like `ResponseInit`, `RequestInit`, etc. ESLint's
      // `no-undef` rule does not understand TS types — disable it here.
      'no-undef': 'off',
      // Allow `_`-prefixed parameters and locals to mark intentionally
      // unused values — used heavily in scaffold stubs and signature
      // placeholders. Same convention applied to caught-error variables.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],

      // Module-boundary enforcement — see /docs/architecture/dependency-graph.md.
      'import/no-cycle': ['error', { maxDepth: 10 }],

      // The /shared/types/host-contract module has a single sanctioned
      // read path (host/useHost.ts) — see module-boundaries.md §2.
      // Per-folder overrides below tighten this further.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@shared/types/host-contract'],
              message:
                'Read the host contract through host/useHost.ts. Direct imports of /shared/types/host-contract are reserved for files inside web/src/host/.',
            },
          ],
        },
      ],
    },
  },
  // Cross-feature imports are forbidden inside features/. RootShell
  // (IndexerApp/) is allowed to compose features per dependency-graph.md
  // tier model — that's why this rule lives here, not on the global block.
  //
  // Listed feature-by-feature. As S2/S3 add `folders`, `fileList`, and
  // `upload`, extend each block with its sibling features.
  {
    files: ['src/features/collections/**'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../folders/**',
                '../../folders/**',
                '../fileList/**',
                '../../fileList/**',
                '../upload/**',
                '../../upload/**',
              ],
              message:
                'Features cannot import from each other. Hoist shared code to components/, hooks/, or utils/ — see module-boundaries.md §3.1.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/folders/**'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../collections/**',
                '../../collections/**',
                '../fileList/**',
                '../../fileList/**',
                '../upload/**',
                '../../upload/**',
              ],
              message:
                'Features cannot import from each other. Hoist shared code to components/, hooks/, or utils/ — see module-boundaries.md §3.1.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/fileList/**'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../collections/**',
                '../../collections/**',
                '../folders/**',
                '../../folders/**',
                '../upload/**',
                '../../upload/**',
              ],
              message:
                'Features cannot import from each other. Hoist shared code to components/, hooks/, or utils/ — see module-boundaries.md §3.1.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/upload/**'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../collections/**',
                '../../collections/**',
                '../folders/**',
                '../../folders/**',
                '../fileList/**',
                '../../fileList/**',
              ],
              message:
                'Features cannot import from each other. Hoist shared code to components/, hooks/, or utils/ — see module-boundaries.md §3.1.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/setupTests.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      // Tests reach into mocks and helpers freely; the strict cross-tier
      // rules enforced for production code don't fit the test ergonomics.
      'no-restricted-imports': 'off',
    },
  },
  // The host/ directory owns the single read path for /shared/types/host-contract.
  // Files here are permitted to import it directly.
  {
    files: ['src/host/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    files: ['playwright.config.ts', 'webpack.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
