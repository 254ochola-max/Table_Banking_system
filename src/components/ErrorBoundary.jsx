import React from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Check if error is related to dynamic chunk loading / stale deploy
    const isChunkError = 
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Expected a JavaScript-or-Wasm module script');

    if (isChunkError) {
      const reloadKey = 'error_boundary_chunk_reload';
      const lastReload = window.sessionStorage.getItem(reloadKey);
      const now = Date.now();
      
      // Auto-reload once if not done in the last 10 seconds
      if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
        window.sessionStorage.setItem(reloadKey, now.toString());
        window.location.reload();
      }
    }
  }

  handleReload = () => {
    // Clear storage keys and reload
    window.sessionStorage.removeItem('chunk_reload_retry');
    window.sessionStorage.removeItem('vite_chunk_preload_reload');
    window.sessionStorage.removeItem('error_boundary_chunk_reload');
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isChunkError =
        this.state.error?.name === 'ChunkLoadError' ||
        this.state.error?.message?.includes('Failed to fetch dynamically imported module') ||
        this.state.error?.message?.includes('Expected a JavaScript-or-Wasm module script');

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 bg-fuchsia-50 text-fuchsia-600 rounded-full flex items-center justify-center mx-auto mb-4">
              {isChunkError ? <RefreshCw className="w-7 h-7 animate-spin" /> : <AlertCircle className="w-7 h-7" />}
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {isChunkError ? 'New Update Available' : 'Something went wrong'}
            </h2>
            
            <p className="text-sm text-gray-600 mb-6">
              {isChunkError
                ? 'A new version of the app is available. Please refresh to load the latest version.'
                : 'An unexpected error occurred while displaying this page.'}
            </p>

            <button
              onClick={this.handleReload}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white font-semibold text-sm hover:from-fuchsia-700 hover:to-pink-700 transition shadow-md shadow-fuchsia-200 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
