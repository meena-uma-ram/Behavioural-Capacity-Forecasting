import { DEFAULT_SETTINGS } from '../src/engine/forecast.js';
import { PORTFOLIO_DEFAULTS } from '../src/engine/portfolio.js';
import { loadSettings, saveSettings } from '../src/storage.js';

const form = document.getElementById('form');
const fields = ['sprintDays', 'hoursPerDay', 'typicalMeetingHoursPerWeek', 'typicalProjects', 'historyCount', 'historyWeeks'];

const settings = { ...DEFAULT_SETTINGS, ...PORTFOLIO_DEFAULTS, ...(await loadSettings()) };
for (const f of fields) form.elements[f].value = settings[f];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const next = Object.fromEntries(fields.map((f) => [f, Number(form.elements[f].value)]));
  await saveSettings(next);
  document.getElementById('status').textContent = 'Saved';
});
