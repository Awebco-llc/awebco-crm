import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import type { Contact, Company, TeamMember, ProductService, Proposal, Deal, ContactGroup, StorageFile, Ticket } from '@/components/Shared';
import { getDb, getFirebaseConfig } from '@/lib/firebase';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { deleteDoc, where } from 'firebase/firestore';
type Unsubscribe = () => void;

export function subscribeUsers(onChange: (users: TeamMember[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const db = getDb();
  const q = query(collection(db, 'users'), orderBy('name'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((d) => {
          const data = d.data() as Omit<TeamMember, 'id'>;
          return { ...data, id: d.id };
        }),
      );
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
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  const ref = await addDoc(collection(db, 'companies'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies CompanyDoc);
  return ref.id;
}

export async function updateCompany(id: string, patch: Partial<Omit<Company, 'id'>>): Promise<void> {
  const db = getDb();
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
  const db = getDb();
  const ref = await addDoc(collection(db, 'contacts'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies ContactDoc);
  return ref.id;
}

export async function updateContact(id: string, patch: Partial<Omit<Contact, 'id'>>): Promise<void> {
  const db = getDb();
  await setDoc(
    doc(db, 'contacts', id),
    {
      ...patch,
      updatedAt: serverTimestamp(),
    } satisfies Partial<ContactDoc>,
    { merge: true },
  );
}

// Products
type ProductDoc = Omit<ProductService, 'id'> & { createdAt?: unknown; updatedAt?: unknown; };

export function subscribeProducts(onChange: (products: ProductService[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(getDb(), 'products'), orderBy('name'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ProductDoc) })));
  }, (e) => onError?.(e));
}

export async function createProduct(input: Omit<ProductService, 'id'>): Promise<string> {
  const ref = await addDoc(collection(getDb(), 'products'), {
    ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  } satisfies ProductDoc);
  return ref.id;
}

export async function updateProduct(id: string, patch: Partial<Omit<ProductService, 'id'>>): Promise<void> {
  await setDoc(doc(getDb(), 'products', id), { ...patch, updatedAt: serverTimestamp() } satisfies Partial<ProductDoc>, { merge: true });
}

export async function deleteProduct(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'products', id));
}

// Proposals
type ProposalDoc = Omit<Proposal, 'id'> & { createdAt?: unknown; updatedAt?: unknown; };

export function subscribeProposals(onChange: (proposals: Proposal[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(getDb(), 'proposals'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ProposalDoc) })));
  }, (e) => onError?.(e));
}

export async function createProposal(input: Omit<Proposal, 'id'>): Promise<string> {
  const ref = await addDoc(collection(getDb(), 'proposals'), {
    ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  } satisfies ProposalDoc);
  return ref.id;
}

export async function updateProposal(id: string, patch: Partial<Omit<Proposal, 'id'>>): Promise<void> {
  await setDoc(doc(getDb(), 'proposals', id), { ...patch, updatedAt: serverTimestamp() } satisfies Partial<ProposalDoc>, { merge: true });
}

export async function deleteProposal(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'proposals', id));
}

// Deals
type DealDoc = Omit<Deal, 'id'> & { createdAt?: unknown; updatedAt?: unknown; };

export function subscribeDeals(onChange: (deals: Deal[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(getDb(), 'deals'), orderBy('name'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DealDoc) })));
  }, (e) => onError?.(e));
}

export async function createDeal(input: Omit<Deal, 'id'>): Promise<string> {
  const ref = await addDoc(collection(getDb(), 'deals'), {
    ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  } satisfies DealDoc);
  return ref.id;
}

export async function updateDeal(id: string, patch: Partial<Omit<Deal, 'id'>>): Promise<void> {
  await setDoc(doc(getDb(), 'deals', id), { ...patch, updatedAt: serverTimestamp() } satisfies Partial<DealDoc>, { merge: true });
}

export async function deleteDeal(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'deals', id));
}

// ContactGroups
type ContactGroupDoc = Omit<ContactGroup, 'id'> & { createdAt?: unknown; updatedAt?: unknown; };

export function subscribeContactGroups(onChange: (groups: ContactGroup[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(collection(getDb(), 'contactGroups'));
  return onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContactGroupDoc) }));
    groups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    onChange(groups);
  }, (e) => onError?.(e));
}

export async function createContactGroup(input: Omit<ContactGroup, 'id'>): Promise<string> {
  const ref = await addDoc(collection(getDb(), 'contactGroups'), {
    ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  } satisfies ContactGroupDoc);
  return ref.id;
}

export async function updateContactGroup(id: string, patch: Partial<Omit<ContactGroup, 'id'>>): Promise<void> {
  await setDoc(doc(getDb(), 'contactGroups', id), { ...patch, updatedAt: serverTimestamp() } satisfies Partial<ContactGroupDoc>, { merge: true });
}

export async function deleteContactGroup(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'contactGroups', id));
}

