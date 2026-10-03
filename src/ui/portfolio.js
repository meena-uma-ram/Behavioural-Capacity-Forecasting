// "Projects" tab: who works on which project, who is overloaded, and who will be needed.

import { forecastPortfolio, PORTFOLIO_DEFAULTS } from '../engine/portfolio.js';
import { h } from './dom.js';

export const MAX_PROJECTS = 8; // one validated colour per project; more would need generated hues
const HORIZONS = [2, 4, 6, 8, 12];

/**
 * Keep each project's colour stable while others are added or removed:
 * survivors keep their slot, newcomers take the lowest free one.
 */
export function assignSlots(selected, slots = {}) {
  const next = {};
  for (const key of selected) if (slots[key] != null) next[key] = slots[key];
  const used = new Set(Object.values(next));
  for (const key of selected) {
    if (next[key] != null) continue;
    let slot = 1;
    while (used.has(slot)) slot++;
    next[key] = slot;
    used.add(slot);
  }
  return next;
}

/**
 * opts: {
 *   allProjects: [{ key, name }],
 *   prefs: { selected: [key], horizonWeeks, slots },
 *   settings,                                   // historyWeeks etc.
 *   loadData: async (keys, settings) => ({ completed, open }),
 *   onPrefsChange?: (prefs) => void,
 * }
 */
export function renderPortfolio(container, opts) {
  const prefs = {
    selected: opts.prefs?.selected?.slice(0, MAX_PROJECTS) || [],
    horizonWeeks: opts.prefs?.horizonWeeks || PORTFOLIO_DEFAULTS.horizonWeeks,
    slots: opts.prefs?.slots || {},
  };
  prefs.slots = assignSlots(prefs.selected, prefs.slots);

  const result = h('div', { class: 'bcf-portfolio-result', 'aria-live': 'polite' });
  const tooltip = h('div', { class: 'bcf-tooltip', role: 'tooltip', hidden: true });
  const pickerSummary = h('summary', {});
  let loadId = 0;

  const save = () => opts.onPrefsChange?.({ ...prefs });

  const reload = async () => {
    const id = ++loadId;
    pickerSummary.textContent = `Choose projects · ${prefs.selected.length} selected`;
    if (prefs.selected.length === 0) {
      result.replaceChildren(h('p', { class: 'bcf-hint' }, `Choose up to ${MAX_PROJECTS} projects to compare.`));
      return;
    }
    result.replaceChildren(h('p', { class: 'bcf-hint' }, 'Reading project work…'));
    try {
      const settings = { ...PORTFOLIO_DEFAULTS, ...opts.settings, horizonWeeks: prefs.horizonWeeks };
      const data = await opts.loadData(prefs.selected, settings);
      if (id !== loadId) return; // a newer selection is already loading
      const projects = prefs.selected.map((key) => opts.allProjects.find((p) => p.key === key) || { key, name: key });
      const f = forecastPortfolio({ projects, ...data, settings });
      result.replaceChildren(...portfolioView(f, prefs.slots));
    } catch (err) {
      if (id === loadId) result.replaceChildren(h('p', { class: 'bcf-warning' }, `Could not read projects: ${err.message}`));
    }
  };

  // --- controls ---
  const filter = h('input', { type: 'search', placeholder: 'Filter projects', 'aria-label': 'Filter projects' });
  const list = h('div', { class: 'bcf-picker-list' });
  const drawList = () => {
    const q = filter.value.trim().toLowerCase();
    const full = prefs.selected.length >= MAX_PROJECTS;
    list.replaceChildren(...opts.allProjects
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q))
      .slice(0, 200)
      .map((p) => {
        const checked = prefs.selected.includes(p.key);
        return h('label', { class: 'bcf-pick' },
          h('input', {
            type: 'checkbox', checked, disabled: !checked && full,
            onChange: (e) => {
              prefs.selected = e.target.checked ? [...prefs.selected, p.key] : prefs.selected.filter((k) => k !== p.key);
              prefs.slots = assignSlots(prefs.selected, prefs.slots);
              save();
              drawList();
              reload();
            },
          }),
          checked ? swatch(prefs.slots[p.key]) : null,
          ` ${p.name} `, h('span', { class: 'bcf-muted' }, p.key));
      }));
  };
  filter.addEventListener('input', drawList);

  const horizon = h('label', { class: 'bcf-horizon' }, 'Next ',
    h('select', {
      'aria-label': 'Forecast horizon',
      onChange: (e) => { prefs.horizonWeeks = Number(e.target.value); save(); reload(); },
    }, HORIZONS.map((w) => h('option', { value: w, selected: w === prefs.horizonWeeks }, `${w} weeks`))));

  container.replaceChildren(
    h('div', { class: 'bcf-controls' },
      h('details', { class: 'bcf-picker', open: prefs.selected.length === 0 }, pickerSummary, filter, list),
      horizon),
    result,
    tooltip,
  );
  drawList();
  attachTooltip(container, tooltip);
  reload();
}

