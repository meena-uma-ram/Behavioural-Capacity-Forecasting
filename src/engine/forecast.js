// Behavioural capacity forecasting engine.
// Pure functions only: no DOM, no chrome.* APIs, so it runs in the browser and in Node tests.

export const MIN_HISTORY = 3;

// Share of time left for real work when split across N concurrent projects
// (Weinberg, "Quality Software Management"). Index = number of projects.
const CONTEXT_SWITCH_YIELD = [1, 1, 0.8, 0.6, 0.45, 0.32];

export const RAMP_FACTORS = {
  none: 1,
  returning: 0.8, // first sprint back from 1+ week of leave
  newJoiner: 0.5, // first sprint on the team
};

export const DEFAULT_SETTINGS = {
  sprintDays: 10,
  hoursPerDay: 8,
  typicalMeetingHoursPerWeek: 6,
  typicalProjects: 1,
  iterations: 10000,
  historyCount: 8,
};

/** Fraction of time left for focused work when split across `projects` projects. */
export function contextSwitchYield(projects) {
  const n = Math.max(1, Math.round(projects || 1));
  return n < CONTEXT_SWITCH_YIELD.length ? CONTEXT_SWITCH_YIELD[n] : CONTEXT_SWITCH_YIELD.at(-1);
}

/**
 * Capacity of one person next sprint relative to a "typical" sprint (1 = typical).
 * member: { name, daysOff, meetingHoursPerWeek, projects, ramp }
 */
export function memberCapacityFactor(member, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const weeks = s.sprintDays / 5;

  const focusHours = (days, meetingsPerWeek) =>
    Math.max(0, days * s.hoursPerDay - (meetingsPerWeek * weeks * days) / s.sprintDays);

  const baseline =
    focusHours(s.sprintDays, s.typicalMeetingHoursPerWeek) * contextSwitchYield(s.typicalProjects);
  if (baseline <= 0) return 0;

  const days = clamp(s.sprintDays - (member.daysOff || 0), 0, s.sprintDays);
  const meetings = member.meetingHoursPerWeek ?? s.typicalMeetingHoursPerWeek;
  const projects = member.projects ?? s.typicalProjects;
  const ramp = RAMP_FACTORS[member.ramp] ?? 1;

  return (focusHours(days, meetings) * contextSwitchYield(projects) * ramp) / baseline;
}

/** Team capacity relative to a typical sprint. Assumes members contribute equally. */
export function teamCapacityFactor(members, settings = DEFAULT_SETTINGS) {
  if (!members || members.length === 0) return 1;
  const total = members.reduce((sum, m) => sum + memberCapacityFactor(m, settings), 0);
  return total / members.length;
}

/**
 * Summarise past sprints.
 * sprint: { name, committed, completed, completedAdded }
 *   committed      points in the sprint at start
 *   completed      all points completed (planned + added mid-sprint)
 *   completedAdded points completed that were added after the sprint started (unplanned work)
 */
export function summariseHistory(sprints) {
  const valid = sprints.filter((s) => s.completed >= 0 && s.committed >= 0);
  const throughput = valid.map((s) => s.completed);
  const unplannedShare = valid.map((s) => (s.completed > 0 ? s.completedAdded / s.completed : 0));
  const planReliability = valid
    .filter((s) => s.committed > 0)
    .map((s) => (s.completed - s.completedAdded) / s.committed);

  return {
    sprintCount: valid.length,
    throughput,
    unplannedShare,
    meanThroughput: mean(throughput),
    meanUnplannedShare: mean(unplannedShare),
    meanPlanReliability: mean(planReliability),
    meanCommitted: mean(valid.map((s) => s.committed)),
  };
}

/**
 * Monte Carlo forecast of how many *planned* points the team can deliver next sprint.
 * Each iteration resamples a historical sprint's throughput and, independently,
 * a historical unplanned-work share, then scales by next sprint's capacity factor.
 */
export function forecastSprint({ history, members = [], plannedPoints = null, settings = {}, seed = 42 }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const summary = summariseHistory(history);
  const warnings = [];

  if (summary.sprintCount < MIN_HISTORY) {
    return {
      ok: false,
      summary,
      warnings: [`Need at least ${MIN_HISTORY} closed sprints with estimates (found ${summary.sprintCount}).`],
    };
  }

  const capacityFactor = teamCapacityFactor(members, s);
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  const samples = new Float64Array(s.iterations);
  for (let i = 0; i < s.iterations; i++) {
    samples[i] = pick(summary.throughput) * (1 - pick(summary.unplannedShare)) * capacityFactor;
  }
  samples.sort();

  // "At least X with 80% confidence" = 20th percentile.
  const p = (q) => round1(percentile(samples, q));
  const result = {
    ok: true,
    summary,
    capacityFactor,
    likely: p(0.5),
    confident80: p(0.2),
    stretch: p(0.8),
    expectedUnplannedPoints: round1(summary.meanThroughput * summary.meanUnplannedShare * capacityFactor),
    planProbability: null,
    risks: [],
    warnings,
  };

  if (plannedPoints != null && plannedPoints > 0) {
    let hits = 0;
    for (const v of samples) if (v >= plannedPoints) hits++;
    result.planProbability = hits / samples.length;
  }

  result.risks = describeRisks(result, members, plannedPoints, s);
  if (summary.sprintCount < 6) warnings.push(`Only ${summary.sprintCount} sprints of history: ranges will be wide.`);
  return result;
}

function describeRisks(result, members, plannedPoints, settings) {
  const risks = [];
  if (plannedPoints != null && plannedPoints > result.likely) {
    risks.push({
      level: plannedPoints > result.stretch ? 'high' : 'medium',
      text: `Plan of ${plannedPoints} pts is above the likely outcome (${result.likely} pts).`,
    });
  }
  if (result.summary.meanUnplannedShare >= 0.2) {
    risks.push({
      level: 'medium',
      text: `On average ${pct(result.summary.meanUnplannedShare)} of delivered work was added mid-sprint. Expect about ${result.expectedUnplannedPoints} pts of unplanned work.`,
    });
  }
  if (result.summary.meanPlanReliability > 0 && result.summary.meanPlanReliability < 0.75) {
    risks.push({
      level: 'medium',
      text: `Historically the team finishes ${pct(result.summary.meanPlanReliability)} of what it commits to.`,
    });
  }
  for (const m of members) {
    const f = memberCapacityFactor(m, settings);
    if (f < 0.7) risks.push({ level: f < 0.4 ? 'high' : 'medium', text: `${m.name || 'A team member'} is at ${pct(f)} of typical capacity (${explainMember(m, settings)}).` });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return risks.sort((a, b) => order[a.level] - order[b.level]);
}

export function explainMember(m, settings = DEFAULT_SETTINGS) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const parts = [];
  if (m.daysOff) parts.push(`${m.daysOff}d off`);
  if ((m.meetingHoursPerWeek ?? s.typicalMeetingHoursPerWeek) > s.typicalMeetingHoursPerWeek) parts.push(`${m.meetingHoursPerWeek}h/wk meetings`);
  if ((m.projects ?? s.typicalProjects) > s.typicalProjects) parts.push(`${m.projects} projects`);
  if (m.ramp === 'newJoiner') parts.push('new joiner');
  if (m.ramp === 'returning') parts.push('returning from leave');
  return parts.join(', ') || 'no adjustments';
}

// --- helpers ---

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = clamp(Math.floor(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

export function pct(v) {
  return `${Math.round(v * 100)}%`;
}

/** Small seeded PRNG so forecasts are stable between page loads and testable. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
