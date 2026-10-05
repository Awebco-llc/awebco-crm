import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let environment: RulesTestEnvironment;
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run npm run test:mcp:rules; never run against production.');
  environment = await initializeTestEnvironment({ projectId: 'demo-awebco-mcp', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  await environment.withSecurityRulesDisabled(async context => {
    for (const [uid, role] of [['master', 'master_admin'], ['admin', 'admin'], ['staff', 'staff'], ['freelancer', 'freelancer']]) await setDoc(doc(context.firestore(), 'users', uid), { name: uid, role, authUid: uid });
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
