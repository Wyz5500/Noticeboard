/** Defines the task-scoped business clock used by reads and mutations. */

export interface TaskClockReading {
  instant: string;
  currentDate: string;
}

export interface TaskClockPort {
  /** Reads one internally consistent instant and business date. */
  read(): TaskClockReading;
}

export const TASK_CLOCK = Symbol('TASK_CLOCK');
