export interface StaffLoadCandidate {
  load: number;
  staff: { displayOrder: number; _id: { toString(): string } };
}

/** BOOKING_ENGINE_SPEC §13: resolve equally available staff deterministically after load and display order. */
export function compareStaffLoad<T extends StaffLoadCandidate>(left: T, right: T): number {
  return left.load - right.load || left.staff.displayOrder - right.staff.displayOrder || left.staff._id.toString().localeCompare(right.staff._id.toString());
}
