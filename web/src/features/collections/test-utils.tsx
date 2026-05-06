import { ReactNode, useEffect, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IndexerAppProps } from '@shared/types';
import { HostProvider } from '../../host/HostContext';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ToastProvider } from '../../hooks/useToast';
import { ToastViewport } from '../../components/Toast';
import { ActiveDocumentSetProvider, useActiveDocumentSet } from './state';

// Test harness for collections-feature components. Provides every context
// the feature uses; tests stub `getAccessToken` + `fetch` to drive
// behaviour. Mirrors IndexerApp/Providers but without the ErrorBoundary
// so tests see thrown errors directly.

interface HarnessProps {
  host?: Partial<IndexerAppProps>;
  /**
   * Optional documentSetId to activate immediately after mount via
   * `useActiveDocumentSet().select(...)`. Used by tests that need a
   * pre-existing active collection without driving the UI to set it.
   */
  initialActiveId?: string;
  children: ReactNode;
}

export const buildTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });

const InitialActiveIdSetter = ({ id }: { id: string }) => {
  const { select } = useActiveDocumentSet();
  useEffect(() => {
    select(id, 'Owner');
  }, [id, select]);
  return null;
};

export const Harness = ({ host = {}, initialActiveId, children }: HarnessProps) => {
  const fullHost = useMemo<IndexerAppProps>(
    () => ({
      apiBaseUrl: 'https://test.invalid',
      getAccessToken: async () => 'test-token',
      onEvent: () => {},
      ...host,
    }),
    [host],
  );
  const queryClient = useMemo(buildTestQueryClient, []);
  return (
    <HostProvider value={fullHost}>
      <ThemeProvider initialTheme="light">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ActiveDocumentSetProvider>
              {initialActiveId && <InitialActiveIdSetter id={initialActiveId} />}
              {children}
              <ToastViewport />
            </ActiveDocumentSetProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};