function portfolioView(f, slots) {
  const u = f.unit;
  const short = f.projects.filter((p) => p.gap > 0.05);
  const verdict = f.totals.extraPeopleNeeded > 0
    ? ['high', `Need about ${fmtPeople(f.totals.extraPeopleNeeded, 'more ')}`]
    : short.length ? ['medium', 'Gaps can be covered by moving people'] : ['good', 'All projects are covered'];

  return [
    h('p', { class: `bcf-verdict bcf-${verdict[0]}` },
      h('strong', {}, verdict[1]),
      ` — next ${f.horizonWeeks} weeks: ${f.totals.demand} ${u} of work, the assigned people can deliver ~${f.totals.deliverable} ${u}.`
      + (f.totals.overloaded ? ` ${f.totals.overloaded} ${f.totals.overloaded === 1 ? 'person is' : 'people are'} overloaded.` : '')),
    legend(f.projects, slots),
    h('h3', {}, 'Projects'),
    projectsView(f, slots),
    h('h3', {}, 'People'),
    peopleView(f, slots),
    h('p', { class: 'bcf-footer' },
      `Capacity = each person's completed ${u === 'pts' ? 'points' : 'tasks'} per week over recent history × ${f.horizonWeeks} weeks. ` +
      'People with no recent history count as half a typical person. Calculated in your browser; nothing leaves this page.'),
  ];
}

function projectsView(f, slots) {
  const u = f.unit;
  const scale = Math.max(...f.projects.map((p) => p.demand), 1);
  return h('div', { class: 'bcf-rows' }, f.projects.map((p) => {
    const color = `var(--bcf-s${slots[p.key]})`;
    const status = p.gap <= 0.05
      ? h('span', { class: 'bcf-status bcf-good' }, '✓ covered')
      : p.uncovered > 0.05
        ? h('span', { class: 'bcf-status bcf-high' }, `▲ short ${p.gap} ${u}`)
        : h('span', { class: 'bcf-status bcf-medium' }, `◆ short ${p.gap} ${u}, fixable by moving people`);

    const needed = p.suggestions.length || p.extraPeopleNeeded > 0
      ? h('p', { class: 'bcf-needed' }, h('strong', {}, 'Needed: '),
        joinNodes([
          ...p.suggestions.map((s) => h('span', {}, `${s.name} (+${s.amount} ${u}${s.knowsProject ? ', knows project' : ''})`)),
          p.extraPeopleNeeded > 0 ? h('span', { class: 'bcf-high' }, `${fmtPeople(p.extraPeopleNeeded, 'more ')} (borrow or hire)`) : null,
        ].filter(Boolean)))
      : null;

    const taskList = [...p.atRiskTasks.map((t) => ({ ...t, why: `at risk — ${t.assignee} is over capacity` })),
      ...p.unassignedTasks.map((t) => ({ ...t, why: 'unassigned' }))];

    return h('div', { class: 'bcf-row bcf-project' },
      h('div', { class: 'bcf-row-head' },
        h('span', { class: 'bcf-name' }, swatch(slots[p.key]), ` ${p.name}`),
        h('span', { class: 'bcf-figures' }, `${p.demand} ${u} · ${p.taskCount} tasks · `, status)),
      bar([
        { width: p.deliverable / scale, color, tip: `${p.name}: ~${p.deliverable} ${u} deliverable by assigned people` },
        { width: p.gap / scale, gap: true, tip: `${p.name}: ${p.gap} ${u} not covered (unassigned or over capacity)` },
      ], `${p.name}: ${p.demand} ${u} of work, ${p.deliverable} deliverable, ${p.gap} short`),
      h('p', { class: 'bcf-who' }, h('strong', {}, 'Working on it: '),
        p.contributors.length ? p.contributors.map((c) => `${c.name} ${c.assigned}`).join(' · ') : 'nobody assigned yet'),
      needed,
      taskList.length
        ? h('details', { class: 'bcf-tasks' },
          h('summary', {}, `${taskList.length} task${taskList.length === 1 ? '' : 's'} need attention`),
          h('ul', {}, taskList.map((t) => h('li', {},
            h('span', { class: 'bcf-key' }, t.key), ` ${t.summary} `,
            h('span', { class: 'bcf-muted' }, `(${t.size} ${u}${t.due ? `, due ${t.due}` : ''}, ${t.why})`)))))
        : null,
      p.unestimated ? h('p', { class: 'bcf-hint' }, `${p.unestimated} tasks have no estimate; counted at the typical size.`) : null,
    );
  }));
}

