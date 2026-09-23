import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AlertProvider } from './alerts/AlertProvider';
import { DemoProvider } from './demo/DemoContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <DemoProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </DemoProvider>
    </HashRouter>
  </StrictMode>,
);
