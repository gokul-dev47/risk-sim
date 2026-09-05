import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional label so the fallback can say which section broke (e.g. "Dashboard"). */
  sectionName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Without an error boundary anywhere, ANY uncaught error thrown during
 * render in ANY component — a missing field on a partially-stale API
 * response, a null the type system promised wasn't possible, a bug we
 * haven't found yet — unmounts the entire React tree and leaves a blank
 * screen with zero explanation. That is never an acceptable failure mode
 * for a demo, so this boundary wraps each major view: a crash inside one
 * view shows a clear, recoverable error card instead of taking down
 * navigation, the header, and every other view along with it.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.sectionName ?? 'view', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3 min-h-[240px]">
          <AlertTriangle className="h-8 w-8 text-soc-danger" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-soc-text">
            {this.props.sectionName ? `${this.props.sectionName} hit an error` : 'Something went wrong'}
          </h3>
          <p className="max-w-md text-xs text-soc-muted">
            This section failed to render, but the rest of the app is unaffected. This is usually caused by
            stale trained-model artifacts after a code update — try refreshing, and if it persists, retrain
            with <code className="font-mono">python3 run_pipeline.py</code>.
          </p>
          {this.state.error && (
            <pre className="max-w-md overflow-auto rounded-lg border border-soc-border bg-soc-card px-3 py-2 text-[10px] text-soc-muted text-left">
              {this.state.error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={this.handleReset}
            className="inline-flex items-center gap-1.5 rounded-lg bg-soc-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-soc-primary/90 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
