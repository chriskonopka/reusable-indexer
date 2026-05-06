# Frontend Code Quality Remediation Logic

## Auto-Fixable Issues (Apply + Ask Approval)

### Obvious Fixes (one-liner)

- **Component not PascalCase** — rename, use `const` arrow function with named export
- **Hook not prefixed with `use`** — rename (e.g., `fetchData` → `useFetchData`)
- **Boolean not prefixed** — rename with `is`/`has`/`should`/`can` prefix
- **Constants not UPPER_SNAKE_CASE** — rename
- **Hardcoded color values** — replace with CSS custom properties from design tokens
- **Bypassing barrel export** — change to import from feature's `index.ts`
- **fireEvent → userEvent** — replace with `await userEvent.click/type/etc.`
- **Querying by testID → role** — replace with `getByRole`/`getByLabel`/`getByText`
- **Default export → named export**
- **Inline object literal in JSX** — extract to constant or memoize

Rule references for all: @.claude/rules/web-coding-standards.md, @.claude/rules/web-component-architecture.md, @.claude/rules/web-file-structure.md, @.claude/rules/web-testing.md, @.claude/rules/web-branding.md

### Non-Obvious Fixes (with pattern)

**Non-semantic click handler → accessible button:**
```tsx
// Bad: <div onClick={toggle}>Menu</div>
<button type="button" onClick={toggle} aria-expanded={isOpen}>Menu</button>
```
Rule: @.claude/rules/web-accessibility.md

**Toggle without aria-pressed:**
```tsx
<button onClick={toggleTheme} aria-pressed={isDarkMode}>Theme</button>
```

**Dynamic content without aria-live:**
```tsx
<span aria-live="polite">{statusMessage}</span>
```

**Unnecessary re-renders on list items** — should avoid creating new references each render. Use React Compiler (preferred if available) or manual React.memo + useCallback pairing.
Rule: @.claude/rules/web-component-architecture.md

**Missing axe assertion in test:**
```tsx
it('has no accessibility violations', async () => {
  const { container } = render(<ComponentName />);
  expect(await axe(container)).toHaveNoViolations();
});
```

## Manual Issues (Report + Suggest Approach)

- **API calls in presentation components** — extract to custom hook
- **Business logic in UI** — extract to utility functions or hooks
- **Prop drilling >2 levels** — suggest Context provider
- **useState → useReducer** — suggest when 3+ related state variables
- **Redux Toolkit** — suggest when multiple features share state
- **Code splitting** — `React.lazy()` + `Suspense` for route-level components
- **Virtualization** — suggest react-window or react-virtualized for lists rendering 100+ items
