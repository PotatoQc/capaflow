import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentSingleTabManager,
} from 'firebase/firestore';

// Configuration publique de l'app Web (fournie à la compilation, jamais secrète).
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Cache hors ligne persistant (PLAN §3). Le dernier onglet ouvert en prend le contrôle : au retour de Square,
// iOS ouvre un nouvel onglet et l'ancien, gelé en arrière-plan, ne doit pas le bloquer.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({ forceOwnership: true }) }),
});

if (import.meta.env.VITE_USE_EMULATOR === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

// Identifiant de connexion → courriel technique (PLAN §5), aucun courriel n'est envoyé.
export const loginEmail = (username: string) => `${username.trim().toLowerCase()}@example.com`;
