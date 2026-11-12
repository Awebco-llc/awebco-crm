import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { ticketReference } from './ticketIdentity';

export async function allocateSupportNumber(db: Firestore, tx: Transaction) {
  const counter = db.collection('supportCounters').doc('tickets');
  const saved = await tx.get(counter);
  const previous = saved.data()?.value ?? 0;
  if (!Number.isSafeInteger(previous) || previous < 0 || previous >= 999999999999) throw new Error('Ticket numbering is unavailable.');
  const value = previous + 1;
  tx.set(counter, { value });
  return `AW-${String(value).padStart(6, '0')}`;
}
export async function ensureSupportNumber(db: Firestore, id: string) {
  return db.runTransaction(async tx => {
    const ref = db.collection('tickets').doc(id), saved = await tx.get(ref), ticket = saved.data();
    if (!ticket || ticket.workspace !== 'Support Tickets' || ticket.parentId) return ticket;
    if (ticketReference(ticket.ticketNumber)) return ticket;
    const ticketNumber = await allocateSupportNumber(db, tx);
    tx.update(ref, { ticketNumber });
    return { ...ticket, ticketNumber };
  });
}
