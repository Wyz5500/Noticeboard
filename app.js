(function () {
  'use strict';

  var state = GuildState.load();
  var route = GuildState.parseTaskRoute(window.location.hash || '#home');
  var activeScope = route.scope;
  var activeFilter = route.filter;
  var searchTerm = route.query || '';
  var selectedTaskId = null;
  var toastTimer;
  var currentStyle = GuildStyle.load();

  var elements = {
    profileMenu: document.getElementById('profileMenu'),
    profileButton: document.getElementById('profileButton'),
    profilePanel: document.getElementById('profilePanel'),
    avatarInitial: document.getElementById('avatarInitial'),
    profileName: document.getElementById('profileName'),
    resetButton: document.getElementById('resetButton'),
    styleSelect: document.getElementById('styleSelect'),
    viewNav: document.querySelector('.view-nav'),
    homeView: document.getElementById('homeView'),
    tasksView: document.getElementById('tasksView'),
    statTotal: document.getElementById('statTotal'),
    statActive: document.getElementById('statActive'),
    statReview: document.getElementById('statReview'),
    statClosed: document.getElementById('statClosed'),
    scopeSwitcher: document.getElementById('scopeSwitcher'),
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

  function setProfileMenuOpen(isOpen) {
    elements.profileMenu.classList.toggle('is-open', isOpen);
    elements.profileButton.setAttribute('aria-expanded', String(isOpen));
    elements.profilePanel.setAttribute('aria-hidden', String(!isOpen));
    elements.profilePanel.hidden = !isOpen;
  }

  function closeProfileMenu() {
    var focusInsidePanel = elements.profilePanel.contains(document.activeElement);
    var wasOpen = elements.profileMenu.classList.contains('is-open');
    setProfileMenuOpen(false);
    if (wasOpen && focusInsidePanel) elements.profileButton.focus();
  }

  function toggleProfileMenu() { setProfileMenuOpen(!elements.profileMenu.classList.contains('is-open')); }

  function renderStyleControl() {
    currentStyle = GuildStyle.apply(currentStyle, document.documentElement);
    document.documentElement.setAttribute('data-style', currentStyle);
    document.body.setAttribute('data-style', currentStyle);
    elements.styleSelect.value = currentStyle;
  }

  function applyStyle(styleId) {
    currentStyle = GuildStyle.save(styleId);
    renderStyleControl();
  }

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

  function isKnownFilter(filter, scope) {
    return GuildState.filterOptions(scope).indexOf(filter) !== -1;
  }

  function normalizeRoute() {
    if (!isKnownFilter(activeFilter, activeScope)) {
      activeFilter = '全部';
      if (route.view === 'tasks') window.history.replaceState(null, '', GuildState.taskRouteHash(activeFilter, activeScope, searchTerm));
    }
  }

  function visibleTasks() {
    var term = searchTerm.trim().toLowerCase();
    return GuildState.filterTasks(state.tasks, activeScope, activeFilter, currentUser()).filter(function (task) {
      var searchable = [task.title, task.type, task.description, task.publisher.name, task.assignee ? task.assignee.name : ''].join(' ').toLowerCase();
      return !term || searchable.indexOf(term) !== -1;
    });
  }

  function scopedTasks() {
    return GuildState.filterTasks(state.tasks, activeScope, '全部', currentUser());
  }

  function updateHash() {
    var hash = GuildState.taskRouteHash(activeFilter, activeScope, searchTerm);
    if (window.location.hash !== hash) window.location.hash = hash;
  }

  function setSearchHash() {
    var hash = GuildState.taskRouteHash(activeFilter, activeScope, searchTerm);
    window.history.replaceState(null, '', hash);
  }

  function renderIdentity() {
    var user = currentUser();
    elements.avatarInitial.textContent = user.name.trim().charAt(0).toUpperCase();
    elements.profileName.textContent = user.name;
    elements.profileButton.setAttribute('aria-label', '当前用户：' + user.name + '，打开个人菜单');
    elements.identitySelect.innerHTML = Object.keys(GuildState.USERS).map(function (key) {
      var item = GuildState.USERS[key];
      return '<option value="' + escapeHTML(item.id) + '" ' + (item.id === user.id ? 'selected' : '') + '>' + escapeHTML(item.name) + '</option>';
    }).join('');
  }

  function renderStats() {
    var user = currentUser();
    var myTasks = GuildState.filterTasks(state.tasks, 'mine', '全部', user);
    var count = function (status) { return GuildState.filterTasks(myTasks, 'all', status, user).length; };
    elements.statTotal.textContent = myTasks.length;
    elements.statActive.textContent = count(GuildState.STATUS.IN_PROGRESS);
    elements.statReview.textContent = count(GuildState.STATUS.COMPLETED);
    elements.statClosed.textContent = count(GuildState.STATUS.CLOSED);
    var taskPool = scopedTasks();
    Array.prototype.forEach.call(elements.filterList.querySelectorAll('[data-count]'), function (item) {
      var filter = item.getAttribute('data-count');
      item.textContent = GuildState.filterTasks(taskPool, 'all', filter, currentUser()).length;
    });
  }

  function renderControls() {
    Array.prototype.forEach.call(elements.scopeSwitcher.querySelectorAll('[data-scope]'), function (item) {
      var isActive = item.getAttribute('data-scope') === activeScope;
      item.classList.toggle('is-active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });
    Array.prototype.forEach.call(elements.filterList.querySelectorAll('.filter-button'), function (item) {
      var isActive = item.getAttribute('data-filter') === activeFilter;
      item.classList.toggle('is-active', isActive);
      item.hidden = GuildState.filterOptions(activeScope).indexOf(item.getAttribute('data-filter')) === -1;
      item.setAttribute('aria-pressed', String(isActive));
    });
    elements.searchInput.value = searchTerm;
  }

  function renderTasks() {
    var tasks = visibleTasks();
    elements.resultLabel.textContent = activeScope === 'mine' ? 'MY QUESTS' : (activeFilter === '全部' ? 'ALL QUESTS' : activeFilter.toUpperCase());
    elements.resultCount.textContent = tasks.length + ' 项任务' + (searchTerm ? ' · 搜索结果' : '');
    if (!tasks.length) {
      var emptyCopy = activeScope === 'mine' ? '当前身份还没有符合条件的任务。' : '换一个筛选条件，或发布一项新的冒险委托。';
      elements.taskGrid.innerHTML = '<div class="empty-state"><strong>这里暂时没有任务</strong><p>' + emptyCopy + '</p></div>';
      return;
    }
    elements.taskGrid.innerHTML = tasks.map(taskCard).join('');
  }

  function renderView() {
    var isTasks = route.view === 'tasks';
    elements.homeView.classList.toggle('is-active', !isTasks);
    elements.tasksView.classList.toggle('is-active', isTasks);
    Array.prototype.forEach.call(elements.viewNav.querySelectorAll('[data-view]'), function (item) {
      var isActive = item.getAttribute('data-view') === route.view;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function render() {
    normalizeRoute();
    renderIdentity();
    renderStats();
    renderControls();
    renderView();
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
    if (GuildState.canAct(task, 'accept', user)) buttons.push('<button class="primary-button" data-action="accept" type="button">' + (task.status === GuildState.STATUS.REOPENED ? '重新接取任务' : '接取任务') + ' <span>↗</span></button>');
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

  function syncRoute() {
    route = GuildState.parseTaskRoute(window.location.hash || '#home');
    activeScope = route.scope;
    activeFilter = route.filter;
    searchTerm = route.query || '';
    render();
  }

  elements.taskType.innerHTML = GuildState.TYPES.map(function (type) { return '<option value="' + escapeHTML(type) + '">' + escapeHTML(type) + '</option>'; }).join('');
  elements.styleSelect.innerHTML = GuildStyle.OPTIONS.map(function (option) {
    return '<option value="' + escapeHTML(option.id) + '">' + escapeHTML(option.label) + '</option>';
  }).join('');
  elements.homeView.addEventListener('click', function (event) {
    var shortcut = event.target.closest('[data-status-shortcut]');
    if (!shortcut) return;
    activeScope = 'mine';
    activeFilter = shortcut.getAttribute('data-status-shortcut');
    searchTerm = '';
    updateHash();
  });
  elements.scopeSwitcher.addEventListener('click', function (event) {
    var button = event.target.closest('[data-scope]');
    if (!button) return;
    activeScope = button.getAttribute('data-scope');
    if (!isKnownFilter(activeFilter, activeScope)) activeFilter = '全部';
    updateHash();
  });
  elements.filterList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (!button || button.hidden) return;
    activeFilter = button.getAttribute('data-filter');
    updateHash();
  });
  elements.searchInput.addEventListener('input', function (event) {
    searchTerm = event.target.value;
    setSearchHash();
    renderTasks();
  });
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
  elements.profileButton.addEventListener('click', toggleProfileMenu);
  document.addEventListener('click', function (event) {
    if (!event.target.closest('#profileMenu') && !event.target.closest('#profilePanel')) closeProfileMenu();
  });
  elements.identitySelect.addEventListener('change', function (event) {
    state.currentUserId = event.target.value;
    persist();
    render();
    showToast('已切换当前身份');
  });
  elements.styleSelect.addEventListener('change', function (event) {
    applyStyle(event.target.value);
  });
  elements.resetButton.addEventListener('click', function () {
    if (!window.confirm('确定要恢复初始演示任务吗？当前本地任务会被清除。')) return;
    closeProfileMenu();
    state = GuildState.reset();
    activeScope = 'all';
    activeFilter = '全部';
    searchTerm = '';
    route = GuildState.parseTaskRoute(GuildState.resetTaskRoute());
    window.location.hash = GuildState.resetTaskRoute();
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
      render();
      openDrawer(task.id);
      showToast('新任务已发布');
    } catch (error) { elements.formError.textContent = error.message; }
  });
  window.addEventListener('hashchange', syncRoute);
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (elements.profileMenu.classList.contains('is-open')) closeProfileMenu();
    else if (elements.modal.classList.contains('is-open')) closeModal();
    else if (elements.drawer.classList.contains('is-open')) closeDrawer();
  });

  renderStyleControl();
  render();
}());
