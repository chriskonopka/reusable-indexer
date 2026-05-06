import { ReactNode, useCallback, useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { IndexerAppProps } from '@shared/types';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { HostProvider } from '../host/HostContext';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ToastProvider } from '../hooks/useToast';
import { ActiveDocumentSetProvider } from '../features/collections/state';
import { UploadProvider } from '../features/upload';

// Composition root for the indexer's React tree. Order matters:
//   HostProvider — must wrap everything (api/theme/active-collection read host).
//   ThemeProvider — applies CSS vars + data-theme to the DOM.
//   QueryClientProvider — server-state cache; sits above features.
//   ToastProvider — surfaces errors from any feature.
//   ActiveDocumentSetProvider — collections read/write active state and emit
//     `collection/activated` events. Must sit below QueryClientProvider so it
//     can read the cached document-set list.
//   ErrorBoundary — catches render-phase exceptions, routes via host.onEvent.

interface ProvidersProps {
  host: IndexerAppProps;
  children: ReactNode;
}

const buildQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });

export const Providers = ({ host, children }: ProvidersProps) => {
  // One QueryClient per indexer mount. Re-initialised if the host remounts.
  const queryClient = useMemo(buildQueryClient, []);

  const handleError = useCallback(
    (error: Error) => {
      host.onEvent?.({
        type: 'error/unhandled',
        operationId: null,
        messageForLogs: error.name,
      });
      host.appInsights?.trackException({ exception: error });
    },
    [host],
  );

  return (
    <HostProvider value={host}>
      <ThemeProvider initialTheme={host.initialTheme} overrides={host.themeOverrides}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <ActiveDocumentSetProvider>
              <UploadProvider>
                <ErrorBoundary onError={handleError}>{children}</ErrorBoundary>
              </UploadProvider>
            </ActiveDocumentSetProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </HostProvider>
  );
};
