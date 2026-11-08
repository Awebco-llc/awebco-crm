type TaskSummary = { deadline?: string; status?: string };

const completedStatuses = new Set(['done', 'complete', 'completed', 'needs invoiced', 'invoiced', 'closed', 'completed / launched', 'launched', 's14: launched', 'running', 'live']);

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function mobileDateValue(value: string) {
  if (!value) return '';
  // Deadlines represent calendar days; an ISO timestamp must not shift that day.
  const isoDay = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value)?.[1];
  const date = new Date(isoDay ? `${isoDay}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return '';
  const key = localDateKey(date);
  return isoDay && key !== isoDay ? '' : key;
}

export function isTaskOverdue(task: TaskSummary, today: Date) {
  if (completedStatuses.has((task.status || '').trim().toLowerCase())) return false;
  const deadline = mobileDateValue(task.deadline || '');
  return !!deadline && deadline < localDateKey(today);
}

/** Chooses a starting screen only. The existing support API still enforces access. */
export function mobileStartsWithClientReplies(row: Record<string, unknown>) {
  return row.workspace === 'Support Tickets' && !row.parentId &&
    (row.supportVisibility === 'client' || (row.supportVisibility !== 'internal' && row.isManual === false));
}
