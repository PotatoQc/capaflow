import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from '../demo/DemoContext';

export default function Connexion() {
  const { role } = useDemo();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(role === 'bouncer' ? '/porte' : '/tableau');
  };

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand brand-lg">Capa<span>Flow</span></div>
        <p className="muted">Neon Party · ven. 25 sept. · 19:00</p>
        <label className="field">
          <span>Identifiant</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button className="btn btn-primary btn-lg" type="submit">Se connecter</button>
      </form>
    </main>
  );
}
