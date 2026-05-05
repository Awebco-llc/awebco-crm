import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Important: Next/Webpack only inlines env vars when accessed as
// `process.env.MY_VAR` (dot access). Bracket access (`process.env[name]`)
// will be `undefined` in the browser bundle.
const PUBLIC_ENV = {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  NEXT_PUBLIC_FIRESTORE_DATABASE_ID: process.env.NEXT_PUBLIC_FIRESTORE_DATABASE_ID,
} as const;

type RequiredPublicEnvKey = keyof typeof PUBLIC_ENV;

function requiredEnv(name: RequiredPublicEnvKey): string {
  const value = PUBLIC_ENV[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}. Set it in \`.env.local\` (see \`.env.example\`).`);
  }
  return value;
}

const firebaseConfig = {
  projectId: requiredEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  appId: requiredEnv('NEXT_PUBLIC_FIREBASE_APP_ID'),
  apiKey: requiredEnv('NEXT_PUBLIC_FIREBASE_API_KEY'),
  authDomain: requiredEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  storageBucket: requiredEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const firestoreDatabaseId = requiredEnv('NEXT_PUBLIC_FIRESTORE_DATABASE_ID');

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
