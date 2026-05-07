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

import type { Contact, Company, TeamMember, ProductService, Proposal, Deal, ContactGroup, StorageFile } from '@/components/Shared';
import { getDb, getFirebaseConfig } from '@/lib/firebase';
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import { deleteDoc } from 'firebase/firestore';
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
  const q = query(collection(getDb(), 'contactGroups'), orderBy('name'));
  return onSnapshot(q, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContactGroupDoc) })));
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
