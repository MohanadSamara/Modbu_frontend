import { Component } from 'react';

// Catches render-time crashes anywhere below it and shows a themed recovery
// screen instead of React's blank white page.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1117] p-6">
        <div className="animate-scale-in w-full max-w-md rounded-2xl bg-[#13151c] border border-white/10 shadow-2xl p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                d="M12 9v3m0 3h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="mt-5 text-lg font-bold text-white">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-400">
            An unexpected error occurred while rendering this page. You can try
            reloading — if it keeps happening, check the browser console for details.
          </p>
          {this.state.error?.message && (
            <p className="mt-3 px-3 py-2 rounded-lg bg-white/5 text-xs text-red-300/80 font-mono break-words">
              {this.state.error.message}
            </p>
          )}
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" className="btn-ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
