import type { IndexerAppProps, IndexerEvent } from '@shared/types';

// What belongs here: a fake host implementation used by `npm run dev` to
// boot the indexer standalone. Production hosts (Module Federation
// consumers) supply their own IndexerAppProps. See shared-inventory.md §4.
//
// The stub host does NOT call the real API. getAccessToken returns a
// placeholder string; the standalone shell is for layout work, not for
// hitting the live GlobalIndexer API.

const STUB_TOKEN = 'stub-host-token-not-valid-for-real-api';
const STUB_API_BASE_URL = 'http://localhost-stub-host';

export const createStubHost = (): IndexerAppProps => {
  return {
    apiBaseUrl: STUB_API_BASE_URL,
    getAccessToken: async () => STUB_TOKEN,
    onEvent: (event: IndexerEvent) => {
      // eslint-disable-next-line no-console
      console.info('[stubHost] IndexerEvent', event);
    },
  };
};
