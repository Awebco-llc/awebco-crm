import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mobileDateValue, isTaskOverdue, mobileStartsWithClientReplies } from '../lib/mobileTaskPresentation';
import { shareSupportTicket } from '../lib/supportPolicy';

test('mobile deadline inputs preserve stored calendar dates and reject malformed values', () => {
  assert.equal(mobileDateValue('2026-11-12'), '2026-11-12');
  assert.equal(mobileDateValue('Nov 12, 2026'), '2026-11-12');
  assert.equal(mobileDateValue('2026-11-12T00:00:00Z'), '2026-11-12');
  assert.equal(mobileDateValue('2026-02-30'), '');
  assert.equal(mobileDateValue('not a date'), '');
  assert.equal(mobileDateValue(''), '');
});

test('overdue indicators distinguish yesterday, today and future dates', () => {
  const today = new Date(2026, 10, 7, 15);
  assert.equal(isTaskOverdue({ deadline: '2026-11-06', status: 'In Progress' }, today), true);
  assert.equal(isTaskOverdue({ deadline: '2026-11-07' }, today), false);
  assert.equal(isTaskOverdue({ deadline: '2026-11-08' }, today), false);
  assert.equal(isTaskOverdue({ deadline: 'unknown' }, today), false);
});

test('completed, invoiced and running work is not highlighted as overdue', () => {
  for (const status of ['Done', 'Closed', 'Completed', 'Needs Invoiced', 'Running', 'LIVE', 'S14: Launched']) {
    assert.equal(isTaskOverdue({ deadline: '2026-11-01', status }, new Date(2026, 10, 7)), false, status);
  }
});

test('mobile starting tabs mirror existing sharing states without changing sharing', () => {
  for (const workspace of ['Support Tickets', 'Websites']) {
    for (const parentId of [undefined, 'parent']) {
      for (const supportVisibility of [undefined, 'client', 'internal']) {
        for (const isManual of [true, false, undefined]) {
          const row = { workspace, parentId, supportVisibility, isManual };
          const before = structuredClone(row);
          assert.equal(mobileStartsWithClientReplies(row), shareSupportTicket(row));
          assert.deepEqual(row, before);
        }
      }
    }
  }
});
