import { describe, expect, it } from 'vitest';
import { assignCalendarLanes } from '@/features/calendar/appointment-lanes';

describe('assignCalendarLanes', () => {
  it('places simultaneous appointments in different lanes', () => {
    const positions = assignCalendarLanes([
      { id: 'first', startAt: 540, endAt: 600 },
      { id: 'second', startAt: 540, endAt: 600 },
    ]);

    expect(positions.get('first')).toEqual({ lane: 0, laneCount: 2 });
    expect(positions.get('second')).toEqual({ lane: 1, laneCount: 2 });
  });

  it('reuses a lane after an appointment ends and separates disconnected groups', () => {
    const positions = assignCalendarLanes([
      { id: 'long', startAt: 540, endAt: 660 },
      { id: 'early', startAt: 570, endAt: 600 },
      { id: 'late', startAt: 600, endAt: 630 },
      { id: 'separate', startAt: 720, endAt: 780 },
    ]);

    expect(positions.get('long')).toEqual({ lane: 0, laneCount: 2 });
    expect(positions.get('early')).toEqual({ lane: 1, laneCount: 2 });
    expect(positions.get('late')).toEqual({ lane: 1, laneCount: 2 });
    expect(positions.get('separate')).toEqual({ lane: 0, laneCount: 1 });
  });

  it('assigns adjacent appointments to the same lane', () => {
    const positions = assignCalendarLanes([
      { id: 'morning', startAt: 540, endAt: 600 },
      { id: 'next', startAt: 600, endAt: 660 },
    ]);

    expect(positions.get('morning')).toEqual({ lane: 0, laneCount: 1 });
    expect(positions.get('next')).toEqual({ lane: 0, laneCount: 1 });
  });
});
