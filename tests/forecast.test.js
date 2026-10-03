import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contextSwitchYield,
  forecastSprint,
  memberCapacityFactor,
  summariseHistory,
  teamCapacityFactor,
} from '../src/engine/forecast.js';
import { sampleHistory, sampleMembers, samplePlannedPoints } from '../demo/sample-data.js';

test('a typical member has capacity 1', () => {
  assert.equal(memberCapacityFactor({ name: 'x' }), 1);
  assert.equal(teamCapacityFactor([]), 1);
});

test('days off reduce capacity proportionally', () => {
  assert.ok(Math.abs(memberCapacityFactor({ daysOff: 5 }) - 0.5) < 1e-9);
  assert.equal(memberCapacityFactor({ daysOff: 10 }), 0);
  assert.equal(memberCapacityFactor({ daysOff: 99 }), 0);
});

test('extra meetings and projects reduce capacity', () => {
  const meetings = memberCapacityFactor({ meetingHoursPerWeek: 16 });
  assert.ok(meetings < 1 && meetings > 0.6, `got ${meetings}`);
  assert.equal(memberCapacityFactor({ projects: 3 }), 0.6);
  assert.equal(contextSwitchYield(10), 0.32);
});

test('new joiners ramp at half capacity', () => {
  assert.equal(memberCapacityFactor({ ramp: 'newJoiner' }), 0.5);
});

test('history summary separates planned and unplanned work', () => {
  const s = summariseHistory([{ committed: 40, completed: 40, completedAdded: 10 }]);
  assert.equal(s.meanUnplannedShare, 0.25);
  assert.equal(s.meanPlanReliability, 0.75);
});

test('refuses to forecast with too little history', () => {
  const f = forecastSprint({ history: sampleHistory.slice(0, 2) });
  assert.equal(f.ok, false);
});

test('forecast range is ordered and deterministic', () => {
  const args = { history: sampleHistory, members: sampleMembers, plannedPoints: samplePlannedPoints };
  const a = forecastSprint(args);
  const b = forecastSprint(args);
  assert.ok(a.ok);
  assert.ok(a.confident80 <= a.likely && a.likely <= a.stretch);
  assert.deepEqual(a, b);
});

test('reduced capacity lowers the forecast and flags risks', () => {
  const full = forecastSprint({ history: sampleHistory, plannedPoints: samplePlannedPoints });
  const reduced = forecastSprint({ history: sampleHistory, members: sampleMembers, plannedPoints: samplePlannedPoints });
  assert.ok(reduced.likely < full.likely);
  assert.ok(reduced.planProbability < full.planProbability);
  assert.ok(reduced.risks.some((r) => r.text.includes('Dana Novak')));
});
