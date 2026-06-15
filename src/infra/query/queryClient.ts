import { QueryClient } from '@tanstack/react-query';

// v1.6.1 — single shared QueryClient extracted from app/_layout.tsx so it can
// be cleared on logout (cross-user cache leak fix). HealthKit reads are the
// first consumer — modest staleTime keeps today's calories fresh without
// over-fetching across tab navigation.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
