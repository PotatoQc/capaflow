import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AlertProvider } from './alerts/AlertProvider';
import { FirebaseProvider } from './data/FirebaseProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <FirebaseProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </FirebaseProvider>
    </HashRouter>
  </StrictMode>,
);
