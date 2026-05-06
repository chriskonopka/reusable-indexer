// What belongs here: ergonomic re-export of the host contract types from
// /shared/types/host-contract.ts so deep imports stay clean.
// See module-boundaries.md §2.

export type {
  IndexerAppProps,
  IndexerEvent,
  IndexerHandle,
  IndexerInitialState,
  ThemeTokenKey,
} from '@shared/types';
