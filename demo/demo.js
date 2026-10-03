// Kept out of demo.html because extension pages forbid inline scripts.
import { renderPanel } from '../src/ui/panel.js';
import { renderPortfolio } from '../src/ui/portfolio.js';
import { renderTabs } from '../src/ui/tabs.js';
import { DEFAULT_SETTINGS } from '../src/engine/forecast.js';
import { sampleHistory, sampleMembers, samplePlannedPoints } from './sample-data.js';
import { sampleCompleted, sampleOpen, sampleProjects } from './sample-portfolio.js';

const panel = document.getElementById('panel');
const initial = new URLSearchParams(location.search).get('tab') || 'sprint';

renderTabs(panel, [
  {
    id: 'sprint',
    label: 'This sprint',
    render: (el) => renderPanel(el, {
      sprintName: 'Sprint 39 (future) — sample data',
      history: sampleHistory,
      plannedPoints: samplePlannedPoints,
      members: structuredClone(sampleMembers),
      settings: DEFAULT_SETTINGS,
    }),
  },
  {
    id: 'projects',
    label: 'Projects',
    render: (el) => renderPortfolio(el, {
      allProjects: sampleProjects,
      prefs: { selected: sampleProjects.map((p) => p.key), horizonWeeks: 6 },
      // Sample data is a fixed 6-week snapshot, so the horizon only rescales capacity here.
      loadData: async () => ({ completed: sampleCompleted, open: sampleOpen }),
    }),
  },
], { initial });
