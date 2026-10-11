import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import type { ReactNode } from 'react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false } } });

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}><BrowserRouter>{children}</BrowserRouter></QueryClientProvider>;
}
