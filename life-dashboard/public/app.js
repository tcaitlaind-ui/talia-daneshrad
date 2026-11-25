/* global Dates */
// Life Dashboard: Today, This Week, This Month. Every target is read from data.config.plan.
(function () {
  const D = Dates;
  const WEEK_ITEM_LIMIT = 5;
  const METRICS = [
    { key: 'revenue', name: 'Recurring revenue', money: true, compare: 'monthly', field: 'revenue' },
    { key: 'profit', name: 'Profit', money: true, compare: 'change' },
    { key: 'ownerPay', name: 'Owner pay', money: true, compare: 'annual', field: 'ownerPayAnnual' },
    { key: 'quinnFollowers', name: 'Quinn followers', money: false, compare: 'monthly', field: 'quinnFollowers' },
    { key: 'quinnIncome', name: 'Quinn income', money: true, compare: 'annual', field: 'quinnIncomeAnnual' }
  ];

  let data = null;
  let view = 'today';
  let now = new Date();
  const main = document.getElementById('main');

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const isNum = D.isNum;
  const fmtNum = (v) => Math.round(v).toLocaleString('en-US');
  const fmtMoney = (v) => (v < 0 ? '-$' : '$') + fmtNum(Math.abs(v));
  const fmtVal = (v, money) => (isNum(v) ? (money ? fmtMoney(v) : fmtNum(v)) : '—');
  const fmtMonth = (mk, opts = { month: 'short', year: 'numeric' }) => D.parseMonth(mk).toLocaleDateString('en-US', opts);
  const fmtShortDay = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // ---------- saving ----------
  let saving = Promise.resolve();
  function save() {
    const body = JSON.stringify(data);
    saving = saving.then(() => fetch('/api/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
      .then((r) => { if (!r.ok) throw new Error(r.status); document.getElementById('save-error').hidden = true; })
      .catch(() => { document.getElementById('save-error').hidden = false; }));
  }
  function commit() { save(); render(); }

  // ---------- rollover ----------
  // Today's task categories and how many tasks each holds, from config.todayCategories.
  function categories() {
    if (!Array.isArray(data.config.todayCategories) || !data.config.todayCategories.length) {
      data.config.todayCategories = [{ name: 'TRUFF', limit: 3 }, { name: 'Quinn', limit: 3 }, { name: 'Freelance', limit: 3 }];
    }
    return data.config.todayCategories;
  }
  // A new day starts with yesterday's (most recent day's) unchecked tasks. Checked ones stay behind.
  function ensureToday() {
    const k = D.dayKey(now);
    let changed = false;
    if (!data.days[k]) {
      const prev = D.prevKey(data.days, k);
      data.days[k] = prev ? data.days[prev].filter((t) => !t.done).map((t) => ({ text: t.text, done: false, category: t.category })) : [];
      changed = true;
    }
    // Tasks from before categories existed go in the first category.
    const names = categories().map((c) => c.name);
    for (const t of data.days[k]) if (!names.includes(t.category)) { t.category = names[0]; changed = true; }
    return changed;
  }
  // A new week (Monday) starts with last week's unchecked items, per project.
  function ensureWeek() {
    const k = D.weekKey(now);
    let changed = false;
    if (!data.weeks[k]) {
      const prev = D.prevKey(data.weeks, k);
      data.weeks[k] = {};
      for (const p of data.config.projects) {
        const old = prev && data.weeks[prev][p] ? data.weeks[prev][p] : [];
        data.weeks[k][p] = old.filter((t) => !t.done).map((t) => ({ text: t.text, done: false }));
      }
      changed = true;
    }
    for (const p of data.config.projects) if (!data.weeks[k][p]) { data.weeks[k][p] = []; changed = true; }
    return changed;
  }
  function rollover() {
    const hadCats = Array.isArray(data.config.todayCategories);
    const a = ensureToday() || !hadCats;
    const b = ensureWeek();
    if (a || b) save();
  }

  // ---------- shared pieces ----------
  function addInput(id, placeholder, onAdd, disabled) {
    return h('input', {
      class: 'add', id, type: 'text', placeholder, maxlength: 200, autocomplete: 'off', disabled: !!disabled,
      'aria-label': placeholder,
      onkeydown: (e) => {
        if (e.key !== 'Enter') return;
        const text = e.target.value.trim();
        if (!text) return;
        onAdd(text);
      }
    });
  }
  // `owner` is the array the items live in (items may be a filtered view of it).
  function taskList(items, emptyText, owner = items) {
    if (!items.length) return h('p', { class: 'empty', text: emptyText });
    return h('ul', { class: 'tasks' }, items.map((t) => h('li', { class: 'task' + (t.done ? ' done' : '') },
      h('button', { class: 'task-toggle', type: 'button', 'aria-pressed': String(!!t.done), onclick: () => { t.done = !t.done; commit(); } },
        h('span', { class: 'box', 'aria-hidden': 'true' }), h('span', { class: 'task-text', text: t.text })),
      h('button', { class: 'task-x', type: 'button', 'aria-label': `Delete "${t.text}"`, text: '×', onclick: () => { const i = owner.indexOf(t); if (i >= 0) owner.splice(i, 1); commit(); } })
    )));
  }

  // ---------- Calendar (today only, read-only) ----------
  const cal = { day: null, at: 0, loading: false, result: null, editing: false };
  function loadCalendar(force) {
    const day = D.dayKey(now);
    if (cal.loading) return;
    if (!force && cal.day === day && Date.now() - cal.at < 5 * 60 * 1000) return;
    cal.loading = true;
    saving.then(() => fetch('/api/calendar?day=' + day)).then((r) => r.json())
      .then((res) => { cal.result = res; })
      .catch(() => { cal.result = { configured: true, error: "Couldn't reach the server.", events: [] }; })
      .finally(() => { cal.loading = false; cal.day = day; cal.at = Date.now(); if (view === 'today') render(); });
  }
  function calendarSetup() {
    const saveUrl = () => {
      const el = document.getElementById('cal-url');
      const v = (el && el.value || '').trim();
      if (v && !/^https:\/\//i.test(v)) { el.setCustomValidity('Paste the address that starts with https://'); el.reportValidity(); return; }
      if (v) data.config.calendarIcsUrl = v; else delete data.config.calendarIcsUrl;
      cal.editing = false; cal.result = null; save(); render(); loadCalendar(true);
    };
    return h('div', { class: 'cal-setup' },
      h('p', { class: 'muted', text: "Paste your Google Calendar's secret iCal address to see today's events here." }),
      h('ol', { class: 'steps' },
        h('li', { text: 'Google Calendar on the web, Settings (gear icon)' }),
        h('li', { text: 'Under "Settings for my calendars", click your calendar' }),
        h('li', { text: 'Integrate calendar, copy "Secret address in iCal format"' })),
      h('input', {
        class: 'add', id: 'cal-url', type: 'url', placeholder: 'https://calendar.google.com/calendar/ical/…/basic.ics', autocomplete: 'off',
        'aria-label': 'Secret iCal address', value: data.config.calendarIcsUrl || '',
        oninput: (e) => e.target.setCustomValidity(''), onkeydown: (e) => { if (e.key === 'Enter') saveUrl(); }
      }),
      h('div', { class: 'cal-actions' },
        h('button', { class: 'btn', type: 'button', text: 'Save', onclick: saveUrl }),
        data.config.calendarIcsUrl ? h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: () => { cal.editing = false; render(); } }) : null),
      h('p', { class: 'fine', text: 'The address stays in data.json on this computer. Read-only.' }));
  }
  function renderCalendar() {
    loadCalendar(false);
    const res = cal.result;
    const head = h('div', { class: 'card-head' }, h('h2', { text: 'Calendar' }),
      data.config.calendarIcsUrl && !cal.editing ? h('button', { class: 'link', type: 'button', text: 'Change', onclick: () => { cal.editing = true; render(); } }) : null);
    let body;
    if (cal.editing || (res && !res.configured) || (!res && !data.config.calendarIcsUrl)) body = calendarSetup();
    else if (!res || (cal.loading && cal.day !== D.dayKey(now))) body = h('p', { class: 'empty', text: 'Loading today…' });
    else if (res.error) body = h('p', { class: 'cal-error', text: res.error });
    else if (!res.events.length) body = h('p', { class: 'empty', text: 'Nothing on the calendar today.' });
    else {
      const nowMs = Date.now();
      const time = (e) => (e.allDay ? 'All day' : new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }));
      body = h('ul', { class: 'events' }, res.events.map((e) => h('li', { class: 'event' + (!e.allDay && new Date(e.end) < nowMs ? ' past' : '') },
        h('span', { class: 'event-time', text: time(e) }), h('span', { class: 'event-title', text: e.title }))));
    }
    return h('section', { class: 'card cal-card' }, head, body);
  }

  // ---------- Today ----------
  function renderToday() {
    const tasks = data.days[D.dayKey(now)];
    const done = tasks.filter((t) => t.done).length;
    const groups = categories().map((c) => {
      const items = tasks.filter((t) => t.category === c.name);
      const limit = Number.isFinite(+c.limit) && +c.limit > 0 ? +c.limit : Infinity;
      const full = items.length >= limit;
      return h('section', { class: 'cat' },
        h('div', { class: 'card-head' }, h('h2', { text: c.name }), h('span', { text: `${items.filter((t) => t.done).length} of ${items.length}` })),
        addInput('add-cat-' + slug(c.name), full ? `${limit} tasks, that's today` : 'Add a task and press Enter',
          (text) => { if (items.length < limit) { tasks.push({ text, done: false, category: c.name }); commit(); } }, full),
        taskList(items, 'Nothing here yet.', tasks));
    });
    return h('section', {},
      h('header', { class: 'view-head' },
        h('h1', { text: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) }),
        h('p', { class: 'sub' }, h('b', { text: done }), ' of ', h('b', { text: tasks.length }), ' done')),
      h('div', { class: 'today-grid' }, renderCalendar(), h('div', { class: 'cats' }, groups)));
  }

  // ---------- This Week ----------
  function renderWeek() {
    const plan = data.config.plan;
    const p = D.period(plan, now);
    const week = data.weeks[D.weekKey(now)];
    const monday = D.mondayOf(now);
    const title = p ? `Week ${D.weekOfPeriod(p, now)} of ${p.short}` : 'This week';

    let focusPanel;
    if (p && p.kind === 'quarter') {
      const state = data.quarters[p.key] || (data.quarters[p.key] = { focus: [] });
      const doneOf = (text) => !!(state.focus.find((f) => f.text === text) || {}).done;
      const toggle = (text) => {
        const f = state.focus.find((x) => x.text === text);
        if (f) f.done = !f.done; else state.focus.push({ text, done: true });
        commit();
      };
      const items = p.quarter.focus || [];
      focusPanel = h('section', { class: 'focus' },
        h('p', { class: 'label', text: "This quarter's focus" }),
        h('h2', { text: p.label }),
        p.onTrack ? h('p', { class: 'ontrack', text: `On track: ${p.onTrack}` }) : null,
        items.length ? h('ul', { class: 'tasks' }, items.map((text) => h('li', { class: 'task' + (doneOf(text) ? ' done' : '') },
          h('button', { class: 'task-toggle', type: 'button', 'aria-pressed': String(doneOf(text)), onclick: () => toggle(text) },
            h('span', { class: 'box', 'aria-hidden': 'true' }), h('span', { class: 'task-text', text }))))) : h('p', { class: 'empty', text: 'No focus items in the plan for this quarter.' }));
    } else {
      focusPanel = h('section', { class: 'focus' },
        h('p', { class: 'label', text: "This quarter's focus" }),
        h('h2', { text: p ? p.label : 'No active plan period' }),
        h('p', { class: 'empty', text: 'The plan has no quarter for this period.' }));
    }

    const cards = data.config.projects.map((name) => {
      const items = week[name] || (week[name] = []);
      const full = items.length >= WEEK_ITEM_LIMIT;
      return h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', { text: name }), h('span', { text: `${items.filter((t) => t.done).length} of ${items.length}` })),
        addInput('add-' + slug(name), full ? `${WEEK_ITEM_LIMIT} items, that's the week` : 'Add an item and press Enter',
          (text) => { if (items.length < WEEK_ITEM_LIMIT) { items.push({ text, done: false }); commit(); } }, full),
        taskList(items, 'Nothing planned yet.'));
    });

    return h('section', {},
      h('header', { class: 'view-head' },
        h('h1', { text: title }),
        h('p', { class: 'sub', text: `${fmtShortDay(monday)} to ${fmtShortDay(D.addDays(monday, 6))}` })),
      focusPanel,
      h('p', { class: 'label', text: 'Projects' }),
      h('div', { class: 'projects' }, cards));
  }

  // ---------- This Month ----------
  function setMonthValue(mk, key, raw) {
    const s = String(raw).replace(/[$,\s]/g, '');
    const m = data.months[mk] || (data.months[mk] = {});
    if (s === '') delete m[key];
    else { const v = Number(s); if (!Number.isFinite(v)) return; m[key] = v; }
    if (!Object.keys(m).length) delete data.months[mk];
    commit();
  }
  function numInput(id, mk, key, label) {
    const m = data.months[mk] || {};
    return h('input', {
      class: 'num-input', id, type: 'text', inputmode: 'decimal', autocomplete: 'off', 'aria-label': label,
      value: isNum(m[key]) ? String(m[key]) : '',
      onchange: (e) => setMonthValue(mk, key, e.target.value),
      onkeydown: (e) => { if (e.key === 'Enter') e.target.blur(); }
    });
  }

  function metricRow(metric, mk, plan, p) {
    const months = data.months;
    const m = months[mk] || {};
    let current, target = null, basis, extra = null;
    const yearName = p && p.year ? D.yearShort(p.year) : '';

    if (metric.compare === 'monthly') {
      current = m[metric.key];
      target = D.monthlyTarget(plan, now, metric.field);
      basis = p && p.kind === 'quarter' ? `This month vs ${p.short} target` : `This month vs ${yearName} target`;
    } else if (metric.compare === 'annual') {
      const ytd = D.yearToDate(months, plan, now, metric.key);
      current = ytd.sum;
      target = D.annualTarget(plan, now, metric.field);
      basis = ytd.start ? `Year to date since ${fmtMonth(ytd.start)} vs ${yearName} annual` : 'Year to date';
    } else {
      current = m[metric.key];
      const prev = (months[D.addMonths(mk, -1)] || {})[metric.key];
      basis = 'Month over month';
      if (isNum(current) && isNum(prev)) {
        const c = current - prev;
        extra = h('div', { class: 'change', text: `${c >= 0 ? '+' : '-'}${fmtVal(Math.abs(c), metric.money)} vs ${fmtMonth(D.addMonths(mk, -1), { month: 'short' })}` });
      }
    }

    let status, cls;
    if (target === null) { status = 'no target this period'; cls = 'none'; }
    else if (!isNum(current)) { status = 'not entered yet'; cls = 'missing'; }
    else if (current >= target) { status = 'on track'; cls = 'on'; }
    else { status = 'behind'; cls = 'behind'; }

    return h('div', { class: 'metric' },
      h('div', {}, h('div', { class: 'metric-name', text: metric.name }), h('div', { class: 'metric-basis', text: basis })),
      h('div', {}, h('div', { class: 'big' + (isNum(current) ? '' : ' empty-num'), text: fmtVal(current, metric.money) }), extra),
      h('div', { class: 'target' }, target === null ? '—' : ['Target ', h('b', { text: fmtVal(target, metric.money) })]),
      h('span', { class: 'status ' + cls, text: status }),
      h('label', { class: 'entry' }, `${fmtMonth(mk, { month: 'long' })} number`, numInput('cur-' + metric.key, mk, metric.key, `${metric.name} for ${fmtMonth(mk, { month: 'long', year: 'numeric' })}`)));
  }

  function renderMonth() {
    const plan = data.config.plan;
    const mk = D.monthKey(now);
    const p = D.period(plan, now);

    const subBits = [];
    if (p) subBits.push(`Month ${p.monthOf} of ${p.monthsIn}`);
    if (p && p.onTrack) subBits.push(`On track: ${p.onTrack}`);
    else if (p && p.kind === 'year') subBits.push(`Checkpoint ${fmtMonth(p.year.checkpoint, { month: 'long', year: 'numeric' })}`);

    const trigger = plan.exitTrigger;
    let runway = null;
    if (isNum(trigger)) {
      const n = D.exitRunway(data.months, now, trigger);
      runway = h('p', { class: 'runway' }, 'Exit runway: ', h('b', { text: n }),
        isNum(plan.exitRunwayMonths) ? ` of ${plan.exitRunwayMonths} months` : (n === 1 ? ' month' : ' months'),
        ` above ${fmtMoney(trigger)}.`);
    }

    const rows = [];
    for (let i = 0; i < 12; i++) {
      const k = D.addMonths(mk, -i);
      rows.push(h('tr', { class: i === 0 ? 'current' : null },
        h('td', { text: fmtMonth(k) }),
        METRICS.map((m) => h('td', {}, numInput(`h-${k}-${m.key}`, k, m.key, `${m.name} for ${fmtMonth(k, { month: 'long', year: 'numeric' })}`)))));
    }

    return h('section', {},
      h('header', { class: 'view-head' },
        h('h1', { text: p ? p.label : 'No active plan period' }),
        h('p', { class: 'sub', text: subBits.join('  ·  ') })),
      h('div', { class: 'metrics' }, METRICS.map((m) => metricRow(m, mk, plan, p))),
      runway,
      h('p', { class: 'label', text: 'Twelve-month history' }),
      h('table', { class: 'history' },
        h('thead', {}, h('tr', {}, h('th', { text: 'Month' }), METRICS.map((m) => h('th', { text: m.name })))),
        h('tbody', {}, rows)));
  }

  // ---------- render + boot ----------
  function render() {
    const focusId = document.activeElement && document.activeElement.id;
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.view === view)));
    const el = view === 'week' ? renderWeek() : view === 'month' ? renderMonth() : renderToday();
    main.replaceChildren(el);
    if (focusId) { const f = document.getElementById(focusId); if (f) f.focus(); }
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { view = t.dataset.view; render(); }));

  // Watch for the date changing while the page stays open.
  function tick() {
    const n = new Date();
    if (D.dayKey(n) !== D.dayKey(now)) { now = n; rollover(); render(); } else now = n;
    if (view === 'today') loadCalendar(false);
  }
  setInterval(tick, 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  fetch('/api/data').then((r) => r.json()).then((d) => {
    data = d;
    for (const k of ['days', 'weeks', 'quarters', 'months']) if (!data[k] || typeof data[k] !== 'object') data[k] = {};
    data.config.projects = data.config.projects || [];
    rollover();
    render();
  }).catch(() => {
    main.replaceChildren(h('p', { class: 'muted', text: "Couldn't load data.json. Start the server with npm start." }));
  });
})();
