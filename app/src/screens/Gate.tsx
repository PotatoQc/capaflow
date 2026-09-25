import { useEffect, useState } from 'react';
import { Brand } from './Brand';

// Écrans affichés avant que l'app soit prête (chargement, compte bloqué, événement à initialiser).

const STUCK_MS = 10_000;

export function Splash() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), STUCK_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <main className="login">
      <div className="login-card">
        <Brand large />
        {stuck && (
          <>
            <p className="muted">Le chargement est bloqué. Fermez les autres onglets de ce site, puis rechargez.</p>
            <button className="btn btn-primary btn-lg" onClick={() => window.location.reload()}>Recharger</button>
          </>
        )}
      </div>
    </main>
  );
}

export function Blocked({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <main className="login">
      <div className="login-card">
        <Brand large />
        <p className="muted">{message}</p>
        <button className="btn" onClick={onSignOut}>Se déconnecter</button>
      </div>
    </main>
  );
}

export function InitEvent({ onInit }: { onInit: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const init = () => {
    setBusy(true);
    onInit().catch(() => {
      setError("L'initialisation a échoué. Réessayez.");
      setBusy(false);
    });
  };
  return (
    <main className="login">
      <div className="login-card">
        <Brand large />
        <p className="muted">L'événement Neon Party n'existe pas encore. Il sera créé avec les valeurs par défaut du plan (capacité 255, 166 + 89 billets, prix 5 $ / 15 $).</p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={init}>Initialiser l'événement</button>
      </div>
    </main>
  );
}
