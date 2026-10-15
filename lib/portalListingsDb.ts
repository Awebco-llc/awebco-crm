import { getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirestoreAdmin } from '@/lib/firebaseAdmin';

export function getPortalListingsFirestore() {
  const databaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID;
  if (!databaseId) throw new Error('CRM Firestore database is not configured.');
  getFirestoreAdmin();
  return getFirestore(getApp(), databaseId);
}
