// Forecast panel UI, shared by the Jira content script and the demo page.
// Built with DOM APIs (no innerHTML) so Jira data can never inject markup.

import { forecastSprint, memberCapacityFactor, pct, RAMP_FACTORS } from '../engine/forecast.js';

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c instanceof Node ? c : String(c));
  return el;
}

const RAMP_LABELS = { none: 'Normal', returning: 'Back from leave', newJoiner: 'New joiner' };

/**
 * Render the panel into `container`.
 * state: { sprintName, history, plannedPoints, members, settings, onMembersChange }
 * Team edits refresh only the forecast and that person's capacity cell, so inputs keep focus.
 */
export function renderPanel(container, state) {
  const forecastSlot = h('div');
  const footer = h('footer', { class: 'bcf-footer' });

  const refresh = () => {
    const f = forecastSprint({
      history: state.history,
      members: state.members,
      plannedPoints: state.plannedPoints,
      settings: state.settings,
    });
    forecastSlot.replaceChildren(f.ok ? forecastView(f, state) : h('p', { class: 'bcf-warning' }, f.warnings.join(' ')));
    footer.textContent = `Based on ${f.summary.sprintCount} closed sprints. Calculated in your browser; nothing leaves this page.`;
  };

  container.replaceChildren(
    h('header', { class: 'bcf-header' },
      h('h2', {}, 'Capacity forecast'),
      state.sprintName ? h('p', { class: 'bcf-sub' }, state.sprintName) : null,
    ),
    forecastSlot,
    teamView(state, refresh),
    footer,
  );
  refresh();
}

function forecastView(f, state) {
  const planned = state.plannedPoints;
  const verdict =
    f.planProbability == null ? null
      : f.planProbability >= 0.8 ? ['good', 'Plan looks achievable']
        : f.planProbability >= 0.5 ? ['medium', 'Plan is a stretch']
          : ['high', 'Plan is unlikely to land'];

  return h('section', { class: 'bcf-forecast' },
    h('div', { class: 'bcf-stats' },
      stat('Confident (80%)', f.confident80, 'pts'),
      stat('Likely', f.likely, 'pts'),
      stat('Stretch', f.stretch, 'pts'),
    ),
    planned != null
      ? h('p', { class: `bcf-verdict bcf-${verdict[0]}` },
        h('strong', {}, verdict[1]),
        ` — ${planned} pts planned, ${pct(f.planProbability)} chance of finishing it.`)
      : null,
    h('p', { class: 'bcf-meta' },
      `Team capacity ${pct(f.capacityFactor)} of a typical sprint · ~${f.expectedUnplannedPoints} pts of unplanned work expected`),
    f.risks.length
      ? h('ul', { class: 'bcf-risks' }, f.risks.map((r) => h('li', { class: `bcf-${r.level}` }, r.text)))
      : null,
    f.warnings.map((w) => h('p', { class: 'bcf-warning' }, w)),
  );
}

function stat(label, value, unit) {
  return h('div', { class: 'bcf-stat' },
    h('span', { class: 'bcf-stat-value' }, String(value)),
    h('span', { class: 'bcf-stat-unit' }, unit),
    h('span', { class: 'bcf-stat-label' }, label));
}

function teamView(state, refresh) {
  const s = state.settings || {};
  const capCells = state.members.map((m) => h('td', { class: 'bcf-cap' }, pct(memberCapacityFactor(m, s))));
  const update = (i, patch) => {
    state.members[i] = { ...state.members[i], ...patch };
    capCells[i].textContent = pct(memberCapacityFactor(state.members[i], s));
    state.onMembersChange?.(state.members);
    refresh();
  };
  const num = (i, key, value, attrs = {}) =>
    h('input', {
      type: 'number', min: '0', step: '1', value: value ?? '', 'aria-label': key, ...attrs,
      onChange: (e) => update(i, { [key]: e.target.value === '' ? undefined : Number(e.target.value) }),
    });

  return h('details', { class: 'bcf-team', open: true },
    h('summary', {}, 'Team this sprint'),
    h('p', { class: 'bcf-hint' },
      `Only enter what differs from a typical sprint (${s.typicalMeetingHoursPerWeek ?? 6}h/wk meetings, ${s.typicalProjects ?? 1} project).`),
    h('div', { class: 'bcf-table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, ['Person', 'Days off', 'Meetings h/wk', 'Projects', 'Status', 'Capacity'].map((t) => h('th', {}, t)))),
      h('tbody', {}, state.members.map((m, i) =>
        h('tr', {},
          h('td', {}, m.name),
          h('td', {}, num(i, 'daysOff', m.daysOff, { max: String(s.sprintDays ?? 10) })),
          h('td', {}, num(i, 'meetingHoursPerWeek', m.meetingHoursPerWeek, { placeholder: String(s.typicalMeetingHoursPerWeek ?? 6) })),
          h('td', {}, num(i, 'projects', m.projects, { min: '1', placeholder: String(s.typicalProjects ?? 1) })),
          h('td', {}, h('select', { 'aria-label': 'status', onChange: (e) => update(i, { ramp: e.target.value }) },
            Object.keys(RAMP_FACTORS).map((k) => h('option', { value: k, selected: (m.ramp || 'none') === k }, RAMP_LABELS[k])))),
          capCells[i],
        ))),
    )),
    state.members.length === 0 ? h('p', { class: 'bcf-hint' }, 'No assignees found in the planned sprint.') : null,
  );
}
