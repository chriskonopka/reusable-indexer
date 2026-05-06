import { createContext, ReactNode } from 'react';
import type { IndexerAppProps } from '@shared/types';

// What belongs here: the React Context that carries the host-supplied
// IndexerAppProps. Every layer that needs apiBaseUrl, getAccessToken,
// appInsights, or onEvent reads from here via useHost().
// See module-boundaries.md §2 and shared-inventory.md §4.

export const HostContext = createContext<IndexerAppProps | null>(null);

interface HostProviderProps {
  value: IndexerAppProps;
  children: ReactNode;
}

export const HostProvider = ({ value, children }: HostProviderProps) => {
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
};
