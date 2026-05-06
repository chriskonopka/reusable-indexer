# State Management

Choose the simplest solution that fits the problem. Escalate only when justified.

| Scope                               | Tool                         |
| ----------------------------------- | ---------------------------- |
| Local UI state                      | `useState`                   |
| Derived or complex local state      | `useReducer`                 |
| Shared state across a subtree       | React Context + `useReducer` |
| Large app with complex global state | Redux Toolkit                |

**Rules:**

- Prefer `useReducer` over deeply nested `useState` calls.
- Use Redux Toolkit only when Context + `useReducer` becomes unmanageable — document the reason.
- Colocate state as close to where it is used as possible.

**Reducer conventions:**

- Action types must be discriminated unions with `UPPER_SNAKE_CASE` string literals.
- Reducers must use exhaustive `switch` statements with no `default` case — let TypeScript catch missing cases at compile time.
- Custom hooks that return more than one value must export a named return type interface.

## Data Fetching

- Use **TanStack Query (React Query)** for all async server state.
- Use the **native `fetch` API** — avoid axios unless there is a specific need.
- Separate server state (TanStack Query) from client/UI state (React state or Redux).
- Always handle loading, error, and empty states explicitly.
