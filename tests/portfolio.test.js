import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastPortfolio } from '../src/engine/portfolio.js';
import { sampleCompleted, sampleOpen, sampleProjects } from '../demo/sample-portfolio.js';

const run = (overrides = {}) =>
  forecastPortfolio({ projects: sampleProjects, completed: sampleCompleted, open: sampleOpen, ...overrides });

test('capacity comes from each person\'s own throughput over the horizon', () => {
  const f = run();
  const aisha = f.people.find((p) => p.name === 'Aisha Khan');
  assert.equal(aisha.capacity, 24); // 48 pts in 12 weeks -> 24 in 6 weeks
  assert.equal(aisha.totalAssigned, 32);
  assert.ok(aisha.load > 1.3);
  assert.equal(f.people[0].name, 'Aisha Khan', 'most loaded person first');
});

test('tasks beyond a person\'s capacity are flagged at risk, lowest priority first', () => {
  const aisha = run().people.find((p) => p.name === 'Aisha Khan');
  assert.deepEqual(aisha.atRisk.map((t) => t.key), ['APP-214', 'PAY-112']);
});

test('people with no recent history get a ramp-up share of typical capacity', () => {
  const f = run();
  const dana = f.people.find((p) => p.name === 'Dana Novak');
  assert.ok(dana.noHistory);
  assert.equal(dana.capacity, f.typicalCapacity * 0.5);
});

test('flags context switching for people on several projects', () => {
  const chen = run().people.find((p) => p.name === 'Chen Wei');
  assert.equal(chen.projectCount, 3);
  assert.ok(Math.abs(chen.switchingLoss - 0.4) < 1e-9);
});

test('short projects get people with spare capacity, familiar people first', () => {
  const f = run();
  const pay = f.projects.find((p) => p.key === 'PAY');
  assert.ok(pay.gap > 30);
  assert.equal(pay.suggestions[0].name, 'Eli Brooks');
  assert.equal(pay.suggestions[0].knowsProject, true);
  assert.ok(pay.extraPeopleNeeded > 0);
  // spare capacity is never handed out twice
  const handedOut = {};
  for (const p of f.projects) for (const s of p.suggestions) handedOut[s.name] = (handedOut[s.name] || 0) + s.amount;
  for (const person of f.people) assert.ok((handedOut[person.name] || 0) <= person.spare + 0.11);
});

test('people are matched to projects they know before anyone else', () => {
  const web = run().projects.find((p) => p.key === 'WEB');
  assert.equal(web.extraPeopleNeeded, 0);
  assert.deepEqual(web.suggestions.map((s) => s.name), ['Farah Said']);
});

test('falls back to counting tasks when nothing is estimated', () => {
  const strip = (arr) => arr.map((i) => ({ ...i, points: null }));
  const f = run({ completed: strip(sampleCompleted), open: strip(sampleOpen) });
  assert.equal(f.unit, 'tasks');
  assert.equal(f.projects.find((p) => p.key === 'PAY').demand, 9);
});

test('only selected projects are counted', () => {
  const f = run({ projects: [sampleProjects[2]] });
  assert.equal(f.projects.length, 1);
  assert.ok(f.people.every((p) => Object.keys(p.assignedByProject).every((k) => k === 'WEB')));
});
