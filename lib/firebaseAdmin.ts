import * as admin from 'firebase-admin';

export function getFirestoreAdmin() {
  if (!admin.apps.length) {
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'awebco-crm';

    if (privateKey && clientEmail) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      throw new Error(
        'Firebase Admin SDK could not be initialized. ' +
        'Please define GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in your .env file.'
      );
    }
  }
  
  // Set database ID if configured (Next.js server-side)
  const db = admin.firestore();
  return db;
}
