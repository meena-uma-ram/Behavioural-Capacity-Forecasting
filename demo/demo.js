// Kept out of demo.html because extension pages forbid inline scripts.
import { renderPanel } from '../src/ui/panel.js';
import { DEFAULT_SETTINGS } from '../src/engine/forecast.js';
import { sampleHistory, sampleMembers, samplePlannedPoints } from './sample-data.js';

renderPanel(document.getElementById('panel'), {
  sprintName: 'Sprint 39 (future) — sample data',
  history: sampleHistory,
  plannedPoints: samplePlannedPoints,
  members: structuredClone(sampleMembers),
  settings: DEFAULT_SETTINGS,
});
