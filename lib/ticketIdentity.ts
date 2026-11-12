/** Stable public ticket references; legacy request subjects remain stored unchanged. */
export function ticketReference(value: unknown): string | null {
  return typeof value === 'string' && /^AW-\d{6,12}$/.test(value) ? value : null;
}
export function supportTitle(value: unknown): string {
  return String(value || 'Support request').replace(/^Ticket #\d+\s*-\s*/i, '');
}
export const completedSupportStatus = (status: unknown) => ['Needs Invoiced', 'Done', 'Closed'].includes(String(status));
export function ticketCompletionPatch(current: Record<string, unknown>, status: unknown, at: unknown): Record<string, unknown> {
  if (current.workspace !== 'Support Tickets' || current.parentId || status === undefined || status === current.status) return {};
  if (!completedSupportStatus(status)) return { completedAt: null };
  // Invoice/closed transitions within the completed state keep the actual finish time.
  if (completedSupportStatus(current.status)) return {};
  return { completedAt: at };
}
