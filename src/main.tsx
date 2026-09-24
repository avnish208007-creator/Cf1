import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { validateFirestoreConnection } from './lib/firebase';

// Validate connection to Firestore on initial boot
validateFirestoreConnection().catch((err) => {
  console.warn('[Firebase] Connection validation error:', err);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

