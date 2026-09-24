import { useState, type FormEvent } from 'react';
import { Brand } from './Brand';

export default function Connexion({ onSignIn }: { onSignIn: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    onSignIn(username, password).catch(() => {
      setError('Identifiant ou mot de passe incorrect.');
      setBusy(false);
    });
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <Brand large />
        <p className="muted">Neon Party · ven. 25 sept. · 19:00</p>
        <label className="field">
          <span>Identifiant</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>Se connecter</button>
      </form>
    </main>
  );
}
