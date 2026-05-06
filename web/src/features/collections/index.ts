// Public barrel for the collections feature. Anything not exported here is
// private to the feature; cross-feature consumers must go through this file.
//
// See module-boundaries.md §3.1.

export { ActiveDocumentSetProvider, useActiveDocumentSet } from './state';
export { CollectionsSidebar } from './CollectionsSidebar';
