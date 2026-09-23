import { useState } from 'react';

// Écrans affichés avant que l'app soit prête (chargement, compte bloqué, événement à initialiser).

export function Splash() {
  return (
    <main className="login">
      <div className="brand brand-lg">Capa<span>Flow</span></div>
    </main>
  );
}

export function Blocked({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand brand-lg">Capa<span>Flow</span></div>
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
        <div className="brand brand-lg">Capa<span>Flow</span></div>
        <p className="muted">L'événement Neon Party n'existe pas encore. Il sera créé avec les valeurs par défaut du plan (capacité 255, 166 + 89 billets, prix 5 $ / 15 $).</p>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={init}>Initialiser l'événement</button>
      </div>
    </main>
  );
}
