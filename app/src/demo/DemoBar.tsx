import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemo } from './DemoContext';
import { ROLE_LABEL, scenarios, type Role } from './scenarios';

const SCREENS = [
  { to: '/connexion', label: 'Connexion' },
  { to: '/porte', label: 'Porte' },
  { to: '/tableau', label: 'Tableau' },
  { to: '/gestion', label: 'Gestion' },
];

export default function DemoBar() {
  const { role, setRole, scenarioId, setScenarioId } = useDemo();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const changeRole = (r: Role) => {
    setRole(r);
    if (r === 'bouncer') navigate('/porte');
    if (r === 'viewer') navigate('/tableau');
  };

  return (
    <div className="demo">
      {open && (
        <div className="demo-panel">
          <label className="field">
            <span>Rôle</span>
            <select value={role} onChange={(e) => changeRole(e.target.value as Role)}>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Scénario</span>
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
          <div className="demo-links">
            {SCREENS.map((s) => (
              <button key={s.to} className="btn btn-sm" onClick={() => navigate(s.to)}>{s.label}</button>
            ))}
          </div>
        </div>
      )}
      <button className="demo-pill" onClick={() => setOpen((o) => !o)}>DÉMO {open ? '▾' : '▴'}</button>
    </div>
  );
}
