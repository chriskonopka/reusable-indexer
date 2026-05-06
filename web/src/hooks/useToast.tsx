import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

// Toast queue + provider. Pairs with the <ToastViewport /> primitive in
// components/Toast which subscribes to the queue via useToastQueue().
// Toasts auto-dismiss after AUTO_DISMISS_MS unless manually dismissed.

export type ToastTone = 'info' | 'error' | 'success';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

const AUTO_DISMISS_MS = 5000;

type ToastAction =
  | { type: 'PUSH'; toast: Toast }
  | { type: 'DISMISS'; id: string };

const reducer = (state: Toast[], action: ToastAction): Toast[] => {
  switch (action.type) {
    case 'PUSH':
      return [...state, action.toast];
    case 'DISMISS':
      return state.filter((toast) => toast.id !== action.id);
  }
};

interface ToastApi {
  push: (message: string, tone: ToastTone) => string;
  dismiss: (id: string) => void;
}

const ToastApiContext = createContext<ToastApi | null>(null);
const ToastQueueContext = createContext<Toast[]>([]);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [queue, dispatch] = useReducer(reducer, [] as Toast[]);
  const timeoutsRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const handle = timeoutsRef.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timeoutsRef.current.delete(id);
    }
    dispatch({ type: 'DISMISS', id });
  }, []);

  const push = useCallback(
    (message: string, tone: ToastTone): string => {
      const id = crypto.randomUUID();
      dispatch({ type: 'PUSH', toast: { id, message, tone } });
      const handle = setTimeout(() => {
        timeoutsRef.current.delete(id);
        dispatch({ type: 'DISMISS', id });
      }, AUTO_DISMISS_MS);
      timeoutsRef.current.set(id, handle);
      return id;
    },
    [],
  );

  // Clear any pending timers if the provider unmounts.
  useEffect(() => {
    const timers = timeoutsRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastApiContext.Provider value={api}>
      <ToastQueueContext.Provider value={queue}>{children}</ToastQueueContext.Provider>
    </ToastApiContext.Provider>
  );
};

export const useToast = (): ToastApi => {
  const value = useContext(ToastApiContext);
  if (!value) {
    throw new Error('useToast must be used inside <ToastProvider>.');
  }
  return value;
};

export const useToastQueue = (): Toast[] => useContext(ToastQueueContext);
