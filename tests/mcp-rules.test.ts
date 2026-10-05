import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let environment: RulesTestEnvironment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run npm run test:mcp:rules; never run against production.');
  environment = await initializeTestEnvironment({ projectId: 'demo-awebco-mcp', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  await environment.withSecurityRulesDisabled(async context => {
    for (const [uid, role] of [['master', 'master_admin'], ['admin', 'admin'], ['staff', 'staff'], ['freelancer', 'freelancer']]) await setDoc(doc(context.firestore(), 'users', uid), { name: uid, role, authUid: uid });
    // The existing master profile has uid instead of authUid. Preserve that shape.
    await setDoc(doc(context.firestore(), 'users/master'), { name: 'master', role: 'master_admin', uid: 'master' });
    await setDoc(doc(context.firestore(), '_mcp/config'), { enabled: true });
    await setDoc(doc(context.firestore(), 'tickets/task'), { workspace: 'SEO', projectName: 'Test' });
  });
});
after(async () => { await environment?.cleanup(); });

test('every browser identity is blocked from MCP keys, budgets and subcollections', async () => {
  for (const context of [environment.unauthenticatedContext(), ...['master', 'admin', 'staff', 'freelancer'].map(uid => environment.authenticatedContext(uid))]) {
    const db = context.firestore();
    await assertFails(getDoc(doc(db, '_mcp/config')));
    await assertFails(setDoc(doc(db, '_mcp/budget'), { requests: 0 }));
    await assertFails(getDocs(collection(db, '_mcp')));
    await assertFails(setDoc(doc(db, '_mcp/audit/events/forged'), { taskId: 'task' }));
  }
});
test('staff cannot escalate roles, change permissions or modify another user', async () => {
  const db = environment.authenticatedContext('staff').firestore();
  await assertFails(updateDoc(doc(db, 'users/staff'), { role: 'master_admin' }));
  await assertFails(updateDoc(doc(db, 'users/staff'), { permissions: { canViewCRM: true } }));
  await assertFails(updateDoc(doc(db, 'users/master'), { name: 'Hijacked' }));
  await assertSucceeds(updateDoc(doc(db, 'users/staff'), { name: 'Updated profile', emailNotificationsEnabled: false }));
  await assertSucceeds(getDocs(collection(db, 'users')));
  await assertSucceeds(getDoc(doc(db, 'tickets/task')));
});
test('master profile management and admin workspace management still work', async () => {
  await assertSucceeds(updateDoc(doc(environment.authenticatedContext('master').firestore(), 'users/staff'), { role: 'freelancer' }));
  const db = environment.authenticatedContext('admin').firestore();
  await assertSucceeds(updateDoc(doc(db, 'users/freelancer'), { permissions: { allowedWorkspaces: ['SEO'] } }));
  await assertFails(updateDoc(doc(db, 'users/admin'), { role: 'master_admin' }));
});
test('public callers cannot read tasks or create an admin profile', async () => {
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'tickets/task')));
  await assertFails(setDoc(doc(db, 'users/new'), { name: 'Intruder', role: 'master_admin' }));
});

test('every existing employee role can sign in, load the team and save its own profile', async () => {
  for (const uid of ['master', 'admin', 'staff', 'freelancer']) {
    const db = environment.authenticatedContext(uid).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', uid)));
    await assertSucceeds(getDocs(query(collection(db, 'users'), orderBy('name'))));
    // Match ProfileView's exact save fields, including its password-change save.
    await assertSucceeds(setDoc(doc(db, 'users', uid), {
      name: `Profile ${uid}`, initials: 'PR', color: '#1061E3', photoUrl: '',
      emailNotificationsEnabled: true, password: 'test-only-password', updatedAt: serverTimestamp(),
    }, { merge: true }));
  }
});

test('task and client read/create/update/delete behavior stays unchanged for all team roles', async () => {
  for (const uid of ['master', 'admin', 'staff', 'freelancer']) {
    const db = environment.authenticatedContext(uid).firestore();
    for (const path of ['tickets', 'companies', 'contacts', 'groups', 'products']) {
      const ref = doc(db, path, `regression-${uid}`);
      await assertSucceeds(setDoc(ref, { name: 'Test', workspace: 'SEO', status: 'Not Started' }));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(getDocs(collection(db, path)));
      await assertSucceeds(updateDoc(ref, { status: 'In Progress' }));
      await assertSucceeds(deleteDoc(ref));
    }
  }
});

test('master can save the full Settings member form, create accounts and change roles', async () => {
  const db = environment.authenticatedContext('master').firestore();
  const ref = doc(db, 'users/new-employee');
  await assertSucceeds(setDoc(ref, { name: 'New employee', role: 'staff', authUid: 'new-employee', color: '#1061E3', initials: 'NE' }));
  const existing = (await getDoc(ref)).data()!;
  // SettingsView saves a full object, rather than a small patch.
  await assertSucceeds(setDoc(ref, {
    ...existing, id: 'new-employee', role: 'admin', email: 'test@example.invalid',
    permissions: { canViewCRM: true, allowedWorkspaces: ['SEO'], canDeleteRows: true, canDeleteColumns: false, canDeleteGroups: false },
    emailNotificationsEnabled: false, updatedAt: serverTimestamp(),
  }, { merge: true }));
  await assertSucceeds(deleteDoc(ref));
});

test('admin workspace management and the existing public ticket intake remain available', async () => {
  const db = environment.authenticatedContext('admin').firestore();
  await assertSucceeds(updateDoc(doc(db, 'users/staff'), { permissions: { allowedWorkspaces: ['SEO', 'Local Listings'] }, updatedAt: serverTimestamp() }));
  const publicDb = environment.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(publicDb, 'tickets/public-form-test'), { projectName: 'Test intake', workspace: 'Support Tickets' }));
  await assertFails(getDoc(doc(publicDb, 'tickets/public-form-test')));
});
