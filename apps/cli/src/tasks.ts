/** Applies documented CLI filters to complete SDK projections without changing HTTP queries. */
import type { Identity, Task } from './sdk/index.js';
import type { Command } from './arguments.js';

/** Preserves server order and resolves ownership only from effective lifecycle actors. */
export function filterTasks(
  tasks: Task[],
  identities: Identity[],
  userId: string,
  options: Command['options'],
): Task[] {
  const known = new Set(identities.map((identity) => identity.id));
  const term = (options.search ?? '').trim().toLocaleLowerCase('zh-CN');
  return tasks.filter((task) => {
    const owner = options.mine
      ? task.timeline.findLast(
          (event) => event.kind === 'activity' && known.has(event.actor.id),
        )?.actor.id
      : undefined;
    const searchable = [
      task.title,
      task.typeLabel,
      task.description,
      task.publisher.name,
      task.assignee?.name ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN');
    return (
      (!options.mine || owner === userId) &&
      (!options.status || task.status === options.status) &&
      (!term || searchable.includes(term))
    );
  });
}
