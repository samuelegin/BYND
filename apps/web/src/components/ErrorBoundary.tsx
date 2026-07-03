import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[BYND] Uncaught render error:', error, errorInfo.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-lg w-full border border-void-border p-8 space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-acid font-bold">
              // System Fault
            </p>
            <h1 className="font-mono text-lg text-silver uppercase tracking-widest">
              Something went wrong
            </h1>
            <p className="font-mono text-[10px] text-void-muted break-all">
              {this.state.error.message}
            </p>
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.location.reload()}
                className="bg-acid text-void font-mono text-[10px] uppercase tracking-widest font-bold px-6 py-2 hover:opacity-80 transition-opacity"
              >
                Reload
              </button>
              <button
                onClick={() => this.setState({ error: null })}
                className="border border-void-border text-void-muted font-mono text-[10px] uppercase tracking-widest px-6 py-2 hover:text-silver transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
