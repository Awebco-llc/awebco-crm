import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { shareSupportTicket, supportStatus } from './supportPolicy';

export const closureMessageId = 'ticket-closed';

// One durable completion event per ticket, shared by browser and MCP edits.
// Existing completed tickets are never enrolled retroactively by invoice changes.
export function recordSupportCompletion(
  tx: Transaction,
  ref: DocumentReference,
  ticket: Record<string, unknown>,
  status: string,
  actor: { name: string; email: string },
  at = new Date().toISOString(),
) {
  if (ticket.workspace !== 'Support Tickets' || ticket.parentId) return {};
  const completed = supportStatus(status) === 'Completed';
  const wasCompleted = supportStatus(ticket.status) === 'Completed';
  if (!completed || wasCompleted || ticket.completedAt) return {};
  if (shareSupportTicket(ticket)) {
    tx.create(ref.collection('messages').doc(closureMessageId), {
      visibility: 'client', direction: 'team', kind: 'closed',
      author: actor.name, sender_email: actor.email,
      text: 'Your support ticket is complete. Thank you for working with Awebco.',
      created_at: at, attachments: [], email_status: 'pending',
    });
  }
  return { completedAt: at };
}
