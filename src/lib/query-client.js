import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Cache results for 30 seconds before considering them stale.
			// This prevents redundant refetches when navigating between pages.
			staleTime: 30_000,
			// Keep unused query data in memory for 5 minutes so navigating
			// back to a page is instant even if the entry has gone stale.
			gcTime: 5 * 60_000,
		},
	},
});