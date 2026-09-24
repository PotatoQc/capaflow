import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AlertProvider } from './alerts/AlertProvider';
import { FirebaseProvider } from './data/FirebaseProvider';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
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
