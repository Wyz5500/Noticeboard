/** Implements task business-date readings without relying on the host process time zone. */
import type {
  TaskClockPort,
  TaskClockReading,
} from '../application/ports/task-clock.port.js';

const DEFAULT_TASK_TIME_ZONE = 'Asia/Shanghai';

/** Normalizes an optional date-only override and rejects impossible calendar dates. */
function normalizeCurrentDateOverride(value?: string): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error('TASK_CURRENT_DATE_OVERRIDE 必须是有效的 YYYY-MM-DD 日期');
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error('TASK_CURRENT_DATE_OVERRIDE 必须是有效的 YYYY-MM-DD 日期');
  }
  return normalized;
}

/** Creates a validated calendar formatter for one IANA business time zone. */
function createDateFormatter(timeZone: string): Intl.DateTimeFormat {
  const normalized = timeZone.trim() || DEFAULT_TASK_TIME_ZONE;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: normalized,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    throw new Error('TASK_BUSINESS_TIME_ZONE 必须是有效的 IANA 时区');
  }
}

export class SystemTaskClock implements TaskClockPort {
  private readonly formatter: Intl.DateTimeFormat;
  private readonly currentDateOverride: string | undefined;

  /** Receives validated business-date configuration and a replaceable instant source for tests. */
  constructor(
    timeZone: string,
    currentDateOverride?: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.formatter = createDateFormatter(timeZone);
    this.currentDateOverride =
      normalizeCurrentDateOverride(currentDateOverride);
  }

  /** Reads one instant and returns its configured or time-zone-derived business date. */
  read(): TaskClockReading {
    const date = this.now();
    if (this.currentDateOverride) {
      return {
        instant: date.toISOString(),
        currentDate: this.currentDateOverride,
      };
    }
    const parts = this.formatter.formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';
    return {
      instant: date.toISOString(),
      currentDate: `${value('year')}-${value('month')}-${value('day')}`,
    };
  }
}
