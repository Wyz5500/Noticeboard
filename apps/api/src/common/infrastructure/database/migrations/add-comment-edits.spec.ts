/** Verifies comment-edit constraints release exclusive locks before table validation. */
import { describe, expect, it } from 'vitest';
import type { QueryRunner } from 'typeorm';

import { AddCommentEdits1788062406000 } from './1788062406000-add-comment-edits.js';

/** Records transaction-scoped SQL without replacing migration orchestration behavior. */
class RecordingQueryRunner {
  readonly committedPhases: string[][] = [];
  readonly outsideTransaction: string[] = [];
  private activePhase: string[] | null = null;

  /** Starts one explicit migration phase. */
  async startTransaction(): Promise<void> {
    if (this.activePhase) throw new Error('Nested phase');
    this.activePhase = [];
  }

  /** Records normalized SQL in the active phase. */
  async query(sql: string): Promise<unknown[]> {
    const normalized = sql.replace(/\s+/g, ' ').trim();
    if (this.activePhase) this.activePhase.push(normalized);
    else this.outsideTransaction.push(normalized);
    return [];
  }

  /** Commits the active phase for ordering assertions. */
  async commitTransaction(): Promise<void> {
    if (!this.activePhase) throw new Error('Missing phase');
    this.committedPhases.push(this.activePhase);
    this.activePhase = null;
  }

  /** Clears a failed phase just as a real rollback would. */
  async rollbackTransaction(): Promise<void> {
    this.activePhase = null;
  }
}

/** Reports whether one phase contains SQL matching the requested fragment. */
function phaseContains(phase: readonly string[], fragment: string): boolean {
  return phase.some((sql) => sql.includes(fragment));
}

describe('AddCommentEdits1788062406000', () => {
  /** Prevents an ACCESS EXCLUSIVE add lock from surviving into the table scan. */
  it('commits candidate checks before validating and swapping them', async () => {
    const migration = new AddCommentEdits1788062406000();
    const runner = new RecordingQueryRunner();

    await migration.up(runner as unknown as QueryRunner);

    expect(migration.transaction).toBe(false);
    expect(runner.outsideTransaction).toEqual([]);
    expect(runner.committedPhases).toHaveLength(3);
    expect(phaseContains(runner.committedPhases[0] ?? [], 'NOT VALID')).toBe(
      true,
    );
    expect(
      phaseContains(runner.committedPhases[0] ?? [], 'VALIDATE CONSTRAINT'),
    ).toBe(false);
    expect(
      phaseContains(runner.committedPhases[1] ?? [], "statement_timeout = '0'"),
    ).toBe(true);
    expect(
      phaseContains(runner.committedPhases[1] ?? [], 'VALIDATE CONSTRAINT'),
    ).toBe(true);
    expect(
      phaseContains(runner.committedPhases[2] ?? [], 'RENAME CONSTRAINT'),
    ).toBe(true);
  });

  /** Keeps rollback history protection separate from candidate validation and swapping. */
  it('stages rollback checks in four independently committed phases', async () => {
    const migration = new AddCommentEdits1788062406000();
    const runner = new RecordingQueryRunner();

    await migration.down(runner as unknown as QueryRunner);

    expect(runner.outsideTransaction).toEqual([]);
    expect(runner.committedPhases).toHaveLength(4);
    expect(
      phaseContains(runner.committedPhases[0] ?? [], 'comment_edited'),
    ).toBe(true);
    expect(phaseContains(runner.committedPhases[1] ?? [], 'NOT VALID')).toBe(
      true,
    );
    expect(
      phaseContains(runner.committedPhases[2] ?? [], 'VALIDATE CONSTRAINT'),
    ).toBe(true);
    expect(
      phaseContains(runner.committedPhases[3] ?? [], 'RENAME CONSTRAINT'),
    ).toBe(true);
  });
});