export async function createTeamMember(input: TeamMember): Promise<string> {
  const db = getDb();

  const apps = getApps();
  let secondaryApp = apps.find(app => app.name === 'SecondaryApp');
  if (!secondaryApp) {
    secondaryApp = initializeApp(getFirebaseConfig(), 'SecondaryApp');
  }
  const secondaryAuth = getAuth(secondaryApp);

  if (!input.email || !input.password) {
    throw new Error('Email and password are required to create a team member.');
  }

  const userCredential = await createUserWithEmailAndPassword(secondaryAuth, input.email, input.password);
  await signOut(secondaryAuth);

  const { id, ...dataWithoutId } = input;
  const uid = userCredential.user.uid;
  const ref = doc(db, 'users', uid);

  const cleanData = Object.fromEntries(Object.entries(dataWithoutId).filter(([_, v]) => v !== undefined));

  await setDoc(ref, {
    ...cleanData,
    authUid: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return uid;
}

export async function updateTeamMember(id: string, patch: Partial<Omit<TeamMember, 'id'>>): Promise<void> {
  const db = getDb();
  const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([_, v]) => v !== undefined));

  await setDoc(
    doc(db, 'users', id),
    {
      ...cleanPatch,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function deleteContact(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'contacts', id));
}

export async function deleteCompany(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'companies', id));
}

export async function deleteTeamMember(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, 'users', id));
}

type StorageFileDoc = Omit<StorageFile, 'id'> & { createdAt?: unknown; updatedAt?: unknown; };

export function subscribeFiles(onChange: (files: StorageFile[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const db = getDb();
  const q = query(collection(db, 'files'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as StorageFileDoc) })));
    },
    (e) => onError?.(e),
  );
}

export async function saveFileMetadata(input: Omit<StorageFile, 'id'>): Promise<string> {
  const db = getDb();
  const ref = await addDoc(collection(db, 'files'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } satisfies StorageFileDoc);
  return ref.id;
}

export async function deleteFileMetadata(id: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, 'files', id));
}

// Tickets
type TicketDoc = Omit<Ticket, 'id' | 'createdAt' | 'updatedAt'> & { createdAt?: unknown; updatedAt?: unknown; };

export function subscribeTickets(workspace: string, onChange: (tickets: Ticket[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(
    collection(getDb(), 'tickets'),
    where('workspace', '==', workspace),
    orderBy('order', 'asc')
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      } as Ticket;
    }));
  }, (e) => onError?.(e));
}

export function subscribeAllTickets(onChange: (tickets: Ticket[]) => void, onError?: (e: unknown) => void): Unsubscribe {
  const q = query(
    collection(getDb(), 'tickets')
  );
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt,
      } as Ticket;
    }));
  }, (e) => onError?.(e));
}

export async function createTicket(input: Omit<Ticket, 'id'>): Promise<string> {
  const cleanInput = Object.fromEntries(
    Object.entries(input).filter(([_, v]) => v !== undefined)
  );
  const ref = await addDoc(collection(getDb(), 'tickets'), {
    ...cleanInput, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTicket(id: string, patch: Partial<Omit<Ticket, 'id'>>): Promise<void> {
  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([_, v]) => v !== undefined)
  );
  await setDoc(doc(getDb(), 'tickets', id), { ...cleanPatch, updatedAt: serverTimestamp() }, { merge: true });
}

export async function deleteTicket(id: string): Promise<void> {
  await deleteDoc(doc(getDb(), 'tickets', id));
}

// Groups
export function subscribeGroups(workspace: string, onUpdate: (groups: any[]) => void, onError?: (err: any) => void) {
  const q = query(
    collection(getDb(), 'groups'),
    where('workspace', '==', workspace)
  );

  return onSnapshot(q, (snapshot) => {
    const groups = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as any[];
    
    // Sort in memory to avoid requiring a composite index
    groups.sort((a, b) => (a.order || 0) - (b.order || 0));
    
    onUpdate(groups);
  }, (err) => onError?.(err));
}

export async function updateGroup(groupId: string, patch: any) {
  const docRef = doc(getDb(), 'groups', groupId);
  await updateDoc(docRef, {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

export async function createGroup(group: any) {
  return await addDoc(collection(getDb(), 'groups'), {
    ...group,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function deleteGroup(groupId: string) {
  await deleteDoc(doc(getDb(), 'groups', groupId));
}

export function subscribeBillableHours(onUpdate: (labels: string[]) => void, onError?: (err: any) => void) {
  const q = query(collection(getDb(), 'billableHoursLabels'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snapshot) => {
    const labels = snapshot.docs.map(doc => doc.data().label as string);
    onUpdate(labels);
  }, (err) => onError?.(err));
}

export async function createBillableHour(label: string) {
  return await addDoc(collection(getDb(), 'billableHoursLabels'), {
    label,
    createdAt: serverTimestamp()
  });
}
