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

// --- cross-project (portfolio) data ---

/** The project a board belongs to, used as the default selection. */
export async function getBoardProjectKey(boardId) {
  const board = await getJson(`/rest/agile/1.0/board/${boardId}`);
  return board.location?.projectKey || null;
}

/** All projects the user can see, sorted by name. */
export async function listProjects() {
  const projects = await getAllPages('/rest/api/3/project/search');
  return projects.map((p) => ({ key: p.key, name: p.name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Run a JQL search with the enhanced search API, following page tokens. */
async function searchJql(jql, fields, limit = 2000) {
  const out = [];
  let token = null;
  do {
    const params = new URLSearchParams({ jql, fields: fields.join(','), maxResults: '100' });
    if (token) params.set('nextPageToken', token);
    const page = await getJson(`/rest/api/3/search/jql?${params}`);
    out.push(...(page.issues || []));
    token = page.isLast ? null : page.nextPageToken;
  } while (token && out.length < limit);
  return out;
}

const quoteKeys = (keys) => keys.map((k) => `"${k.replace(/"/g, '')}"`).join(',');

export function portfolioJql(projectKeys, { historyWeeks, horizonWeeks }) {
  const scope = `project in (${quoteKeys(projectKeys)}) AND issuetype not in subTaskIssueTypes()`;
  return {
    completed: `${scope} AND statusCategory = Done AND resolved >= -${historyWeeks}w AND assignee is not EMPTY`,
    // Upcoming work: anything in a current or future sprint, already started, or due within the horizon.
    open:
      `${scope} AND statusCategory != Done AND (sprint in openSprints() OR sprint in futureSprints() ` +
      `OR statusCategory = "In Progress" OR duedate <= ${horizonWeeks}w) ORDER BY duedate ASC, Rank ASC`,
  };
}

/** Convert a Jira issue into the portfolio engine's shape. */
export function issueToTask(issue, estimationField) {
  const f = issue.fields || {};
  const raw = estimationField ? f[estimationField] : null;
  return {
    key: issue.key,
    summary: f.summary || '',
    project: f.project?.key,
    assignee: f.assignee?.displayName || null,
    points: raw == null || raw === '' ? null : Number(raw),
    status: f.status?.name || '',
    due: f.duedate || null,
  };
}

export async function getPortfolioData(projectKeys, estimationField, settings) {
  const jql = portfolioJql(projectKeys, settings);
  const fields = ['summary', 'project', 'assignee', 'status', 'duedate', estimationField].filter(Boolean);
  const [completed, open] = await Promise.all([searchJql(jql.completed, fields), searchJql(jql.open, fields)]);
  return {
    completed: completed.map((i) => issueToTask(i, estimationField)),
    open: open.map((i) => issueToTask(i, estimationField)),
  };
}
