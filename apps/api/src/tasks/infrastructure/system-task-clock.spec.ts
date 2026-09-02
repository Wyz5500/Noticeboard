/** Verifies task business-date readings independently from the host process time zone. */
import { describe, expect, it } from 'vitest';

import { SystemTaskClock } from './system-task-clock.js';

describe('SystemTaskClock', () => {
  /** Verifies one instant is projected through the configured IANA time zone. */
  it('derives the Shanghai business date from one fixed instant', () => {
    const reading = new SystemTaskClock(
      'Asia/Shanghai',
      undefined,
      () => new Date('2026-09-01T16:30:00.000Z'),
    ).read();

    expect(reading).toEqual({
      instant: '2026-09-01T16:30:00.000Z',
      currentDate: '2026-09-02',
    });
  });

  /** Verifies deterministic test dates do not replace the mutation timestamp source. */
  it('uses a validated date override without changing the instant', () => {
    const reading = new SystemTaskClock(
      'Asia/Shanghai',
      ' 2026-09-01 ',
      () => new Date('2026-09-03T04:30:00.000Z'),
    ).read();

    expect(reading).toEqual({
      instant: '2026-09-03T04:30:00.000Z',
      currentDate: '2026-09-01',
    });
  });

  /** Verifies an empty optional environment value falls back to calendar projection. */
  it('treats a blank date override as unset', () => {
    const reading = new SystemTaskClock(
      'Asia/Shanghai',
      '   ',
      () => new Date('2026-09-01T16:30:00.000Z'),
    ).read();

    expect(reading.currentDate).toBe('2026-09-02');
  });

  /** Verifies malformed and impossible overrides fail during application composition. */
  it.each(['2026-9-1', '2026-02-30', 'not-a-date'])(
    'rejects invalid date override %s',
    (override) => {
      expect(() => new SystemTaskClock('Asia/Shanghai', override)).toThrow(
        /TASK_CURRENT_DATE_OVERRIDE/,
      );
    },
  );

  /** Verifies an invalid time-zone configuration fails before serving requests. */
  it('rejects an invalid IANA business time zone', () => {
    expect(() => new SystemTaskClock('Shanghai', undefined)).toThrow(
      /TASK_BUSINESS_TIME_ZONE/,
    );
  });
});
