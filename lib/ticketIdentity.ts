/** Stable public ticket references; legacy request subjects remain stored unchanged. */
export function ticketReference(value: unknown): string | null {
  return typeof value === 'string' && /^(?:[0-9]{1,12}|AW-\d{6,12})$/.test(value) ? value : null;
}
type TicketIdentity = { ticketNumber?: unknown; projectName?: unknown; supportSource?: unknown; supportEntryId?: unknown; supportPortalClientId?: unknown; isManual?: unknown };
/** The public form's original Gravity Forms reference is authoritative. */
export function legacyTicketReference(ticket: TicketIdentity): string | null {
  if (ticket.supportSource === 'awebco.com' && typeof ticket.supportEntryId === 'string' && /^[0-9]{1,12}$/.test(ticket.supportEntryId)) return ticket.supportEntryId;
  if (ticket.supportPortalClientId || ticket.isManual === true) return null;
  return /^Ticket #([0-9]{1,12})\s*-\s*/i.exec(String(ticket.projectName || ''))?.[1] ?? null;
}
export function referenceForTicket(ticket: TicketIdentity): string | null {
  return legacyTicketReference(ticket) ?? ticketReference(ticket.ticketNumber);
}
export function needsTicketReference(ticket: TicketIdentity): boolean {
  const reference = referenceForTicket(ticket);
  return !reference || reference !== ticket.ticketNumber;
}
export function supportTitle(value: unknown): string {
  return String(value || 'Support request').replace(/^Ticket #\d+\s*-\s*/i, '');
}
export const completedSupportStatus = (status: unknown) => ['Needs Invoiced', 'Done', 'Closed'].includes(String(status));
export function ticketCompletionPatch(current: Record<string, unknown>, status: unknown, at: unknown): Record<string, unknown> {
  if (current.workspace !== 'Support Tickets' || current.parentId || status === undefined || status === current.status) return {};
  if (!completedSupportStatus(status) || current.completedAt) return {};
  // Invoice/closed transitions within the completed state keep the actual finish time.
  if (completedSupportStatus(current.status)) return {};
  return { completedAt: at };
}
