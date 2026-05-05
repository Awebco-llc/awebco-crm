import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import type { Contact, Company, TeamMember } from '@/components/Shared';
import { db } from '@/lib/firebase';

type Unsubscribe = () => void;

export function subscribeUsers(onChange: (users: TeamMember[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, 'users'), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as TeamMember) })));
    },
    (e) => onError?.(e),
  );
}

type CompanyDoc = Omit<Company, 'id'> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

type ContactDoc = Omit<Contact, 'id'> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

export function subscribeCompanies(onChange: (companies: Company[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, 'companies'), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as CompanyDoc) })));
    },
    (e) => onError?.(e),
  );
}

export function subscribeContacts(onChange: (contacts: Contact[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(db, 'contacts'), orderBy('lastName'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContactDoc) })));
    },
    (e) => onError?.(e),
  );
}

export async function createCompany(input: Omit<Company, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'companies'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies CompanyDoc);
  return ref.id;
}

export async function updateCompany(id: string, patch: Partial<Omit<Company, 'id'>>): Promise<void> {
  await setDoc(
    doc(db, 'companies', id),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    } satisfies Partial<CompanyDoc>,
    { merge: true },
  );
}

export async function createContact(input: Omit<Contact, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'contacts'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies ContactDoc);
  return ref.id;
}

export async function updateContact(id: string, patch: Partial<Omit<Contact, 'id'>>): Promise<void> {
  await setDoc(
    doc(db, 'contacts', id),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    } satisfies Partial<ContactDoc>,
    { merge: true },
  );
}

