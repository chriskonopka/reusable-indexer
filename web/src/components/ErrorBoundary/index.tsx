import { Component, ErrorInfo, ReactNode } from 'react';

// What belongs here: catches render-phase exceptions inside the indexer's
// subtree. Reports to host telemetry via the supplied onError callback,
// which Providers wires up to emit IndexerEvent('error/unhandled').
// See module-boundaries.md §2.1 and shared-inventory.md §2.

interface Props {
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div role="alert">
            <p>Something went wrong inside the indexer.</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
