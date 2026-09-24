import { useEffect, useRef, useState } from 'react';
import Nav from './Nav';
import { useApp } from '../data/AppContext';
import { TICKETS } from '../data/event';
import mark from '../assets/southevents-mark.png';

// Vue Viewer « Enseigne » (PLAN §6.2) : vue publique, sans V, prix ni revenus.

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

function Row({ label, value, total }: { label: string; value: number; total?: number }) {
  const n = useCount(value);
  return (
    <div className="show-row">
      <span>{label}</span>
      <strong>
        {n}
        {total !== undefined && <small> / {total}</small>}
      </strong>
    </div>
  );
}

export default function Vitrine() {
  const { state: s } = useApp();
  const [tv, setTv] = useState(false);
  const shown = useCount(s.occupancy);
  const over = s.occupancy - s.capacity;
  const pct = Math.round((s.occupancy / s.capacity) * 100);

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
      <div className="show-top">
        <img src={mark} alt="SouthEvents" />
        <small>SouthEvents présente</small>
      </div>
      <h1 className="neon-title">Neon<br />Party</h1>

      <div className="show-num">{shown}</div>
      <p className="show-sub">personnes dans la salle · {pct} % de la capacité ({s.capacity})</p>
      {over >= 0 && <p className="show-full">{over === 0 ? 'SALLE PLEINE' : `DÉPASSEMENT : +${over}`}</p>}

      <section className="show-rows">
        <Row label="Billets étudiants" value={s.scanned.student} total={TICKETS.student} />
        <Row label="Billets réguliers" value={s.scanned.regular} total={TICKETS.regular} />
        <Row label="Staff" value={s.staff} />
      </section>

      <button className="btn btn-sm tv-toggle" onClick={tv ? exitTv : enterTv}>
        {tv ? 'Quitter le grand écran' : 'Grand écran'}
      </button>
    </div>
  );
}
