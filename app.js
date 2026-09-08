/* Daily Hub — a one-device daily checklist for placement, uni and health.
   All state lives in localStorage under one key. No build step, no network. */

(function () {
  'use strict';

  var KEY = 'daily-hub/v1';
  var PAGES = ['placement', 'university', 'health'];

  /* ---------------- date helpers ---------------- */

  function iso(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function today() { return iso(new Date()); }
  function parseISO(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function shiftISO(s, days) {
    var d = parseISO(s);
    d.setDate(d.getDate() + days);
    return iso(d);
  }
  function prettyDate(s) {
    var d = parseISO(s);
    if (s === today()) return 'Today · ' + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    if (s === shiftISO(today(), -1)) return 'Yesterday';
    if (s === shiftISO(today(), 1)) return 'Tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------------- default data ---------------- */

  function seed() {
    return {
      version: 1,
      routines: {
        placement: [
          { id: uid(), text: 'Check clinic emails' },
          { id: uid(), text: 'Submit logbook' },
          { id: uid(), text: 'Check phone notes' }
        ],
        university: [
          { id: uid(), text: 'Finish weekly notes before Thursday class' },
          { id: uid(), text: 'Update readings and put them into a podcast' },
          { id: uid(), text: 'Listen to weekly podcast content' }
        ]
      },
      metrics: [
        { id: uid(), name: 'Gym', icon: '🏋️', type: 'check', target: 1, unit: '' },
        { id: uid(), name: 'Steps', icon: '👟', type: 'number', target: 10000, unit: 'steps' },
        { id: uid(), name: 'Water', icon: '💧', type: 'counter', target: 8, unit: 'glasses' },
        { id: uid(), name: 'Meditation', icon: '🧘', type: 'check', target: 1, unit: '' },
        { id: uid(), name: 'Sleep', icon: '😴', type: 'number', target: 7, unit: 'hrs' }
      ],
      tasks: [],
      notes: [],
      days: {}
    };
  }

  /* ---------------- state ---------------- */

  var state = load();
  var view = today();
  var noteFilter = 'all';
  var noteQuery = '';
  var openNotes = {};

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return seed();
      var data = JSON.parse(raw);
      return migrate(data);
    } catch (e) {
      console.warn('Could not read saved data, starting fresh.', e);
      return seed();
    }
  }

  function migrate(data) {
    var base = seed();
    if (!data || typeof data !== 'object') return base;
    data.routines = data.routines || base.routines;
    data.routines.placement = data.routines.placement || [];
    data.routines.university = data.routines.university || [];
    data.metrics = data.metrics || base.metrics;
    data.tasks = data.tasks || [];
    data.notes = data.notes || [];
    data.days = data.days || {};
    data.version = 1;
    return data;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast('Could not save — storage may be full or blocked.');
    }
  }

  /** Per-day record, created on demand. */
  function day(date) {
    var d = state.days[date];
    if (!d) {
      d = state.days[date] = { checks: {}, metrics: {}, note: '' };
    }
    d.checks = d.checks || {};
    d.metrics = d.metrics || {};
    if (typeof d.note !== 'string') d.note = '';
    return d;
  }

  /** Read-only view of a day — never creates a record. */
  function peek(date) {
    return state.days[date] || { checks: {}, metrics: {}, note: '' };
  }

  /* ---------------- small DOM helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ---------------- progress ---------------- */

  function routineProgress(page) {
    var items = state.routines[page] || [];
    var checks = peek(view).checks;
    var done = items.filter(function (i) { return checks[i.id]; }).length;
    return { done: done, total: items.length };
  }

  function metricMet(m, value) {
    if (m.type === 'check') return !!value;
    return (Number(value) || 0) >= Number(m.target || 0);
  }

  function healthProgress(date) {
    var vals = peek(date).metrics;
    var done = state.metrics.filter(function (m) { return metricMet(m, vals[m.id]); }).length;
    return { done: done, total: state.metrics.length };
  }

  function pageProgress(page) {
    if (page === 'health') return healthProgress(view);
    return routineProgress(page);
  }

  function renderProgress() {
    var strip = $('#progressStrip');
    strip.textContent = '';
    var labels = { placement: 'Placement', university: 'University', health: 'Health' };

    PAGES.forEach(function (page) {
      var p = pageProgress(page);
      var pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
      var box = el('div', 'prog' + (p.total && p.done === p.total ? ' is-done' : ''));
      var top = el('div', 'prog-top');
      top.appendChild(el('span', null, labels[page]));
      top.appendChild(el('b', null, p.done + '/' + p.total));
      var bar = el('div', 'bar');
      var fill = el('i');
      fill.style.width = pct + '%';
      bar.appendChild(fill);
      box.appendChild(top);
      box.appendChild(bar);
      strip.appendChild(box);
    });

    var total = 0, done = 0;
    PAGES.forEach(function (page) {
      var p = pageProgress(page);
      total += p.total; done += p.done;
    });
    var g = $('#greeting');
    if (view !== today()) {
      g.textContent = 'Viewing ' + prettyDate(view).toLowerCase() + '.';
    } else if (!total) {
      g.textContent = 'Add a few items to get going.';
    } else if (done === total) {
      g.textContent = 'Everything ticked off. Nice one. 🎉';
    } else {
      g.textContent = done + ' of ' + total + ' done today.';
    }
  }

  /* ---------------- routines ---------------- */

  function renderRoutine(page) {
    var list = $('#' + page + 'Routine');
    if (!list) return;
    list.textContent = '';
    var items = state.routines[page] || [];
    var checks = peek(view).checks;

    if (!items.length) {
      list.appendChild(el('li', 'empty', 'No check-in items yet — add one with “+ Item”.'));
    }

    items.forEach(function (item) {
      var checked = !!checks[item.id];
      var li = el('li', checked ? 'is-checked' : '');

      var tick = el('button', 'tick', '✓');
      tick.type = 'button';
      tick.setAttribute('role', 'checkbox');
      tick.setAttribute('aria-checked', String(checked));
      tick.setAttribute('aria-label', item.text);
      tick.addEventListener('click', function () {
        var live = day(view).checks;
        if (live[item.id]) delete live[item.id];
        else live[item.id] = true;
        save();
        renderRoutine(page);
        renderProgress();
      });

      var body = el('div', 'item-body');
      body.appendChild(el('span', 'item-text', item.text));

      var del = el('button', 'x-btn', '×');
      del.type = 'button';
      del.title = 'Remove from the daily check-in';
      del.addEventListener('click', function () {
        if (!confirm('Remove “' + item.text + '” from the daily check-in?')) return;
        state.routines[page] = items.filter(function (i) { return i.id !== item.id; });
        save();
        renderRoutine(page);
        renderProgress();
      });

      li.appendChild(tick);
      li.appendChild(body);
      li.appendChild(del);
      list.appendChild(li);
    });

    var p = routineProgress(page);
    var pill = $('#' + page + 'RoutineCount');
    if (pill) {
      pill.textContent = p.done + '/' + p.total;
      pill.classList.toggle('is-done', p.total > 0 && p.done === p.total);
    }
  }

  /* ---------------- tasks ---------------- */

  function dueLabel(due) {
    var t = today();
    if (due < t) return { text: 'Overdue · ' + prettyDate(due), cls: 'overdue' };
    if (due === t) return { text: 'Due today', cls: 'today' };
    return { text: 'Due ' + prettyDate(due), cls: '' };
  }

  function renderTasks(page) {
    var open = $('#' + page + 'Tasks');
    var doneList = $('#' + page + 'TasksDone');
    if (!open) return;
    open.textContent = '';
    doneList.textContent = '';

    var mine = state.tasks.filter(function (t) { return t.page === page; });
    var openTasks = mine.filter(function (t) { return !t.done; });
    var doneTasks = mine.filter(function (t) { return t.done; });

    openTasks.sort(function (a, b) {
      if (!!a.due !== !!b.due) return a.due ? -1 : 1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      return a.created - b.created;
    });
    doneTasks.sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });

    if (!openTasks.length) {
      open.appendChild(el('li', 'empty', 'Nothing open. Add what’s on your mind above.'));
    }
    openTasks.forEach(function (t) { open.appendChild(taskRow(t, page)); });
    doneTasks.forEach(function (t) { doneList.appendChild(taskRow(t, page)); });

    var pill = $('#' + page + 'TaskCount');
    if (pill) pill.textContent = openTasks.length + ' open';

    var btn = document.querySelector('[data-action="toggle-done"][data-page="' + page + '"]');
    if (btn) {
      btn.hidden = doneTasks.length === 0;
      btn.textContent = (doneList.hidden ? 'Show' : 'Hide') + ' completed (' + doneTasks.length + ')';
    }
  }

  function taskRow(task, page) {
    var li = el('li', task.done ? 'is-checked' : '');

    var tick = el('button', 'tick', '✓');
    tick.type = 'button';
    tick.setAttribute('role', 'checkbox');
    tick.setAttribute('aria-checked', String(!!task.done));
    tick.setAttribute('aria-label', task.text);
    tick.addEventListener('click', function () {
      task.done = !task.done;
      task.doneAt = task.done ? Date.now() : null;
      save();
      renderTasks(page);
    });

    var body = el('div', 'item-body');
    body.appendChild(el('span', 'item-text', task.text));
    if (task.due && !task.done) {
      var d = dueLabel(task.due);
      var meta = el('div', 'item-meta');
      meta.appendChild(el('span', 'due ' + d.cls, d.text));
      body.appendChild(meta);
    }

    var del = el('button', 'x-btn', '×');
    del.type = 'button';
    del.title = 'Delete task';
    del.addEventListener('click', function () {
      state.tasks = state.tasks.filter(function (t) { return t.id !== task.id; });
      save();
      renderTasks(page);
    });

    li.appendChild(tick);
    li.appendChild(body);
    li.appendChild(del);
    return li;
  }

  /* ---------------- university notes ---------------- */

  function renderNotes() {
    var wrap = $('#notesList');
    wrap.textContent = '';

    var q = noteQuery.trim().toLowerCase();
    var list = state.notes.filter(function (n) {
      if (noteFilter !== 'all' && n.kind !== noteFilter) return false;
      if (!q) return true;
      return (n.title + ' ' + (n.unit || '') + ' ' + (n.body || '')).toLowerCase().indexOf(q) !== -1;
    });
    list.sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || b.created - a.created; });

    if (!list.length) {
      wrap.appendChild(el('p', 'empty', state.notes.length
        ? 'No notes match that filter.'
        : 'No notes yet — add lecture notes, readings or anything to remember.'));
      return;
    }

    list.forEach(function (n) {
      var card = el('div', 'note');

      var head = el('div', 'note-head');
      head.appendChild(el('span', 'note-kind ' + n.kind, n.kind));
      head.appendChild(el('h4', null, n.title));

      var del = el('button', 'x-btn', '×');
      del.type = 'button';
      del.title = 'Delete note';
      del.addEventListener('click', function () {
        if (!confirm('Delete “' + n.title + '”?')) return;
        state.notes = state.notes.filter(function (x) { return x.id !== n.id; });
        save();
        renderNotes();
      });
      head.appendChild(del);
      card.appendChild(head);

      var sub = [n.unit, n.date ? prettyDate(n.date) : ''].filter(Boolean).join(' · ');
      if (sub) card.appendChild(el('p', 'note-sub', sub));

      if (n.body) {
        var isOpen = !!openNotes[n.id];
        var short = n.body.length > 180 && !isOpen;
        card.appendChild(el('p', 'note-body', short ? n.body.slice(0, 180) + '…' : n.body));
        if (n.body.length > 180) {
          var more = el('button', 'link-btn note-toggle', isOpen ? 'Show less' : 'Show more');
          more.type = 'button';
          more.addEventListener('click', function () {
            openNotes[n.id] = !isOpen;
            renderNotes();
          });
          card.appendChild(more);
        }
      }

      wrap.appendChild(card);
    });
  }

  /* ---------------- health ---------------- */

  function streak(metric) {
    var n = 0;
    var d = today();
    // today only counts once met; otherwise the streak is measured to yesterday
    if (!metricMet(metric, peek(d).metrics[metric.id])) {
      d = shiftISO(d, -1);
    }
    while (state.days[d] && metricMet(metric, state.days[d].metrics[metric.id])) {
      n++;
      d = shiftISO(d, -1);
    }
    return n;
  }

  function renderMetrics() {
    var wrap = $('#metricsList');
    wrap.textContent = '';
    var vals = peek(view).metrics;

    if (!state.metrics.length) {
      wrap.appendChild(el('p', 'empty', 'No targets yet — add one with “+ Target”.'));
    }

    state.metrics.forEach(function (m) {
      var value = vals[m.id];
      var met = metricMet(m, value);
      var row = el('div', 'metric' + (met ? ' is-met' : ''));

      row.appendChild(el('span', 'metric-ico', m.icon || '•'));

      var body = el('div', 'metric-body');
      body.appendChild(el('div', 'metric-name', m.name));
      var s = streak(m);
      var sub = el('div', 'metric-target');
      sub.textContent = m.type === 'check'
        ? ''
        : 'Target ' + m.target + (m.unit ? ' ' + m.unit : '');
      if (sub.textContent) body.appendChild(sub);
      if (s > 1) {
        var st = el('div', 'metric-streak', '🔥 ' + s + ' day streak');
        body.appendChild(st);
      }
      row.appendChild(body);

      var ctrl = el('div', 'metric-ctrl');

      if (m.type === 'check') {
        var tick = el('button', 'tick', '✓');
        tick.type = 'button';
        tick.setAttribute('role', 'checkbox');
        tick.setAttribute('aria-checked', String(!!value));
        tick.setAttribute('aria-label', m.name);
        tick.addEventListener('click', function () {
          var live = day(view).metrics;
          if (live[m.id]) delete live[m.id]; else live[m.id] = true;
          save(); renderMetrics(); renderProgress(); renderHistory();
        });
        ctrl.appendChild(tick);

      } else if (m.type === 'counter') {
        var minus = el('button', 'step-btn', '−');
        minus.type = 'button';
        minus.setAttribute('aria-label', 'Decrease ' + m.name);
        minus.addEventListener('click', function () {
          var live = day(view).metrics;
          live[m.id] = Math.max(0, (Number(live[m.id]) || 0) - 1);
          save(); renderMetrics(); renderProgress(); renderHistory();
        });
        var val = el('div', 'metric-val', (Number(value) || 0) + ' / ' + m.target);
        var plus = el('button', 'step-btn', '+');
        plus.type = 'button';
        plus.setAttribute('aria-label', 'Increase ' + m.name);
        plus.addEventListener('click', function () {
          var live = day(view).metrics;
          live[m.id] = (Number(live[m.id]) || 0) + 1;
          save(); renderMetrics(); renderProgress(); renderHistory();
        });
        ctrl.appendChild(minus);
        ctrl.appendChild(val);
        ctrl.appendChild(plus);

      } else {
        var input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = 'any';
        input.value = value == null ? '' : value;
        input.placeholder = '0';
        input.setAttribute('aria-label', m.name);
        input.addEventListener('change', function () {
          var live = day(view).metrics;
          var v = input.value === '' ? null : Number(input.value);
          if (v == null || isNaN(v)) delete live[m.id]; else live[m.id] = v;
          save(); renderMetrics(); renderProgress(); renderHistory();
        });
        ctrl.appendChild(input);
        ctrl.appendChild(el('span', 'metric-unit', m.unit || ''));
      }

      var del = el('button', 'x-btn', '×');
      del.type = 'button';
      del.title = 'Remove target';
      del.addEventListener('click', function () {
        if (!confirm('Remove the “' + m.name + '” target?')) return;
        state.metrics = state.metrics.filter(function (x) { return x.id !== m.id; });
        save(); renderMetrics(); renderProgress(); renderHistory();
      });

      row.appendChild(ctrl);
      row.appendChild(del);
      wrap.appendChild(row);
    });

    var p = healthProgress(view);
    var pill = $('#healthCount');
    pill.textContent = p.done + '/' + p.total;
    pill.classList.toggle('is-done', p.total > 0 && p.done === p.total);
  }

  function renderHistory() {
    var wrap = $('#healthHistory');
    wrap.textContent = '';
    var strip = el('div', 'heat');

    for (var i = 13; i >= 0; i--) {
      var date = shiftISO(today(), -i);
      var p = healthProgress(date);
      var ratio = p.total ? p.done / p.total : 0;
      var lv = ratio === 0 ? '' : ratio < .5 ? ' lv1' : ratio < 1 ? ' lv2' : ' lv3';

      var col = el('div', 'heat-day');
      var cell = el('div', 'heat-cell' + lv + (date === today() ? ' is-today' : ''), String(p.done));
      cell.title = prettyDate(date) + ' — ' + p.done + '/' + p.total + ' targets met';
      col.appendChild(cell);
      col.appendChild(el('div', 'heat-lbl', parseISO(date).toLocaleDateString(undefined, { weekday: 'narrow' })));
      strip.appendChild(col);
    }
    wrap.appendChild(strip);
  }

  /* ---------------- modal ---------------- */

  function openModal(title, fields, onSubmit) {
    var backdrop = $('#modal');
    var form = $('#modalForm');
    $('#modalTitle').textContent = title;
    form.textContent = '';

    fields.forEach(function (f) {
      var label = el('label', null, f.label);
      label.htmlFor = 'f_' + f.name;
      var input;
      if (f.type === 'textarea') {
        input = document.createElement('textarea');
      } else if (f.type === 'select') {
        input = document.createElement('select');
        f.options.forEach(function (o) {
          var opt = document.createElement('option');
          opt.value = o.value; opt.textContent = o.label;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement('input');
        input.type = f.type || 'text';
        if (f.type === 'number') { input.step = f.step || 'any'; input.min = '0'; }
      }
      input.id = 'f_' + f.name;
      input.name = f.name;
      if (f.value != null) input.value = f.value;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.required) input.required = true;
      form.appendChild(label);
      form.appendChild(input);
    });

    var actions = el('div', 'modal-actions');
    var cancel = el('button', 'ghost-btn', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', closeModal);
    var submit = el('button', 'primary-btn', 'Save');
    submit.type = 'submit';
    actions.appendChild(cancel);
    actions.appendChild(submit);
    form.appendChild(actions);

    form.onsubmit = function (e) {
      e.preventDefault();
      var data = {};
      fields.forEach(function (f) { data[f.name] = form.elements[f.name].value.trim(); });
      onSubmit(data);
      closeModal();
    };

    backdrop.hidden = false;
    var first = form.querySelector('input, textarea, select');
    if (first) first.focus();
  }

  function closeModal() {
    $('#modal').hidden = true;
    $('#modalForm').textContent = '';
  }

  /* ---------------- render all ---------------- */

  function render() {
    var isPast = view < today();
    var label = $('#dateLabel');
    label.textContent = prettyDate(view);
    label.classList.toggle('is-past', isPast);

    PAGES.forEach(function (p) {
      if (p !== 'health') renderRoutine(p);
      renderTasks(p);
    });
    $('#placementNote').value = peek(view).note;
    renderNotes();
    renderMetrics();
    renderHistory();
    renderProgress();
  }

  /* ---------------- wiring ---------------- */

  function switchPage(page) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.dataset.page === page);
    });
    document.querySelectorAll('.page').forEach(function (s) {
      s.classList.toggle('is-active', s.id === 'page-' + page);
    });
    try { localStorage.setItem(KEY + '/tab', page); } catch (e) { /* ignore */ }
    window.scrollTo({ top: 0 });
  }

  $('#tabs').addEventListener('click', function (e) {
    var tab = e.target.closest('.tab');
    if (tab) switchPage(tab.dataset.page);
  });

  $('#prevDay').addEventListener('click', function () { view = shiftISO(view, -1); render(); });
  $('#nextDay').addEventListener('click', function () { view = shiftISO(view, 1); render(); });
  $('#dateLabel').addEventListener('click', function () { view = today(); render(); });

  // add task forms
  document.querySelectorAll('[data-add-task]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var page = form.dataset.addTask;
      var text = form.elements.text.value.trim();
      if (!text) return;
      state.tasks.push({
        id: uid(), page: page, text: text,
        due: form.elements.due.value || '',
        done: false, created: Date.now()
      });
      form.reset();
      save();
      renderTasks(page);
    });
  });

  // day note
  var noteTimer;
  $('#placementNote').addEventListener('input', function (e) {
    day(view).note = e.target.value;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(save, 400);
  });

  // note filters
  $('#noteChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    noteFilter = chip.dataset.kind;
    document.querySelectorAll('#noteChips .chip').forEach(function (c) {
      c.classList.toggle('is-active', c === chip);
    });
    renderNotes();
  });
  $('#noteSearch').addEventListener('input', function (e) {
    noteQuery = e.target.value;
    renderNotes();
  });

  // delegated actions
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;

    if (action === 'add-routine') {
      var page = btn.dataset.page;
      openModal('Add check-in item', [
        { name: 'text', label: 'What do you need to do each day?', required: true,
          placeholder: 'e.g. Check clinic emails' }
      ], function (data) {
        if (!data.text) return;
        state.routines[page].push({ id: uid(), text: data.text });
        save();
        renderRoutine(page);
        renderProgress();
      });

    } else if (action === 'toggle-done') {
      var p = btn.dataset.page;
      var list = $('#' + p + 'TasksDone');
      list.hidden = !list.hidden;
      renderTasks(p);

    } else if (action === 'add-note') {
      openModal('Add note', [
        { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Week 5 — Pharmacology' },
        { name: 'kind', label: 'Type', type: 'select', options: [
          { value: 'lecture', label: 'Lecture' },
          { value: 'reading', label: 'Reading' },
          { value: 'note', label: 'Note' }
        ] },
        { name: 'unit', label: 'Unit / module (optional)', placeholder: 'e.g. NURS2001' },
        { name: 'date', label: 'Date', type: 'date', value: view },
        { name: 'body', label: 'Notes', type: 'textarea', placeholder: 'Key points, page numbers, questions…' }
      ], function (data) {
        if (!data.title) return;
        state.notes.push({
          id: uid(), title: data.title, kind: data.kind || 'note',
          unit: data.unit, date: data.date || view, body: data.body, created: Date.now()
        });
        save();
        renderNotes();
      });

    } else if (action === 'add-metric') {
      openModal('Add daily target', [
        { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Stretching' },
        { name: 'icon', label: 'Emoji', placeholder: '🏃', value: '⭐' },
        { name: 'type', label: 'How do you track it?', type: 'select', options: [
          { value: 'check', label: 'Tick it off (done / not done)' },
          { value: 'counter', label: 'Count up (+ / − buttons)' },
          { value: 'number', label: 'Type a number' }
        ] },
        { name: 'target', label: 'Daily target', type: 'number', value: '1' },
        { name: 'unit', label: 'Unit (optional)', placeholder: 'min, km, glasses' }
      ], function (data) {
        if (!data.name) return;
        state.metrics.push({
          id: uid(), name: data.name, icon: data.icon || '⭐',
          type: data.type || 'check',
          target: data.type === 'check' ? 1 : (Number(data.target) || 1),
          unit: data.unit || ''
        });
        save();
        renderMetrics(); renderProgress(); renderHistory();
      });

    } else if (action === 'export') {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'daily-hub-' + today() + '.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Backup downloaded.');

    } else if (action === 'import') {
      $('#importFile').click();

    } else if (action === 'reset-day') {
      if (!confirm('Clear all ticks, health values and notes for ' + prettyDate(view) + '?')) return;
      delete state.days[view];
      save();
      render();
      toast('Day cleared.');
    }
  });

  $('#importFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!confirm('Replace everything currently saved with this backup?')) return;
        state = migrate(data);
        save();
        render();
        toast('Backup restored.');
      } catch (err) {
        toast('That file could not be read.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('#modal').addEventListener('click', function (e) {
    if (e.target === e.currentTarget) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  // roll the view forward if the tab has been left open past midnight
  setInterval(function () {
    if (view !== today() && view === shiftISO(today(), -1)) {
      view = today();
      render();
    }
  }, 60000);

  /* ---------------- boot ---------------- */

  try {
    var lastTab = localStorage.getItem(KEY + '/tab');
    if (PAGES.indexOf(lastTab) !== -1) switchPage(lastTab);
  } catch (e) { /* ignore */ }

  render();
  save();
})();