function peopleView(f, slots) {
  const u = f.unit;
  const scale = Math.max(...f.people.map((p) => Math.max(p.totalAssigned, p.capacity)), 1);
  const projectName = Object.fromEntries(f.projects.map((p) => [p.key, p.name]));

  return h('div', { class: 'bcf-rows' }, f.people.map((p) => {
    const load = Number.isFinite(p.load) ? Math.round(p.load * 100) : null;
    const state = p.load > 1.05 ? ['high', '▲ overloaded'] : p.load < 0.7 ? ['good', '○ has room'] : ['neutral', '● on track'];
    const notes = [
      p.projectCount >= 2 ? `${p.projectCount} projects: ~${Math.round(p.switchingLoss * 100)}% lost to switching` : null,
      p.noHistory ? 'new — no recent history' : null,
      p.atRisk.length ? `${p.atRisk.length} task${p.atRisk.length === 1 ? '' : 's'} at risk` : null,
      p.spare > 0 ? `${p.spare} ${u} spare` : null,
    ].filter(Boolean);

    const segments = Object.entries(p.assignedByProject)
      .sort((a, b) => slots[a[0]] - slots[b[0]])
      .map(([key, v]) => ({ width: v / scale, color: `var(--bcf-s${slots[key]})`, tip: `${p.name} · ${projectName[key]}: ${v} ${u}` }));

    return h('div', { class: 'bcf-row bcf-person' },
      h('div', { class: 'bcf-row-head' },
        h('span', { class: 'bcf-name' }, p.name),
        h('span', { class: 'bcf-figures' }, `${p.totalAssigned} / ${p.capacity} ${u} · `,
          h('span', { class: `bcf-status bcf-${state[0]}` }, `${load ?? '–'}% ${state[1]}`))),
      bar(segments, `${p.name}: ${p.totalAssigned} ${u} assigned, capacity ${p.capacity}`,
        { marker: p.capacity / scale, markerTip: `${p.name}'s capacity: ${p.capacity} ${u} in ${f.horizonWeeks} weeks` }),
      notes.length ? h('p', { class: 'bcf-hint' }, notes.join(' · ')) : null,
    );
  }));
}

function bar(segments, label, { marker, markerTip } = {}) {
  const visible = segments.filter((s) => s.width > 0);
  return h('div', { class: 'bcf-bar', role: 'img', 'aria-label': label },
    visible.map((s, i) => h('span', {
      class: `bcf-seg${s.gap ? ' bcf-seg-gap' : ''}${i === visible.length - 1 ? ' bcf-seg-end' : ''}`,
      style: `width: calc(${(s.width * 100).toFixed(2)}% - 2px);${s.color ? ` background: ${s.color};` : ''}`,
      'data-tip': s.tip,
    })),
    marker != null ? h('span', { class: 'bcf-marker', style: `left: ${(Math.min(marker, 1) * 100).toFixed(2)}%`, 'data-tip': markerTip }) : null);
}

function legend(projects, slots) {
  return h('div', { class: 'bcf-legend' },
    projects.map((p) => h('span', {}, swatch(slots[p.key]), ` ${p.name}`)),
    h('span', {}, h('span', { class: 'bcf-swatch bcf-seg-gap' }), ' not covered'),
    h('span', {}, h('span', { class: 'bcf-swatch bcf-marker-key' }), ' capacity'));
}

function swatch(slot) {
  return h('span', { class: 'bcf-swatch', style: `background: var(--bcf-s${slot})`, 'aria-hidden': 'true' });
}

function joinNodes(nodes) {
  return nodes.flatMap((n, i) => (i ? [', ', n] : [n]));
}

function fmtPeople(n, adjective = '') {
  return `${n} ${adjective}${n === 1 ? 'person' : 'people'}`;
}

function attachTooltip(root, tip) {
  root.addEventListener('mouseover', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (!target) return;
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
  });
  root.addEventListener('mousemove', (e) => {
    if (tip.hidden) return;
    tip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${e.clientY + 14}px`;
  });
  root.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('[data-tip]')) tip.hidden = true;
  });
}
