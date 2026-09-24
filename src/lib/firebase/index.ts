import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  Firestore,
  setLogLevel,
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';

// Silence verbose network-polling & retry warning logs in the client
try {
  setLogLevel('error');
} catch {
  // ignore if not supported in test environment
}

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with robust multi-tab offline persistence
function initFirestoreInstance(): Firestore {
  try {
    if (firebaseConfig.firestoreDatabaseId) {
      return initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        firebaseConfig.firestoreDatabaseId,
      );
    }
    return initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    });
  } catch {
    return firebaseConfig.firestoreDatabaseId
      ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
      : getFirestore(app);
  }
}

export const db: Firestore = initFirestoreInstance();

// Initialize Firebase Auth
export const auth: Auth = getAuth(app);

// Test connection on boot as mandated by Firebase skill
export async function validateFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'ping'));
    return true;
  } catch (error: any) {
    if (
      error?.code === 'unavailable' ||
      (error instanceof Error &&
        (error.message.includes('offline') || error.message.includes('unavailable')))
    ) {
      // Offline mode is active and handled gracefully
      return false;
    }
    return true;
  }
}

// Ensure an authenticated session (anonymous or user) for security rules
export async function ensureAuthUser(): Promise<User | null> {
  return new Promise((resolve) => {
    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        if (user) {
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            resolve(cred.user);
          } catch (err: any) {
            // If anonymous sign-in is disabled or restricted, proceed with local fallback
            resolve(null);
          }
        }
      });
    } catch {
      resolve(null);
    }
  });
}
