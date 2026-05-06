import { act, renderHook } from '@testing-library/react';
import { isHydrateAction, usePersistedReducer } from './usePersistedReducer';
import { __resetIndexerDbForTests, getValue } from '../utils/idb';
import { flushIDB } from '../test-utils';

interface CounterState {
  count: number;
}

type CounterAction =
  | { type: 'increment' }
  | { type: 'set'; value: number }
  | { type: '@@persistedReducer/HYDRATE'; payload: unknown };

const reducer = (state: CounterState, action: CounterAction): CounterState => {
  if (isHydrateAction(action)) {
    const payload = action.payload as Partial<CounterState> | undefined;
    return { ...state, ...(payload ?? {}) };
  }
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 };
    case 'set':
      return { count: action.value };
    default:
      return state;
  }
};

describe('usePersistedReducer', () => {
  beforeEach(() => {
    __resetIndexerDbForTests();
  });

  it('renders with initial state on first mount', () => {
    const { result } = renderHook(() =>
      usePersistedReducer(reducer, { count: 0 }, { store: 'ui', key: 'test' }),
    );
    expect(result.current[0]).toEqual({ count: 0 });
  });

  it('persists state to IndexedDB after a dispatch', async () => {
    const { result } = renderHook(() =>
      usePersistedReducer(reducer, { count: 0 }, { store: 'ui', key: 'persist' }),
    );

    await flushIDB();
    act(() => result.current[1]({ type: 'increment' }));
    await flushIDB();

    const persisted = await getValue<CounterState>('persistedReducer', 'ui:persist');
    expect(persisted).toEqual({ count: 1 });
  });

  it('hydrates from a previously persisted value on mount', async () => {
    const { result: first } = renderHook(() =>
      usePersistedReducer(reducer, { count: 0 }, { store: 'ui', key: 'hydrate' }),
    );

    await flushIDB();
    act(() => first.current[1]({ type: 'set', value: 7 }));
    await flushIDB();

    const { result: second } = renderHook(() =>
      usePersistedReducer(reducer, { count: 0 }, { store: 'ui', key: 'hydrate' }),
    );
    await flushIDB();

    expect(second.current[0]).toEqual({ count: 7 });
  });

  it('keeps initial state when no persisted value exists', async () => {
    const { result } = renderHook(() =>
      usePersistedReducer(reducer, { count: 5 }, { store: 'ui', key: 'fresh' }),
    );

    await flushIDB();
    expect(result.current[0]).toEqual({ count: 5 });
  });

  it('isolates persisted state by composed key', async () => {
    const { result: a } = renderHook(() =>
      usePersistedReducer(reducer, { count: 0 }, { store: 'ui', key: 'A' }),
    );
    const { result: b } = renderHook(() =>
      usePersistedReducer(reducer, { count: 0 }, { store: 'ui', key: 'B' }),
    );

    await flushIDB();
    act(() => a.current[1]({ type: 'set', value: 11 }));
    await flushIDB();

    expect(b.current[0].count).toBe(0);
    expect(await getValue<CounterState>('persistedReducer', 'ui:A')).toEqual({ count: 11 });
  });
});

describe('isHydrateAction', () => {
  it('matches the hydrate meta-action shape', () => {
    expect(isHydrateAction({ type: '@@persistedReducer/HYDRATE', payload: 1 })).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isHydrateAction({ type: 'increment' })).toBe(false);
    expect(isHydrateAction(null)).toBe(false);
    expect(isHydrateAction('string')).toBe(false);
    expect(isHydrateAction(42)).toBe(false);
  });
});
