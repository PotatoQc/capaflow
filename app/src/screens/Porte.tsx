import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { saleTotal, useApp, type OpType, type Sale } from '../data/AppContext';
import { bornOnOrBefore } from '../data/event';
import type { SalesState } from '../engine/computeState';
import { useWakeLock } from './useWakeLock';

const UNDO_MS = 30_000;
const PRICE_NOTICE_MS = 10_000;
const MAX_PER_SALE = 10;
const CHECKINS = [
  { key: 'student', label: 'Check-in étudiant' },
  { key: 'regular', label: 'Check-in régulier' },
] as const;

const SALES_HINT: Record<Exclude<SalesState, 'OUVERT'>, string> = {
  FERMÉ: 'Ventes fermées',
  SUSPENDU: 'Scans non à jour',
  COMPLET: 'Aucune place à vendre',
};

// Prix et plafond figés à l'ouverture de la feuille (PLAN §6.1).
type Sheet = Sale & { max: number };

const CATEGORIES = [
  { key: 'student', label: 'Étudiant', price: 'priceStudent' },
  { key: 'other', label: 'Autre', price: 'priceOther' },
] as const;

export default function Porte() {
  const { role, state, record, voidEntry } = useApp();
  const [flash, setFlash] = useState<{ kind: 'plus' | 'minus'; key: number } | null>(null);
  const [last, setLast] = useState<{ id: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<Sheet | null>(null);
  // Rappel « carte étudiante » avant le check-in étudiant (PLAN §6.1).
  const [cardCheck, setCardCheck] = useState<'ask' | 'nocard' | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useWakeLock();

  const [priceNotice, setPriceNotice] = useState(false);
  const shownPrices = useRef(`${state.doorStudent}/${state.doorOther}`);
  useEffect(() => {
    const current = `${state.doorStudent}/${state.doorOther}`;
    if (current === shownPrices.current) return;
    shownPrices.current = current;
    setPriceNotice(true);
    const t = setTimeout(() => setPriceNotice(false), PRICE_NOTICE_MS);
    return () => clearTimeout(t);
  }, [state.doorStudent, state.doorOther]);

  if (role === 'viewer') return <Navigate to="/tableau" replace />;

  const sales = state.salesState;
  const over = state.occupancy - state.capacity;
  const undoLeft = last ? Math.max(0, Math.ceil((last.at + UNDO_MS - now) / 1000)) : 0;

  const act = (type: OpType, kind: 'plus' | 'minus', sale?: Sale) => {
    const id = record(type, { sale });
    const t = Date.now();
    setLast({ id, at: t });
    setNow(t);
    setFlash({ kind, key: t });
    navigator.vibrate?.(30);
  };

  const undo = () => {
    if (!last || undoLeft === 0) return;
    voidEntry(last.id);
    setLast(null);
    setFlash({ kind: 'minus', key: Date.now() });
  };

  const openSale = (preset?: { other: number }) => {
    if (sales !== 'OUVERT') return;
    setSheet({
      student: 0,
      other: preset?.other ?? 0,
      priceStudent: state.doorStudent,
      priceOther: state.doorOther,
      max: Math.min(MAX_PER_SALE, state.sellable),
    });
  };

  const count = sheet ? sheet.student + sheet.other : 0;

  const step = (key: 'student' | 'other', by: 1 | -1) =>
    setSheet((s) => (s && (by < 0 ? s[key] > 0 : s.student + s.other < s.max) ? { ...s, [key]: s[key] + by } : s));

  const confirmSale = () => {
    if (!sheet || count === 0) return;
    const { student, other, priceStudent, priceOther } = sheet;
    act('sale', 'plus', { student, other, priceStudent, priceOther });
    setSheet(null);
  };

  return (
    <main className="porte">
      <header className="porte-head">
        {role !== 'bouncer' && <Link to="/tableau" className="back">‹ Tableau</Link>}
        <div className={`occ ${over >= 0 ? 'full' : ''}`}>
          <strong>{state.occupancy}</strong>
          <span>/{state.capacity}</span>
        </div>
        <span className={`dot dot-${state.light}`} />
        <div className={`net ${state.online ? 'on' : 'off'}`}>
          ● {state.online ? 'en ligne' : 'hors ligne'}
          {state.pending > 0 && <em> · {state.pending} en attente</em>}
        </div>
      </header>

      <div className="age-line">
        <span><strong>18 ans +</strong>{bornOnOrBefore(18)}</span>
        <span><strong>17 ans +</strong>{bornOnOrBefore(17)}</span>
      </div>

      {over >= 0 && <p className="capacity-alert">{over === 0 ? 'SALLE PLEINE' : `DÉPASSEMENT : +${over}`}</p>}

      {priceNotice && sales === 'OUVERT' && (
        <p className="price-notice">{`NOUVEAU PRIX : ${state.doorStudent} $ · ${state.doorOther} $`}</p>
      )}

      {state.scanAgeS > 30 && state.scanAgeS <= 60 && <p className="scan-warn">⚠ scans il y a {state.scanAgeS} s</p>}

      <section className="zones">
        <button className="zone exit" onClick={() => act('exit', 'minus')}>
          <span className="zone-icon">−</span>SORTIE
        </button>
        <button className="zone reentry" onClick={() => act('reentry', 'plus')}>
          <span className="zone-icon">↺</span>RÉENTRÉE<small>bracelet</small>
        </button>
        <button className={`zone sale ${sales !== 'OUVERT' ? 'disabled' : ''}`} onClick={() => openSale()} aria-disabled={sales !== 'OUVERT'}>
          {sales === 'OUVERT' ? (
            <>
              <span className="zone-icon">$</span>VENTE
              <small className="prices">{state.doorStudent} $ · {state.doorOther} $</small>
              <small className="left">{state.sellable} billet{state.sellable > 1 ? 's' : ''} disponible{state.sellable > 1 ? 's' : ''}</small>
            </>
          ) : (
            <>
              {sales}
              <small>{SALES_HINT[sales]}</small>
            </>
          )}
        </button>
      </section>

      <nav className="checkin-links" aria-label="Check-in Hi.Events">
        {CHECKINS.map(({ key, label }) =>
          key === 'student' && state.checkinLinks.student ? (
            <button key={key} className="btn" onClick={() => setCardCheck('ask')}>{label} ↗</button>
          ) : state.checkinLinks[key] ? (
            <a key={key} className="btn" href={state.checkinLinks[key]} target="_blank" rel="noopener noreferrer">
              {label} ↗
            </a>
          ) : (
            <button key={key} className="btn" disabled>
              {label}
              <small>lien à configurer</small>
            </button>
          ),
        )}
      </nav>

      <footer className="porte-foot">
        <div className="staff-step">
          <button className="btn" aria-label="Retirer un staff" disabled={state.staff <= 0} onClick={() => act('staffOut', 'minus')}>−</button>
          <span>Staff <strong>{state.staff}</strong></span>
          <button className="btn" aria-label="Ajouter un staff" onClick={() => act('staff', 'plus')}>+</button>
        </div>
        <button className="btn" disabled={undoLeft === 0} onClick={undo}>
          Annuler dernier{undoLeft > 0 && ` (${undoLeft} s)`}
        </button>
      </footer>

      {sheet && (
        <div className="sheet-backdrop" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Vente à la porte" onClick={(e) => e.stopPropagation()}>
            <h2>Vente à la porte</h2>
            <div className="choices">
              {CATEGORIES.map(({ key, label, price }) => (
                <div key={key} className={`choice ${sheet[key] > 0 ? 'selected' : ''}`}>
                  <span>{label}</span>
                  <strong>{sheet[price]} $</strong>
                  <div className="qty">
                    <button aria-label={`Retirer un billet ${label}`} disabled={sheet[key] === 0} onClick={() => step(key, -1)}>−</button>
                    <output aria-label={`Billets ${label}`}>{sheet[key]}</output>
                    <button aria-label={`Ajouter un billet ${label}`} disabled={count >= sheet.max} onClick={() => step(key, 1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
            <p className="hint">Maximum {sheet.max} billet{sheet.max > 1 ? 's' : ''} pour cette vente.</p>
            <button className="btn btn-primary btn-lg" disabled={count === 0} onClick={confirmSale}>
              {count > 0 ? `Confirmer ${count} billet${count > 1 ? 's' : ''} · ${saleTotal(sheet)} $` : 'Choisir des billets'}
            </button>
            <button className="btn btn-ghost" onClick={() => setSheet(null)}>Annuler</button>
          </div>
        </div>
      )}

      {cardCheck && (
        <div className="sheet-backdrop" onClick={() => setCardCheck(null)}>
          <div className="sheet" role="alertdialog" aria-label="Carte étudiante" onClick={(e) => e.stopPropagation()}>
            {cardCheck === 'ask' ? (
              <>
                <h2>Carte étudiante obligatoire</h2>
                <p className="card-warn">Demandez la carte étudiante AVANT de scanner le billet.</p>
                <a className="btn btn-primary btn-lg link-btn" href={state.checkinLinks.student} target="_blank"
                  rel="noopener noreferrer" onClick={() => setCardCheck(null)}>
                  Carte vérifiée : ouvrir le check-in ↗
                </a>
                <button className="btn btn-lg" onClick={() => setCardCheck('nocard')}>Pas de carte étudiante</button>
              </>
            ) : sales === 'OUVERT' ? (
              <>
                <h2>Pas de carte : faire payer</h2>
                <p className="card-warn">Ne pas scanner son billet étudiant. Prix non-étudiant : {state.doorOther} $.</p>
                <button className="btn btn-primary btn-lg" onClick={() => { setCardCheck(null); openSale({ other: 1 }); }}>
                  Vendre 1 billet Autre · {state.doorOther} $
                </button>
              </>
            ) : (
              <>
                <h2>Pas de carte : refuser l'entrée</h2>
                <p className="card-refuse">REFUSER L'ENTRÉE</p>
                <p className="hint">{SALES_HINT[sales]} : impossible de lui vendre un billet non-étudiant.</p>
              </>
            )}
            <button className="btn btn-ghost" onClick={() => setCardCheck(null)}>Fermer</button>
          </div>
        </div>
      )}

      {flash && <div key={flash.key} className={`flash ${flash.kind}`} onAnimationEnd={() => setFlash(null)} />}
    </main>
  );
}
