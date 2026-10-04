'use client';

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api-client';

export function useApi<TData>(
  queryKey: readonly unknown[],
  path: string,
  options: Omit<UseQueryOptions<TData>, 'queryKey' | 'queryFn'> = {},
) {
  return useQuery<TData>({
    ...options,
    queryKey,
    queryFn: () => apiRequest<TData>(path),
  });
}
