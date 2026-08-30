/** Implements read projection queries without routing list reads through aggregates. */
import type { DataSource } from 'typeorm';

import type { TaskQueryPort } from '../../application/ports/task-query.port.js';
import type { TaskReadModel } from '../../application/read-models/task-read-model.js';
import { loadTaskGraph, loadTaskGraphs } from './load-task-graph.js';
import { taskEntityToReadModel } from './task-orm-mapper.js';

export class PostgresTaskQuery implements TaskQueryPort {
  /** Binds projection reads to the shared application DataSource. */
  constructor(private readonly dataSource: DataSource) {}

  /** Returns all complete projections in createdAt DESC and ID ASC order. */
  async list(): Promise<TaskReadModel[]> {
    return (await loadTaskGraphs(this.dataSource.manager)).map(
      taskEntityToReadModel,
    );
  }

  /** Returns one complete task projection or null. */
  async getById(id: string): Promise<TaskReadModel | null> {
    const entity = await loadTaskGraph(this.dataSource.manager, id);
    return entity ? taskEntityToReadModel(entity) : null;
  }
}
