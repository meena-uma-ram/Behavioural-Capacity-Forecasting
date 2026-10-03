// Adds a "Capacity forecast" button to Jira board and backlog pages.

import { DEFAULT_SETTINGS } from '../engine/forecast.js';
import { boardIdFromUrl, getEstimationField, getPlannedSprint, getSprintHistory } from '../jira/client.js';
import { renderPanel } from '../ui/panel.js';
import { loadSettings, loadMembers, saveMembers } from '../storage.js';

let ui = null;

function mount() {
  const host = document.createElement('div');
  host.id = 'bcf-host';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = chrome.runtime.getURL('src/ui/panel.css');

  const toggle = document.createElement('button');
  toggle.className = 'bcf-toggle';
  toggle.textContent = 'Capacity forecast';

  const panel = document.createElement('div');
  panel.className = 'bcf-panel';
  panel.hidden = true;

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) load(panel);
  });

  shadow.append(style, toggle, panel);
  document.body.append(host);
  return { host, panel };
}

async function load(panel) {
  const boardId = boardIdFromUrl(location.href);
  if (!boardId) return;
  panel.textContent = 'Reading sprint history…';

  try {
    const settings = { ...DEFAULT_SETTINGS, ...(await loadSettings()) };
    const field = await getEstimationField(boardId);
    const [history, planned] = await Promise.all([
      getSprintHistory(boardId, settings.historyCount),
      getPlannedSprint(boardId, field),
    ]);

    // Adjustments are saved per sprint, so last sprint's leave doesn't carry over.
    const saved = planned ? await loadMembers(boardId, planned.id) : [];
    const members = (planned?.assignees || []).map((name) => saved.find((m) => m.name === name) || { name });

    renderPanel(panel, {
      sprintName: planned ? `${planned.name} (${planned.state})` : 'No active or future sprint',
      history,
      plannedPoints: planned?.points ?? null,
      members,
      settings,
      onMembersChange: (m) => planned && saveMembers(boardId, planned.id, m),
    });
  } catch (err) {
    panel.textContent = `Could not read this board: ${err.message}`;
  }
}

// Jira is a single-page app, so watch for navigation instead of relying on page loads.
function sync() {
  const onBoard = boardIdFromUrl(location.href) != null;
  if (onBoard && !ui) ui = mount();
  if (!onBoard && ui) {
    ui.host.remove();
    ui = null;
  }
}

let lastUrl = '';
setInterval(() => {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  if (ui) ui.panel.hidden = true;
  sync();
}, 1000);
sync();
