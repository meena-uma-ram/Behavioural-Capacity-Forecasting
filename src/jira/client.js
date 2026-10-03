// Reads sprint history from Jira Cloud using the signed-in user's session.
// Runs inside the content script on *.atlassian.net, so requests are same-origin
// and no API token is needed. Nothing is sent anywhere else.

/** Board id from a Jira board/backlog URL, or null. */
export function boardIdFromUrl(href) {
  const url = new URL(href);
  const path = url.pathname.match(/\/boards\/(\d+)/);
  if (path) return Number(path[1]);
  const rapid = url.searchParams.get('rapidView');
  return rapid ? Number(rapid) : null;
}

async function getJson(path) {
  const res = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Jira request failed (${res.status}) for ${path}`);
  return res.json();
}

async function getAllPages(path, key = 'values') {
  const out = [];
  let startAt = 0;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await getJson(`${path}${sep}startAt=${startAt}&maxResults=50`);
    const items = page[key] || [];
    out.push(...items);
    if (page.isLast || items.length === 0 || (page.total != null && out.length >= page.total)) break;
    startAt += items.length;
  }
  return out;
}

/** The custom field the board uses for estimates (e.g. story points). */
export async function getEstimationField(boardId) {
  const config = await getJson(`/rest/agile/1.0/board/${boardId}/configuration`);
  return config.estimation?.field?.fieldId || null;
}

/**
 * Convert a Jira sprint report (greenhopper API, used by Jira's own Sprint Report page)
 * into the engine's sprint shape.
 */
export function sprintFromReport(report) {
  const c = report.contents || {};
  const added = new Set(Object.keys(c.issueKeysAddedDuringSprint || {}));
  const initial = (i) => i.estimateStatistic?.statFieldValue?.value || 0;
  const current = (i) => i.currentEstimateStatistic?.statFieldValue?.value ?? initial(i);

  const completedIssues = c.completedIssues || [];
  const allIssues = [...completedIssues, ...(c.issuesNotCompletedInCurrentSprint || []), ...(c.puntedIssues || [])];

  const committed = allIssues.filter((i) => !added.has(i.key)).reduce((sum, i) => sum + initial(i), 0);
  const completed = completedIssues.reduce((sum, i) => sum + current(i), 0);
  const completedAdded = completedIssues.filter((i) => added.has(i.key)).reduce((sum, i) => sum + current(i), 0);

  return { name: report.sprint?.name || '', committed, completed, completedAdded };
}

/** Last `count` closed sprints of a board, oldest first, in engine shape. */
export async function getSprintHistory(boardId, count = 8) {
  const closed = await getAllPages(`/rest/agile/1.0/board/${boardId}/sprint?state=closed`);
  const recent = closed
    .filter((s) => s.completeDate || s.endDate)
    .sort((a, b) => new Date(a.completeDate || a.endDate) - new Date(b.completeDate || b.endDate))
    .slice(-count);

  const reports = await Promise.all(
    recent.map((s) => getJson(`/rest/greenhopper/1.0/rapid/charts/sprintreport?rapidViewId=${boardId}&sprintId=${s.id}`)),
  );
  return reports.map(sprintFromReport);
}

/** The sprint being planned: the active sprint if there is one, else the next future sprint. */
export async function getPlannedSprint(boardId, estimationField) {
  const sprints = await getAllPages(`/rest/agile/1.0/board/${boardId}/sprint?state=active,future`);
  const sprint = sprints.find((s) => s.state === 'active') || sprints.find((s) => s.state === 'future');
  if (!sprint) return null;

  const fields = ['assignee', estimationField].filter(Boolean).join(',');
  const issues = await getAllPages(`/rest/agile/1.0/sprint/${sprint.id}/issue?fields=${fields}`, 'issues');

  const assignees = new Map();
  let points = 0;
  for (const issue of issues) {
    points += Number(issue.fields?.[estimationField]) || 0;
    const a = issue.fields?.assignee;
    if (a) assignees.set(a.accountId, a.displayName);
  }
  return { id: sprint.id, name: sprint.name, state: sprint.state, points, assignees: [...assignees.values()].sort() };
}
