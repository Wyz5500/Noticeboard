/** Tests the machine-readable host application readiness record. */
import { describe, expect, it } from 'vitest';

import * as applicationReady from './application-ready.js';

describe('application ready logging', () => {
  /** Produces the exact event consumed by host lifecycle orchestration. */
  it('serializes the actual Fastify listen URL', () => {
    expect(typeof applicationReady.createApplicationReadyRecord).toBe(
      'function',
    );
    expect(
      JSON.parse(
        applicationReady.createApplicationReadyRecord('http://127.0.0.1:43123'),
      ),
    ).toEqual({
      level: 'info',
      event: 'application.ready',
      url: 'http://127.0.0.1:43123',
    });
  });
});
