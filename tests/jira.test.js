import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardIdFromUrl, sprintFromReport } from '../src/jira/client.js';

test('finds board id in next-gen and classic URLs', () => {
  assert.equal(boardIdFromUrl('https://acme.atlassian.net/jira/software/projects/APP/boards/12/backlog'), 12);
  assert.equal(boardIdFromUrl('https://acme.atlassian.net/secure/RapidBoard.jspa?rapidView=7'), 7);
  assert.equal(boardIdFromUrl('https://acme.atlassian.net/browse/APP-1'), null);
});

const est = (v) => ({ statFieldValue: { value: v } });

test('converts a sprint report into committed, completed and unplanned points', () => {
  const report = {
    sprint: { name: 'Sprint 5' },
    contents: {
      completedIssues: [
        { key: 'A-1', estimateStatistic: est(5), currentEstimateStatistic: est(5) },
        { key: 'A-2', estimateStatistic: est(3), currentEstimateStatistic: est(3) },
      ],
      issuesNotCompletedInCurrentSprint: [{ key: 'A-3', estimateStatistic: est(8), currentEstimateStatistic: est(8) }],
      puntedIssues: [{ key: 'A-4', estimateStatistic: est(2), currentEstimateStatistic: est(2) }],
      issueKeysAddedDuringSprint: { 'A-2': true },
    },
  };
  assert.deepEqual(sprintFromReport(report), { name: 'Sprint 5', committed: 15, completed: 8, completedAdded: 3 });
});
