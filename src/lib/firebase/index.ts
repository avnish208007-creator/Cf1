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
  setLogLevel('silent');
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
export { sanitizeFirestoreData } from './sanitize';

let cachedUser: User | null = null;
let isAuthInitStarted = false;

export function initAuthInBackground(): void {
  if (isAuthInitStarted) return;
  isAuthInitStarted = true;

  try {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        cachedUser = user;
      } else {
        try {
          const cred = await signInAnonymously(auth);
          cachedUser = cred.user;
        } catch {
          // Graceful fallback to local operation
        }
      }
    });
  } catch {
    // Non-blocking fallback
  }
}

// Start background auth immediately
initAuthInBackground();

export function getCachedUserId(): string {
  if (auth.currentUser?.uid) return auth.currentUser.uid;
  if (cachedUser?.uid) return cachedUser.uid;
  return 'local_user';
}

// Test connection on boot non-blockingly
export async function validateFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, '_connection_test', 'ping'));
    return true;
  } catch {
    // Graceful offline fallback
    return false;
  }
}

// Non-blocking auth user retrieval
export async function ensureAuthUser(): Promise<User | null> {
  if (auth.currentUser) return auth.currentUser;
  if (cachedUser) return cachedUser;

  return new Promise((resolve) => {
    try {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        unsubscribe();
        if (user) {
          cachedUser = user;
          resolve(user);
        } else {
          try {
            const cred = await signInAnonymously(auth);
            cachedUser = cred.user;
            resolve(cred.user);
          } catch {
            resolve(null);
          }
        }
      });
      // Safety timeout after 500ms so nothing blocks
      setTimeout(() => resolve(auth.currentUser || cachedUser), 500);
    } catch {
      resolve(null);
    }
  });
}
