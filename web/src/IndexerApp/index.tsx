import { forwardRef } from 'react';
import type { IndexerAppProps, IndexerHandle } from '@shared/types';
import { Providers } from './Providers';
import { RootShell } from './RootShell';

// Module Federation entry point. Forwarded ref is attached to RootShell
// (which uses useImperativeHandle to expose IndexerHandle). The host
// supplies IndexerAppProps; the indexer never reads the host's React state.

export const IndexerApp = forwardRef<IndexerHandle, IndexerAppProps>((props, ref) => {
  return (
    <Providers host={props}>
      <RootShell ref={ref} />
    </Providers>
  );
});

IndexerApp.displayName = 'IndexerApp';

export default IndexerApp;
