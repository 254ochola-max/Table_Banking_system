import { lazy } from 'react';

/**
 * Wraps React.lazy with automatic reload retry logic.
 * When a new deployment is pushed to production (e.g. Vercel), old chunk hashes
 * are removed from the server. If a user tries to navigate to a lazy-loaded route,
 * the browser will receive a 404 or text/html instead of the expected JS chunk.
 * 
 * lazyWithRetry detects this chunk loading failure and reloads the page once to 
 * fetch the new index.html with the latest chunk hashes.
 */
export function lazyWithRetry(componentImport) {
  return lazy(async () => {
    const pageHasBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('chunk_reload_retry') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('chunk_reload_retry', 'false');
      return component;
    } catch (error) {
      if (!pageHasBeenForceRefreshed) {
        // Mark that we are attempting a reload to avoid infinite reload loops
        window.sessionStorage.setItem('chunk_reload_retry', 'true');
        // Force reload to fetch the latest index.html and assets
        window.location.reload();
        return new Promise(() => {}); // Suspend indefinitely while reload takes place
      }

      // If already refreshed and still failing, throw to ErrorBoundary
      console.error('Failed to load dynamic module chunk after reload:', error);
      throw error;
    }
  });
}
