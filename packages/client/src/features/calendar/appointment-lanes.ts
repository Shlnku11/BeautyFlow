export interface CalendarLaneInput {
  id: string;
  startAt: number;
  endAt: number;
}

export interface CalendarLanePosition {
  lane: number;
  laneCount: number;
}

export function assignCalendarLanes(appointments: readonly CalendarLaneInput[]): Map<string, CalendarLanePosition> {
  const ordered = [...appointments].sort((left, right) => left.startAt - right.startAt || left.endAt - right.endAt || left.id.localeCompare(right.id));
  const groups: CalendarLaneInput[][] = [];
  let groupEnd = Number.NEGATIVE_INFINITY;

  for (const appointment of ordered) {
    const group = groups.at(-1);
    if (!group || appointment.startAt >= groupEnd) {
      groups.push([appointment]);
      groupEnd = appointment.endAt;
    } else {
      group.push(appointment);
      groupEnd = Math.max(groupEnd, appointment.endAt);
    }
  }

  const positions = new Map<string, CalendarLanePosition>();
  for (const group of groups) {
    const laneEnds: number[] = [];
    const groupPositions = group.map((appointment) => {
      const availableLane = laneEnds.findIndex((endAt) => endAt <= appointment.startAt);
      const lane = availableLane === -1 ? laneEnds.length : availableLane;
      laneEnds[lane] = appointment.endAt;
      return { id: appointment.id, lane };
    });
    for (const position of groupPositions) positions.set(position.id, { lane: position.lane, laneCount: laneEnds.length });
  }

  return positions;
}
