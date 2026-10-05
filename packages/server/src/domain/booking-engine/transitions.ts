import type { BusinessRole } from '@/shared/constants';

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

const transitions: Record<AppointmentStatus, Partial<Record<AppointmentStatus, readonly BusinessRole[]>>> = {
  pending: { confirmed: ['owner', 'admin', 'master'], completed: ['owner', 'admin'], cancelled: ['owner', 'admin', 'master'], no_show: ['owner', 'admin'] },
  confirmed: { completed: ['owner', 'admin', 'master'], cancelled: ['owner', 'admin', 'master'], no_show: ['owner', 'admin', 'master'] },
  completed: { confirmed: ['owner', 'admin'] },
  cancelled: { confirmed: ['owner', 'admin'] },
  no_show: { confirmed: ['owner', 'admin'], completed: ['owner', 'admin'] },
};

/** BOOKING_ENGINE_SPEC §9: transitions are role- and source-state-specific; equal-state writes are invalid. */
export function canTransitionStatus(from: AppointmentStatus, to: AppointmentStatus, role: BusinessRole): boolean {
  return transitions[from][to]?.includes(role) ?? false;
}
