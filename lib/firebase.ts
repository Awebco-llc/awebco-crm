import type { FirebaseApp } from 'firebase/app';
import { initializeApp, getApps } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { getStorage } from 'firebase/storage';

// Next/Webpack only inlines env vars in client bundles when accessed with dot
// access (`process.env.NEXT_PUBLIC_*`). Avoid bracket access.
function requiredPublicEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Set it in \`.env.local\` (see \`.env.example\`).`);
  }
  return value;
}

let cached:
  | {
      app: FirebaseApp;
      db: Firestore;
      auth: Auth;
      googleProvider: GoogleAuthProvider;
      storage: FirebaseStorage;
    }
  | undefined;

export function getFirebaseConfig() {
  return {
    projectId: requiredPublicEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    appId: requiredPublicEnv('NEXT_PUBLIC_FIREBASE_APP_ID', process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
    apiKey: requiredPublicEnv('NEXT_PUBLIC_FIREBASE_API_KEY', process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: requiredPublicEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    storageBucket: requiredPublicEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: requiredPublicEnv(
      'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    ),
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

function initFirebaseClient() {
  if (cached) return cached;

  // Prevent Next build/SSR from executing Firebase init when env vars may be absent.
  // Firebase client SDK can run on the server (Node.js), so we allow it for API routes.

  const firebaseConfig = getFirebaseConfig();

  const firestoreDatabaseId = requiredPublicEnv(
    'NEXT_PUBLIC_FIRESTORE_DATABASE_ID',
    process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID,
  );

  const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
  cached = {
    app,
    db: getFirestore(app, firestoreDatabaseId),
    auth: getAuth(app),
    googleProvider: new GoogleAuthProvider(),
    storage: getStorage(app),
  };
  return cached;
}

export function getFirebaseApp(): FirebaseApp {
  return initFirebaseClient().app;
}

export function getAuthClient() {
  const app = getFirebaseApp();
  // On the server, we initialize Auth without any persistence (since there is no localStorage)
  if (typeof window === 'undefined') {
    const { getAuth, inMemoryPersistence } = require('firebase/auth');
    const auth = getAuth(app);
    auth.setPersistence(inMemoryPersistence);
    return auth;
  }
  const { getAuth } = require('firebase/auth');
  return getAuth(app);
}

export function getDb() {
  const app = getFirebaseApp();
  const firestoreDatabaseId = process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID || '(default)';
  const { getFirestore } = require('firebase/firestore');
  return getFirestore(app, firestoreDatabaseId);
}

export function getGoogleProvider(): GoogleAuthProvider {
  return initFirebaseClient().googleProvider;
}

export function getStorageClient(): FirebaseStorage {
  return initFirebaseClient().storage;
}
