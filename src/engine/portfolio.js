// Cross-project load forecast: who works on what, who is overloaded,
// and which projects will need more people over the coming weeks.
// Pure functions only, like forecast.js.

import { contextSwitchYield } from './forecast.js';

export const PORTFOLIO_DEFAULTS = {
  historyWeeks: 12, // how far back to measure each person's throughput
  horizonWeeks: 6, // how far ahead to forecast
  newPersonRamp: 0.5, // capacity of someone with no completed work in the history window, vs team median
};

/**
 * projects:  [{ key, name }]
 * completed: [{ project, assignee, points }]   work finished in the last `historyWeeks`
 * open:      [{ key, summary, project, assignee|null, points|null, status, due|null }]
 *            work due within the horizon, ordered by priority (due date, then rank)
 */
export function forecastPortfolio({ projects, completed, open, settings = {} }) {
  const s = { ...PORTFOLIO_DEFAULTS, ...settings };
  const keys = new Set(projects.map((p) => p.key));
  completed = completed.filter((i) => keys.has(i.project) && i.assignee);
  open = open.filter((i) => keys.has(i.project));

  // Estimates: use points where the team uses them, otherwise count tasks.
  const estimated = [...completed, ...open].map((i) => i.points).filter((v) => v != null && v > 0);
  const unit = estimated.length ? 'pts' : 'tasks';
  const fallbackSize = unit === 'pts' ? median(estimated) : 1;
  const size = (i) => (unit === 'tasks' ? 1 : i.points ?? fallbackSize);

  // --- people: throughput, capacity over the horizon, current assignments ---
  const people = new Map();
  const person = (name) => {
    if (!people.has(name)) people.set(name, { name, done: 0, doneByProject: {}, assignedByProject: {}, tasks: [] });
    return people.get(name);
  };
  for (const i of completed) {
    const p = person(i.assignee);
    p.done += size(i);
    p.doneByProject[i.project] = (p.doneByProject[i.project] || 0) + size(i);
  }
  for (const i of open) {
    if (!i.assignee) continue;
    const p = person(i.assignee);
    p.assignedByProject[i.project] = (p.assignedByProject[i.project] || 0) + size(i);
    p.tasks.push(i);
  }

  const historicCapacities = [...people.values()].filter((p) => p.done > 0).map((p) => (p.done / s.historyWeeks) * s.horizonWeeks);
  const typicalCapacity = median(historicCapacities) || 1;

  const peopleOut = [...people.values()].map((p) => {
    const noHistory = p.done === 0;
    const capacity = noHistory ? typicalCapacity * s.newPersonRamp : (p.done / s.historyWeeks) * s.horizonWeeks;
    const totalAssigned = sum(Object.values(p.assignedByProject));
    const projectCount = Object.keys(p.assignedByProject).length;

    // Walk tasks in priority order; whatever doesn't fit in capacity is at risk.
    let used = 0;
    const atRisk = [];
    for (const t of p.tasks) {
      used += size(t);
      if (used > capacity + 1e-9) atRisk.push({ ...t, size: size(t) });
    }

    return {
      name: p.name,
      capacity: round1(capacity),
      assignedByProject: mapValues(p.assignedByProject, round1),
      doneByProject: p.doneByProject,
      totalAssigned: round1(totalAssigned),
      load: capacity > 0 ? totalAssigned / capacity : totalAssigned > 0 ? Infinity : 0,
      spare: round1(Math.max(0, capacity - totalAssigned)),
      projectCount,
      switchingLoss: 1 - contextSwitchYield(projectCount),
      noHistory,
      atRisk,
      // share of assigned work each person can finish in the horizon
      deliverRatio: totalAssigned > 0 ? Math.min(1, capacity / totalAssigned) : 1,
    };
  });
  const byName = new Map(peopleOut.map((p) => [p.name, p]));

  // --- projects: demand vs what assigned people can deliver ---
  const projectsOut = projects.map((proj) => {
    const tasks = open.filter((i) => i.project === proj.key);
    const demand = sum(tasks.map(size));
    const unassignedTasks = tasks.filter((t) => !t.assignee).map((t) => ({ ...t, size: size(t) }));
    const contributors = peopleOut
      .filter((p) => p.assignedByProject[proj.key])
      .map((p) => ({ name: p.name, assigned: p.assignedByProject[proj.key], deliverable: p.assignedByProject[proj.key] * p.deliverRatio }))
      .sort((a, b) => b.assigned - a.assigned);
    const deliverable = sum(contributors.map((c) => c.deliverable));
    const atRiskTasks = peopleOut.flatMap((p) => p.atRisk.filter((t) => t.project === proj.key));

    return {
      key: proj.key,
      name: proj.name,
      taskCount: tasks.length,
      unestimated: unit === 'pts' ? tasks.filter((t) => t.points == null).length : 0,
      demand: round1(demand),
      deliverable: round1(deliverable),
      gap: round1(Math.max(0, demand - deliverable)),
      contributors: contributors.map((c) => ({ ...c, deliverable: round1(c.deliverable) })),
      unassignedTasks,
      atRiskTasks,
      suggestions: [],
      extraPeopleNeeded: 0,
    };
  });

  // --- who will be needed: fill gaps from spare capacity ---
  // Pass 1 offers each project only people who already know it; pass 2 offers anyone left.
  const pool = new Map(peopleOut.filter((p) => p.spare > 0).map((p) => [p.name, p.spare]));
  const knows = (name, key) => (byName.get(name).doneByProject[key] || 0) + (byName.get(name).assignedByProject[key] || 0) > 0;
  const remaining = new Map(projectsOut.map((p) => [p.key, p.gap]));
  const byGap = [...projectsOut].sort((a, b) => b.gap - a.gap);

  for (const familiarOnly of [true, false]) {
    for (const proj of byGap) {
      const candidates = [...pool.entries()]
        .filter(([name, spare]) => spare > 0 && (!familiarOnly || knows(name, proj.key)))
        .sort((a, b) => b[1] - a[1]);
      for (const [name, spare] of candidates) {
        const need = remaining.get(proj.key);
        if (need <= 0.05) break;
        const take = Math.min(spare, need);
        const existing = proj.suggestions.find((x) => x.name === name);
        if (existing) existing.amount = round1(existing.amount + take);
        else proj.suggestions.push({ name, amount: round1(take), knowsProject: knows(name, proj.key) });
        pool.set(name, spare - take);
        remaining.set(proj.key, need - take);
      }
    }
  }
  for (const proj of projectsOut) {
    proj.uncovered = round1(Math.max(0, remaining.get(proj.key)));
    proj.extraPeopleNeeded = round1(proj.uncovered / typicalCapacity);
  }

  return {
    unit,
    horizonWeeks: s.horizonWeeks,
    typicalCapacity: round1(typicalCapacity),
    people: peopleOut.sort((a, b) => b.load - a.load),
    projects: projectsOut,
    totals: {
      demand: round1(sum(projectsOut.map((p) => p.demand))),
      deliverable: round1(sum(projectsOut.map((p) => p.deliverable))),
      overloaded: peopleOut.filter((p) => p.load > 1.05).length,
      extraPeopleNeeded: round1(sum(projectsOut.map((p) => p.extraPeopleNeeded))),
    },
  };
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
