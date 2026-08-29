(function () {
  'use strict';

  var state = GuildState.load();
  var activeFilter = '全部';
  var searchTerm = '';
  var selectedTaskId = null;
  var toastTimer;

  var elements = {
    activeRole: document.getElementById('activeRole'),
    resetButton: document.getElementById('resetButton'),
    statTotal: document.getElementById('statTotal'),
    statActive: document.getElementById('statActive'),
    statReview: document.getElementById('statReview'),
    statClosed: document.getElementById('statClosed'),
    filterList: document.getElementById('filterList'),
    resultLabel: document.getElementById('resultLabel'),
    resultCount: document.getElementById('resultCount'),
    searchInput: document.getElementById('searchInput'),
    newTaskButton: document.getElementById('newTaskButton'),
    taskGrid: document.getElementById('taskGrid'),
    identitySelect: document.getElementById('identitySelect'),
    drawer: document.getElementById('detailDrawer'),
    drawerBackdrop: document.getElementById('drawerBackdrop'),
    drawerInner: document.getElementById('drawerInner'),
    modal: document.getElementById('taskModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    closeModalButton: document.getElementById('closeModalButton'),
    cancelModalButton: document.getElementById('cancelModalButton'),
    taskForm: document.getElementById('taskForm'),
    taskType: document.getElementById('taskType'),
    formError: document.getElementById('formError'),
    toast: document.getElementById('toast')
  };

  function currentUser() { return GuildState.getUser(state.currentUserId); }

  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character];
    });
  }

  function formatDate(value, includeTime) {
    var date = new Date(value);
    if (isNaN(date.getTime())) return value;
    var datePart = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
    if (!includeTime) return datePart;
    return datePart + ' ' + new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  function formatDueDate(value) {
    var date = new Date(value + 'T12:00:00');
    if (isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(date);
  }

  function statusClass(status) { return 'status-' + status; }

  function taskCard(task) {
    var assignee = task.assignee ? task.assignee.name : '未接取';
    return '<article class="task-card" data-task-id="' + escapeHTML(task.id) + '" tabindex="0" role="button" aria-label="查看任务：' + escapeHTML(task.title) + '">' +
      '<div class="task-card-top"><span class="task-type">' + escapeHTML(task.type) + ' / QUEST</span><span class="status-badge ' + statusClass(task.status) + '">' + escapeHTML(task.status) + '</span></div>' +
      '<h3>' + escapeHTML(task.title) + '</h3>' +
      '<p class="task-summary">' + escapeHTML(task.description) + '</p>' +
      '<div class="task-card-footer"><div class="task-card-meta"><span>发布者<strong>' + escapeHTML(task.publisher.name) + '</strong></span><span>截止<strong>' + escapeHTML(formatDueDate(task.dueDate)) + '</strong></span><span>接取者<strong>' + escapeHTML(assignee) + '</strong></span></div><span class="task-card-arrow" aria-hidden="true">↗</span></div>' +
      '</article>';
  }

  function visibleTasks() {
    var term = searchTerm.trim().toLowerCase();
    return state.tasks.filter(function (task) {
      var matchesFilter = activeFilter === '全部' || task.status === activeFilter;
      var searchable = [task.title, task.type, task.description, task.publisher.name, task.assignee ? task.assignee.name : ''].join(' ').toLowerCase();
      return matchesFilter && (!term || searchable.indexOf(term) !== -1);
    });
  }

  function renderIdentity() {
    var user = currentUser();
    elements.activeRole.textContent = user.roleLabel;
    elements.identitySelect.innerHTML = Object.keys(GuildState.USERS).map(function (key) {
      var item = GuildState.USERS[key];
      return '<option value="' + escapeHTML(item.id) + '" ' + (item.id === user.id ? 'selected' : '') + '>' + escapeHTML(item.name) + '</option>';
    }).join('');
    var canPublish = user.role === 'publisher';
    elements.newTaskButton.disabled = !canPublish;
    elements.newTaskButton.title = canPublish ? '' : '切换为任务发布者后才能发布任务';
  }

  function renderStats() {
    var count = function (status) { return state.tasks.filter(function (task) { return task.status === status; }).length; };
    elements.statTotal.textContent = state.tasks.length;
    elements.statActive.textContent = count(GuildState.STATUS.IN_PROGRESS) + count(GuildState.STATUS.REOPENED);
    elements.statReview.textContent = count(GuildState.STATUS.COMPLETED);
    elements.statClosed.textContent = count(GuildState.STATUS.CLOSED);
    Array.prototype.forEach.call(elements.filterList.querySelectorAll('[data-count]'), function (item) {
      var filter = item.getAttribute('data-count');
      item.textContent = filter === '全部' ? state.tasks.length : count(filter);
    });
  }

  function renderTasks() {
    var tasks = visibleTasks();
    elements.resultLabel.textContent = activeFilter === '全部' ? 'ALL QUESTS' : activeFilter.toUpperCase();
    elements.resultCount.textContent = tasks.length + ' 项任务' + (searchTerm ? ' · 搜索结果' : '');
    if (!tasks.length) {
      elements.taskGrid.innerHTML = '<div class="empty-state"><strong>这里暂时没有任务</strong><p>换一个筛选条件，或发布一项新的冒险委托。</p></div>';
      return;
    }
    elements.taskGrid.innerHTML = tasks.map(taskCard).join('');
  }

  function render() {
    renderIdentity();
    renderStats();
    renderTasks();
    if (selectedTaskId) renderDrawer();
  }

  function timelineMarkup(timeline) {
    return timeline.slice().reverse().map(function (item) {
      return '<li><span class="timeline-action">' + escapeHTML(item.action) + '</span><span class="timeline-meta">' + escapeHTML(item.actor) + ' · ' + escapeHTML(formatDate(item.at, true)) + '</span><span class="timeline-detail">' + escapeHTML(item.detail) + '</span></li>';
    }).join('');
  }

  function actionButtons(task) {
    var user = currentUser();
    var buttons = [];
    if (GuildState.canAct(task, 'accept', user)) buttons.push('<button class="primary-button" data-action="accept" type="button">' + (task.status === GuildState.STATUS.REOPENED ? '继续执行任务' : '接取任务') + ' <span>↗</span></button>');
    if (GuildState.canAct(task, 'complete', user)) buttons.push('<button class="primary-button" data-action="complete" type="button">标记为已完成 <span>↗</span></button>');
    if (GuildState.canAct(task, 'approve', user)) buttons.push('<button class="primary-button" data-action="approve" type="button">验收通过并关闭 <span>↗</span></button>');
    if (GuildState.canAct(task, 'reopen', user)) buttons.push('<button class="secondary-button" data-action="reopen" type="button">验收不通过，重新打开</button>');
    if (GuildState.canAct(task, 'close', user) && task.status === GuildState.STATUS.REOPENED) buttons.push('<button class="secondary-button" data-action="close" type="button">直接关闭任务</button>');
    if (!buttons.length) return '<p class="drawer-hint">当前身份在此任务状态下暂无可执行操作。</p>';
    return buttons.join('');
  }

  function renderDrawer() {
    var task = state.tasks.find(function (item) { return item.id === selectedTaskId; });
    if (!task) { closeDrawer(); return; }
    elements.drawerInner.innerHTML = '<div class="drawer-header"><div><p class="eyebrow">' + escapeHTML(task.type) + ' <span>/</span> QUEST DETAIL</p><h2 id="drawerTitle">' + escapeHTML(task.title) + '</h2></div><button class="icon-button" data-close-drawer type="button" aria-label="关闭任务详情">×</button></div>' +
      '<p class="drawer-description">' + escapeHTML(task.description) + '</p>' +
      '<div class="detail-facts"><div class="detail-fact"><span>当前状态</span><strong>' + escapeHTML(task.status) + '</strong></div><div class="detail-fact"><span>截止时间</span><strong>' + escapeHTML(formatDueDate(task.dueDate)) + '</strong></div><div class="detail-fact"><span>任务发布者</span><strong>' + escapeHTML(task.publisher.name) + '</strong></div><div class="detail-fact"><span>当前接取者</span><strong>' + escapeHTML(task.assignee ? task.assignee.name : '未接取') + '</strong></div><div class="detail-fact" style="grid-column:1 / -1"><span>任务奖励</span><strong>' + escapeHTML(task.reward) + '</strong></div></div>' +
      '<div class="drawer-actions">' + actionButtons(task) + '</div>' +
      '<section class="timeline-section"><div class="timeline-title">操作时间线 <span>/ ACTIVITY LOG</span></div><ol class="timeline">' + timelineMarkup(task.timeline) + '</ol></section>';
    elements.drawer.classList.add('is-open');
    elements.drawerBackdrop.classList.add('is-open');
    elements.drawer.setAttribute('aria-hidden', 'false');
  }

  function openDrawer(taskId) { selectedTaskId = taskId; renderDrawer(); }

  function closeDrawer() {
    selectedTaskId = null;
    elements.drawer.classList.remove('is-open');
    elements.drawerBackdrop.classList.remove('is-open');
    elements.drawer.setAttribute('aria-hidden', 'true');
  }

  function openModal() {
    if (currentUser().role !== 'publisher') { showToast('请先切换为任务发布者'); return; }
    elements.formError.textContent = '';
    elements.taskForm.reset();
    elements.modal.classList.add('is-open');
    elements.modalBackdrop.classList.add('is-open');
    elements.modal.setAttribute('aria-hidden', 'false');
    elements.taskForm.elements.title.focus();
  }

  function closeModal() {
    elements.modal.classList.remove('is-open');
    elements.modalBackdrop.classList.remove('is-open');
    elements.modal.setAttribute('aria-hidden', 'true');
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    toastTimer = setTimeout(function () { elements.toast.classList.remove('is-visible'); }, 2600);
  }

  function persist() { GuildState.save(state); }

  elements.taskType.innerHTML = GuildState.TYPES.map(function (type) { return '<option value="' + escapeHTML(type) + '">' + escapeHTML(type) + '</option>'; }).join('');
  elements.filterList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.getAttribute('data-filter');
    Array.prototype.forEach.call(elements.filterList.querySelectorAll('.filter-button'), function (item) { item.classList.toggle('is-active', item === button); });
    renderTasks();
  });
  elements.searchInput.addEventListener('input', function (event) { searchTerm = event.target.value; renderTasks(); });
  elements.taskGrid.addEventListener('click', function (event) {
    var card = event.target.closest('[data-task-id]');
    if (card) openDrawer(card.getAttribute('data-task-id'));
  });
  elements.taskGrid.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    var card = event.target.closest('[data-task-id]');
    if (card) { event.preventDefault(); openDrawer(card.getAttribute('data-task-id')); }
  });
  elements.drawerInner.addEventListener('click', function (event) {
    if (event.target.closest('[data-close-drawer]')) { closeDrawer(); return; }
    var actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    try {
      state.tasks = GuildState.applyAction(state.tasks, selectedTaskId, actionButton.getAttribute('data-action'), currentUser(), new Date().toISOString());
      persist();
      render();
      showToast('任务状态已更新');
    } catch (error) { showToast(error.message); }
  });
  elements.drawerBackdrop.addEventListener('click', closeDrawer);
  elements.newTaskButton.addEventListener('click', openModal);
  elements.closeModalButton.addEventListener('click', closeModal);
  elements.cancelModalButton.addEventListener('click', closeModal);
  elements.modalBackdrop.addEventListener('click', closeModal);
  elements.identitySelect.addEventListener('change', function (event) {
    state.currentUserId = event.target.value;
    persist();
    render();
    showToast('已切换当前身份');
  });
  elements.resetButton.addEventListener('click', function () {
    if (!window.confirm('确定要恢复初始演示任务吗？当前本地任务会被清除。')) return;
    state = GuildState.reset();
    activeFilter = '全部';
    searchTerm = '';
    elements.searchInput.value = '';
    Array.prototype.forEach.call(elements.filterList.querySelectorAll('.filter-button'), function (item) { item.classList.toggle('is-active', item.getAttribute('data-filter') === activeFilter); });
    closeDrawer();
    render();
    showToast('演示数据已恢复');
  });
  elements.taskForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var formData = new FormData(elements.taskForm);
    try {
      var task = GuildState.createTask({ title: formData.get('title'), type: formData.get('type'), description: formData.get('description'), reward: formData.get('reward'), dueDate: formData.get('dueDate') }, currentUser(), new Date().toISOString());
      state.tasks = [task].concat(state.tasks);
      persist();
      closeModal();
      activeFilter = '全部';
      render();
      openDrawer(task.id);
      showToast('新任务已发布');
    } catch (error) { elements.formError.textContent = error.message; }
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (elements.modal.classList.contains('is-open')) closeModal();
    else if (elements.drawer.classList.contains('is-open')) closeDrawer();
  });

  render();
}());
