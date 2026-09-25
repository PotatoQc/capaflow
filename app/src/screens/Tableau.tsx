import { Navigate } from 'react-router-dom';
import Nav from './Nav';
import Vitrine from './Vitrine';
import { useApp } from '../data/AppContext';
import { TICKETS } from '../data/event';
import { WARN, worstRatio } from '../data/usage';

type TileProps = { label: string; value: string | number; suffix?: string; ratio?: number; tone?: 'yellow' | 'red' };

function Tile({ label, value, suffix, ratio, tone }: TileProps) {
  return (
    <div className="tile">
      <span className="tile-label">{label}</span>
      <span className={`tile-value ${tone ?? ''}`}>
        {value}
        {suffix && <small> {suffix}</small>}
      </span>
      {ratio !== undefined && (
        <div className="bar"><i style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
      )}
    </div>
  );
}

export default function Tableau() {
  const { role, state: s } = useApp();
  if (role === 'bouncer') return <Navigate to="/porte" replace />;
  if (role === 'viewer') return <Vitrine />;

  const l = s.light;
  const age = s.scanAgeS;
  const ageLabel = Number.isFinite(age) ? `${age} s` : '—';
  const over = s.occupancy - s.capacity;
  const heroLabel = s.sellable > 0 ? 'VOUS POUVEZ VENDRE' : s.sellable < 0 ? 'SURRÉSERVATION PROJETÉE' : '';
  const suggestionDiffers = s.suggested && (s.suggested.student !== s.doorStudent || s.suggested.other !== s.doorOther);

  const capacityBanner = over >= 0 && (
    <div className="banner red pulse">
      {over === 0 ? 'SALLE PLEINE' : `DÉPASSEMENT : +${over} au-dessus de la capacité (${s.capacity})`}
    </div>
  );

  return (
    <div className="page">
      <Nav />

      <div className="banners">
        {capacityBanner}
        {s.salesState === 'SUSPENDU' && <div className="banner red">SUSPENDU — scans Hi.Events non mis à jour ({Number.isFinite(age) ? `depuis ${age} s` : 'aucune donnée reçue'})</div>}
        {!s.salesOpen && <div className="banner grey">FERMÉ — ventes fermées</div>}
        {s.forceSales && <div className="banner accent">FORÇAGE ACTIF — ventes permises malgré des scans périmés</div>}
        {s.usage && worstRatio(s.usage) >= WARN && (
          <div className="banner red">FIREBASE : {Math.round(worstRatio(s.usage) * 100)} % de la limite du jour utilisé — voir Gestion › Soirée</div>
        )}
      </div>

      <section className={`hero hero-${l}`}>
        <div className="hero-top">
          <span className={`dot dot-${l}`} />
          {heroLabel}
        </div>
        {s.sellable === 0 ? (
          <div className="hero-num word">COMPLET</div>
        ) : (
          <div className="hero-num">{Math.abs(s.sellable)}</div>
        )}
        {s.sellable >= 1 && (
          <>
            <div className="hero-prices">
              <div><span>Étudiant</span><strong>{s.doorStudent} $</strong></div>
              <div><span>Autre</span><strong>{s.doorOther} $</strong></div>
            </div>
            <p className="suggested">
              Prix {s.priceMode === 'auto' ? 'automatiques' : 'figés'}
              {suggestionDiffers && s.suggested && ` · suggéré : ${s.suggested.student} $ · ${s.suggested.other} $`}
            </p>
          </>
        )}
      </section>

      <section className="tiles">
        <Tile label="Salle" value={s.occupancy} suffix={`/ ${s.capacity}`} ratio={s.occupancy / s.capacity} tone={over >= 0 ? 'red' : undefined} />
        <Tile label="Billets étudiants" value={s.scanned.student} suffix={`/ ${TICKETS.student}`} ratio={s.scanned.student / TICKETS.student} />
        <Tile label="Billets réguliers" value={s.scanned.regular} suffix={`/ ${TICKETS.regular}`} ratio={s.scanned.regular / TICKETS.regular} />
        <Tile label="Staff" value={s.staff} />
        <Tile label="Dehors" value={s.outside} />
        <Tile label="Réserve" value={Math.round(s.reserve)} />
        <Tile label="Attendus d'ici 1 h" value={`~${Math.round(s.expected1h)}`} />
        <Tile label="Revenus porte" value={`${s.revenue} $`} />
        <Tile label="Âge des scans" value={ageLabel} tone={age > 60 ? 'red' : age > 30 ? 'yellow' : undefined} />
      </section>
    </div>
  );
}
