import * as admin from 'firebase-admin';

/**
 * Secure Firebase Admin SDK initialization for server-side operations.
 * This uses the Service Account credentials to bypass Firestore rules.
 */
export function getAdminDb() {
  if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        // Handle newline characters in the private key
        privateKey: privateKey ? privateKey.replace(/\\n/g, '\n') : undefined,
      }),
    });
  }
  return admin.firestore();
}
