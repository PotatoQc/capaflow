import { NavLink } from 'react-router-dom';
import { useAlerts } from '../alerts/AlertProvider';
import { useDemo } from '../demo/DemoContext';
import { ROLE_LABEL } from '../demo/scenarios';

const LINKS = [
  { to: '/tableau', label: 'Tableau' },
  { to: '/porte', label: 'Porte' },
  { to: '/gestion', label: 'Gestion' },
];

export default function Nav() {
  const { role, state } = useDemo();
  const { soundOn, toggleSound } = useAlerts();
  const canManage = role === 'admin' || role === 'manager';

  return (
    <header className="nav">
      <div className="brand">Capa<span>Flow</span></div>
      {canManage && (
        <nav>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {l.label}
            </NavLink>
          ))}
        </nav>
      )}
      <div className="nav-meta">
        {canManage && (
          <button className={`badge sound ${soundOn ? 'on' : ''}`} onClick={toggleSound}>
            {soundOn ? '● Son activé' : 'Activer le son'}
          </button>
        )}
        <span className="clock">{state.clock}</span>
        <span className="badge">{ROLE_LABEL[role]}</span>
      </div>
    </header>
  );
}
