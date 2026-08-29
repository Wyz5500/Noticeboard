var GuildState = (function () {
  var STORAGE_KEY = 'minecraft-guild-board-state';

  var STATUS = {
    NOT_STARTED: '未开始',
    IN_PROGRESS: '进行中',
    COMPLETED: '已完成',
    CLOSED: '关闭',
    REOPENED: '重新打开'
  };

  var USERS = {
    publisher: { id: 'guild-master', name: '公会发布者', role: 'publisher', roleLabel: '任务发布者' },
    adventurerA: { id: 'adventurer-a', name: '冒险者 A', role: 'adventurer', roleLabel: '冒险者' },
    adventurerB: { id: 'adventurer-b', name: '冒险者 B', role: 'adventurer', roleLabel: '冒险者' }
  };

  var TYPES = ['探索', '采集', '护送', '悬赏', '建造'];

  function copy(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function event(action, actor, at, detail) {
    return {
      action: action,
      actor: actor.name,
      actorId: actor.id,
      actorRole: actor.role,
      at: at,
      detail: detail || ''
    };
  }

  function seedTask(data) {
    return {
      id: data.id,
      title: data.title,
      type: data.type,
      description: data.description,
      reward: data.reward,
      dueDate: data.dueDate,
      publisher: copy(USERS.publisher),
      assignee: data.assignee ? copy(data.assignee) : null,
      status: data.status,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt || data.createdAt,
      timeline: data.timeline
    };
  }

  function createSeedTasks() {
    return [
      seedTask({
        id: 'task-herbs',
        title: '月影森林的失踪药草',
        type: '采集',
        description: '前往月影森林边缘，寻找三株在暴雨后失踪的月光药草。请避开夜行狼群，并将完整植株带回公会。',
        reward: '18 金币 · 月光药草图鉴',
        dueDate: '2026-09-04',
        status: STATUS.NOT_STARTED,
        createdAt: '2026-08-28T09:10:00.000Z',
        timeline: [event('创建任务', USERS.publisher, '2026-08-28T09:10:00.000Z', '任务发布至冒险家工会')]
      }),
      seedTask({
        id: 'task-outpost',
        title: '北境哨站补给护送',
        type: '护送',
        description: '护送一车铁锭、面包与火把穿越冻原，安全抵达北境哨站。途中可能遭遇冰原骷髅。',
        reward: '32 金币 · 哨站声望 +12',
        dueDate: '2026-08-31',
        assignee: USERS.adventurerA,
        status: STATUS.IN_PROGRESS,
        createdAt: '2026-08-27T07:40:00.000Z',
        updatedAt: '2026-08-28T14:25:00.000Z',
        timeline: [
          event('创建任务', USERS.publisher, '2026-08-27T07:40:00.000Z', '任务发布至冒险家工会'),
          event('接取任务', USERS.adventurerA, '2026-08-28T14:25:00.000Z', '开始执行任务')
        ]
      }),
      seedTask({
        id: 'task-lanterns',
        title: '修复旧矿井的照明符文',
        type: '建造',
        description: '为旧矿井入口与第一层通道补齐照明符文，确保矿工夜间通行安全。',
        reward: '25 金币 · 红石组件包',
        dueDate: '2026-08-29',
        assignee: USERS.adventurerB,
        status: STATUS.COMPLETED,
        createdAt: '2026-08-24T11:20:00.000Z',
        updatedAt: '2026-08-28T18:05:00.000Z',
        timeline: [
          event('创建任务', USERS.publisher, '2026-08-24T11:20:00.000Z', '任务发布至冒险家工会'),
          event('接取任务', USERS.adventurerB, '2026-08-26T10:15:00.000Z', '开始执行任务'),
          event('标记完成', USERS.adventurerB, '2026-08-28T18:05:00.000Z', '等待发布者验收')
        ]
      }),
      seedTask({
        id: 'task-starfire',
        title: '寻找星火祭坛的入口',
        type: '探索',
        description: '绘制废弃峡谷中的安全路线，找到传说中的星火祭坛入口，并带回一枚现场印记。',
        reward: '50 金币 · 稀有地图碎片',
        dueDate: '2026-08-27',
        assignee: USERS.adventurerA,
        status: STATUS.CLOSED,
        createdAt: '2026-08-20T08:30:00.000Z',
        updatedAt: '2026-08-26T16:50:00.000Z',
        timeline: [
          event('创建任务', USERS.publisher, '2026-08-20T08:30:00.000Z', '任务发布至冒险家工会'),
          event('接取任务', USERS.adventurerA, '2026-08-21T09:00:00.000Z', '开始执行任务'),
          event('标记完成', USERS.adventurerA, '2026-08-25T17:20:00.000Z', '等待发布者验收'),
          event('验收通过', USERS.publisher, '2026-08-26T16:48:00.000Z', '任务成果符合要求'),
          event('关闭任务', USERS.publisher, '2026-08-26T16:50:00.000Z', '任务流程结束')
        ]
      })
    ];
  }

  function createTask(input, publisher, now) {
    if (!publisher || publisher.role !== 'publisher') throw new Error('只有任务发布者可以创建任务');
    if (!input || !input.title || !input.type || !input.description || !input.reward || !input.dueDate) {
      throw new Error('请完整填写任务信息');
    }
    var task = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(16).slice(2),
      title: input.title.trim(),
      type: input.type,
      description: input.description.trim(),
      reward: input.reward.trim(),
      dueDate: input.dueDate,
      publisher: copy(publisher),
      assignee: null,
      status: STATUS.NOT_STARTED,
      createdAt: now,
      updatedAt: now,
      timeline: [event('创建任务', publisher, now, '任务发布至冒险家工会')]
    };
    if (!task.title || !task.description || !task.reward) throw new Error('请完整填写任务信息');
    return task;
  }

  function canAct(task, action, user) {
    if (!task || !user) return false;
    if (action === 'accept') {
      return (task.status === STATUS.NOT_STARTED && !task.assignee) || task.status === STATUS.REOPENED;
    }
    if (action === 'complete') {
      return task.status === STATUS.IN_PROGRESS &&
        task.assignee && task.assignee.id === user.id;
    }
    if (action === 'approve' || action === 'reopen') {
      return user.role === 'publisher' && task.publisher.id === user.id && task.status === STATUS.COMPLETED;
    }
    if (action === 'close') {
      return user.role === 'publisher' && task.publisher.id === user.id &&
        (task.status === STATUS.COMPLETED || task.status === STATUS.REOPENED);
    }
    return false;
  }

  function applyAction(tasks, taskId, action, user, now) {
    var index = tasks.findIndex(function (item) { return item.id === taskId; });
    if (index === -1) throw new Error('任务不存在');
    var current = tasks[index];
    if (!canAct(current, action, user)) throw new Error('当前身份或任务状态无法执行此操作');

    var next = copy(current);
    next.updatedAt = now;
    if (action === 'accept') {
      next.assignee = copy(user);
      next.status = STATUS.IN_PROGRESS;
      next.timeline.push(event('接取任务', user, now, current.status === STATUS.REOPENED ? '重新开始执行任务' : '开始执行任务'));
    } else if (action === 'complete') {
      next.status = STATUS.COMPLETED;
      next.timeline.push(event('标记完成', user, now, '等待发布者验收'));
    } else if (action === 'approve') {
      next.status = STATUS.CLOSED;
      next.timeline.push(event('验收通过', user, now, '任务成果符合要求'));
      next.timeline.push(event('关闭任务', user, now, '任务流程结束'));
    } else if (action === 'reopen') {
      next.status = STATUS.REOPENED;
      next.timeline.push(event('重新打开', user, now, '验收未通过，退回继续执行'));
    } else if (action === 'close') {
      next.status = STATUS.CLOSED;
      next.timeline.push(event('关闭任务', user, now, '任务流程结束'));
    }

    return tasks.slice(0, index).concat([next], tasks.slice(index + 1));
  }

  function getUser(id) {
    var users = Object.keys(USERS);
    for (var i = 0; i < users.length; i += 1) {
      if (USERS[users[i]].id === id) return copy(USERS[users[i]]);
    }
    return copy(USERS.publisher);
  }

  function load(storage) {
    var source = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!source) return { tasks: createSeedTasks(), currentUserId: USERS.publisher.id };
    try {
      var saved = source.getItem(STORAGE_KEY);
      if (!saved) return { tasks: createSeedTasks(), currentUserId: USERS.publisher.id };
      var parsed = JSON.parse(saved);
      if (!parsed || !Array.isArray(parsed.tasks) || !parsed.currentUserId) throw new Error('invalid state');
      return parsed;
    } catch (error) {
      return { tasks: createSeedTasks(), currentUserId: USERS.publisher.id };
    }
  }

  function save(state, storage) {
    var target = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (target) target.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function reset(storage) {
    var state = { tasks: createSeedTasks(), currentUserId: USERS.publisher.id };
    save(state, storage);
    return state;
  }

  function filterTasks(tasks, scope, filter, user) {
    return tasks.filter(function (task) {
      var matchesScope = scope !== 'mine' || (user && task.assignee && task.assignee.id === user.id);
      var matchesFilter = !filter || filter === '全部' ||
        (filter === STATUS.IN_PROGRESS && (task.status === STATUS.IN_PROGRESS || task.status === STATUS.REOPENED)) ||
        task.status === filter;
      return matchesScope && matchesFilter;
    });
  }

  function filterOptions() {
    return ['全部', STATUS.NOT_STARTED, STATUS.IN_PROGRESS, STATUS.COMPLETED, STATUS.REOPENED, STATUS.CLOSED];
  }

  function taskRouteHash(filter, scope, query) {
    var hash = '#tasks?scope=' + (scope || 'all') + '&filter=' + (filter || '全部');
    if (query) hash += '&q=' + encodeURIComponent(query);
    return hash;
  }

  function resetTaskRoute() {
    return taskRouteHash('全部', 'all');
  }

  function parseTaskRoute(hash) {
    var source = String(hash || '').replace(/^#/, '');
    var parts = source.split('?');
    var params = {};
    (parts[1] || '').split('&').forEach(function (pair) {
      if (!pair) return;
      var values = pair.split('=');
      var key = decodeURIComponent(values[0] || '');
      var value = decodeURIComponent(values.slice(1).join('=') || '');
      params[key] = value;
    });
    return {
      view: parts[0] === 'tasks' ? 'tasks' : 'home',
      scope: params.scope === 'mine' ? 'mine' : 'all',
      filter: params.filter || '全部',
      query: params.q || ''
    };
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    STATUS: STATUS,
    USERS: USERS,
    TYPES: TYPES,
    createSeedTasks: createSeedTasks,
    createTask: createTask,
    canAct: canAct,
    applyAction: applyAction,
    getUser: getUser,
    load: load,
    save: save,
    reset: reset,
    filterTasks: filterTasks,
    filterOptions: filterOptions,
    taskRouteHash: taskRouteHash,
    resetTaskRoute: resetTaskRoute,
    parseTaskRoute: parseTaskRoute
  };
}());
