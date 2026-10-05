import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api-client';
import type { MembershipDto, UserDto } from '@/shared/types/dto';
import type { BusinessRole, BusinessCurrency, BusinessCountryCode } from '@/shared/constants';

export interface SessionDto {
  user: UserDto;
  membership: MembershipDto;
  active: {
    businessId: string;
    role: BusinessRole;
    staffId?: string;
    business: {
      name: string;
      slug: string;
      timezone: string;
      currency: BusinessCurrency;
      countryCode: BusinessCountryCode;
    };
  };
  permissions: string[];
}

export function useSession() {
  return useQuery<SessionDto>({
    queryKey: ['session'],
    queryFn: () => apiRequest<SessionDto>('/api/auth/me', { redirectOnUnauthorized: false }),
    retry: false,
    staleTime: 60_000,
  });
}
