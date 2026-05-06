/**
 * Host contract for the reusable indexer.
 *
 * Scope reminder: the indexer ships ingestion + collection management
 * (upload, collections, folders, file list, processing status, failure
 * triage). It does NOT ship chat, citations, or a document viewer —
 * those belong to the consuming application. This contract is the
 * surface the consuming app uses to build those features on top.
 *
 * If you change anything here, update /docs/architecture/module-boundaries.md
 * and trigger a re-review — every consuming app builds against this shape.
 */

import type { ApplicationInsights } from '@microsoft/applicationinsights-web';
import type { AccessRole } from './api';

// =============================================================================
// Theme override keys
// =============================================================================

/**
 * Subset of MWS branding tokens the host may override at mount time.
 * Each key maps to a CSS custom property the indexer reads in styles.
 *
 * Source: /.claude/rules/web-branding.md.
 */
export type ThemeTokenKey =
  | 'color-navy'
  | 'color-blue'
  | 'color-teal'
  | 'color-magenta'
  | 'color-orange'
  | 'color-gold'
  | 'color-error'
  | 'color-success'
  | 'color-warning'
  | 'bg-page'
  | 'bg-surface'
  | 'bg-sidebar'
  | 'text-primary'
  | 'text-secondary'
  | 'accent-interactive'
  | 'icon-default'
  | 'border-light';

// =============================================================================
// Events emitted by the indexer to the host
// =============================================================================

export type IndexerEvent =
  /**
   * The indexer received a 401 from the API. The host owns the recovery —
   * typically silent token refresh, then remount, or interactive login.
   * The indexer stops making API calls after this event until remounted.
   */
  | { type: 'auth/expired' }

  /**
   * The active collection changed (user clicked one in the sidebar, the
   * host called selectCollection(), or last-active state was restored on
   * mount). The consuming app uses this to scope its chat / viewer / etc.
   * to the same collection. Emitted with `null` when no collection is
   * active (empty state, or active collection was deleted).
   */
  | {
      type: 'collection/activated';
      documentSetId: string | null;
      accessRole: AccessRole | null;
    }

  /**
   * The user's collection list changed (created, renamed, deleted, or a
   * share was granted/revoked). Emitted with no payload — the consuming
   * app should re-fetch via the API if it cares.
   */
  | { type: 'collection/list-changed' }

  /**
   * The user clicked a ready document row in the file list. The consuming
   * app typically responds by opening its viewer at this document.
   * Includes folder context so the consuming app can render a breadcrumb
   * or back-link without refetching.
   */
  | {
      type: 'document/selected';
      documentSetId: string;
      documentId: string;
      folderId: string | null;
    }

  /**
   * An unhandled error escaped the indexer's error boundary. The indexer
   * remains mounted and shows its own fallback UI; the host is informed
   * for cross-cutting telemetry. No PII or user content in `messageForLogs`.
   */
  | {
      type: 'error/unhandled';
      operationId: string | null;
      messageForLogs: string;
    };

// =============================================================================
// Imperative API exposed via ref
// =============================================================================

/**
 * The consuming app can take a ref to the <IndexerApp /> and drive it
 * imperatively. Useful when the host has a URL like /c/{id} and wants the
 * indexer to follow, or when a citation click in the consuming app's chat
 * should navigate the indexer to the cited document.
 *
 * Every method is a no-op when the requested target is not in the user's
 * accessible set (no error, no event); the consuming app should treat this
 * as best-effort navigation, not a guaranteed transition.
 */
export interface IndexerHandle {
  /** Programmatically switch the active collection. No-op if not in the user's list. */
  selectCollection: (documentSetId: string | null) => void;
  /**
   * Reveal a document in the file list — opens its parent folder, scrolls
   * it into view, and applies a transient highlight. No-op if the document
   * is not in the active collection.
   */
  revealDocument: (documentId: string) => void;
}

// =============================================================================
// Initial state for deep-linking
// =============================================================================

export interface IndexerInitialState {
  documentSetId?: string;
  folderId?: string;
  documentId?: string;
}

// =============================================================================
// The props the host passes to <IndexerApp />
// =============================================================================

export interface IndexerAppProps {
  /**
   * Base URL of the GlobalIndexer API. No trailing slash.
   * Example: "https://globalapi-test-dcfad7eka5b0gkhk.z01.azurefd.net"
   */
  apiBaseUrl: string;

  /**
   * Returns a current, non-expired Entra ID bearer token. Called once per
   * outbound HTTP request. The host owns refresh, MSAL state, and login UI.
   * Throwing or returning an empty string causes the indexer to surface an
   * `auth/expired` event and stop calling the API.
   */
  getAccessToken: () => Promise<string>;

  /**
   * Optional shared App Insights instance. If supplied, the indexer logs
   * all telemetry through it and does NOT call loadAppInsights() — the
   * host is responsible for initialization. If omitted, the indexer
   * initializes its own instance using the connection string baked into
   * its bundle, or skips telemetry entirely if none is present.
   */
  appInsights?: ApplicationInsights;

  /**
   * Optional. Overrides the indexer's MWS theme tokens. Unspecified keys
   * fall back to the built-in tokens.
   */
  themeOverrides?: Partial<Record<ThemeTokenKey, string>>;

  /**
   * Optional. If omitted, the indexer reads `prefers-color-scheme` and the
   * persisted user preference (`localStorage` `theme-preference`).
   */
  initialTheme?: 'light' | 'dark';

  /** Optional. Deep-link the indexer at mount time. */
  initialState?: IndexerInitialState;

  /** Optional. Receives all `IndexerEvent` notifications. */
  onEvent?: (event: IndexerEvent) => void;
}
