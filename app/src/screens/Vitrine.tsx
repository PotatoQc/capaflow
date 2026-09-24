import { useEffect, useRef, useState } from 'react';
import Nav from './Nav';
import { useApp } from '../data/AppContext';
import { TICKETS } from '../data/event';
import mark from '../assets/southevents-mark.png';

// Vue Viewer « néon festif » (PLAN §6.2) : vue publique animée, sans V, prix ni revenus.

const COUNT_MS = 800;

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// Compteur qui roule vers sa valeur (part de 0 à l'ouverture).
function useCount(target: number) {
  const [shown, setShown] = useState(() => (calm() ? target : 0));
  const from = useRef(shown);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    if (calm() || typeof requestAnimationFrame === 'undefined') {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / COUNT_MS);
      const v = Math.round(start + (target - start) * (1 - (1 - k) ** 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
}

type Pop = { id: number; text: string; up: boolean };

function Counter({ label, value, total, tone }: { label: string; value: number; total?: number; tone: string }) {
  const n = useCount(value);
  return (
    <div className={`show-tile ${tone}`}>
      <span>{label}</span>
      <strong>
        {n}
        {total !== undefined && <small> / {total}</small>}
      </strong>
      {total !== undefined && <div className="gauge thin"><i style={{ width: `${Math.min(100, (value / total) * 100)}%` }} /></div>}
    </div>
  );
}

export default function Vitrine() {
  const { state: s } = useApp();
  const [tv, setTv] = useState(false);
  const [pops, setPops] = useState<Pop[]>([]);
  const prev = useRef(s.occupancy);
  const shown = useCount(s.occupancy);
  const over = s.occupancy - s.capacity;
  const pct = Math.round((s.occupancy / s.capacity) * 100);

  // Bulle « +1 » / « −1 » à chaque changement de l'occupation.
  useEffect(() => {
    const d = s.occupancy - prev.current;
    prev.current = s.occupancy;
    if (d === 0) return;
    setPops((p) => [...p.slice(-4), { id: Date.now() + Math.random(), text: d > 0 ? `+${d}` : `−${-d}`, up: d > 0 }]);
  }, [s.occupancy]);

  const enterTv = () => {
    setTv(true);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };
  const exitTv = () => {
    setTv(false);
    if (document.fullscreenElement) void document.exitFullscreen();
  };

  return (
    <div className={`show ${tv ? 'tv' : ''}`}>
      {!tv && <Nav />}
      <header className="show-head">
        <img src={mark} alt="SouthEvents" />
        <h1 className="neon-title">Neon Party</h1>
      </header>

      {over >= 0 && <p className="show-full">{over === 0 ? 'SALLE PLEINE' : `DÉPASSEMENT : +${over}`}</p>}

      <section className={`show-hero ${over >= 0 ? 'full' : ''}`}>
        <span className="show-label">Dans la salle en ce moment</span>
        <div className="show-num">
          {shown}
          {pops.map((p) => (
            <span key={p.id} className={`pop ${p.up ? '' : 'down'}`} onAnimationEnd={() => setPops((l) => l.filter((x) => x.id !== p.id))}>
              {p.text}
            </span>
          ))}
        </div>
        <div className="gauge"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
        <span className="show-cap">{pct} % de la capacité ({s.capacity})</span>
      </section>

      <section className="show-tiles">
        <Counter label="Billets étudiants" value={s.scanned.student} total={TICKETS.student} tone="cyan" />
        <Counter label="Billets réguliers" value={s.scanned.regular} total={TICKETS.regular} tone="pink" />
        <Counter label="Staff" value={s.staff} tone="gold" />
      </section>

      <button className="btn btn-sm tv-toggle" onClick={tv ? exitTv : enterTv}>
        {tv ? 'Quitter le grand écran' : 'Grand écran'}
      </button>
    </div>
  );
}
