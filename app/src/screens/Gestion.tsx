import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import Nav from './Nav';
import { TYPE_LABEL, useApp, type Account } from '../data/AppContext';
import { arrivalFraction } from '../engine/computeState';
import { CURVE_HOURS, DEFAULT_CAPACITY, ROLE_LABEL, clock, localTimeToUtc, type AccountRole, type Role } from '../data/event';
import ConfirmDialog from './ConfirmDialog';

type Confirm = { title: string; message: string; label: string; onConfirm: () => void; onCancel?: () => void };

const ACCOUNT_ROLES: AccountRole[] = ['admin', 'manager', 'bouncer', 'viewer', 'disabled'];
// Seul format accepté : un lien `javascript:` ou vers un autre site serait dangereux derrière un bouton.
const CHECKIN_LINK = /^https:\/\/app\.hi\.events\/check-in\/cil_[A-Za-z0-9]+(#scan)?$/;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const num = (v: string) => (v === '' ? 0 : Number(v));
const pct = (x: number) => Math.round(x * 100);
const roleLabel = (r: AccountRole) => (r === 'disabled' ? 'Désactivé' : ROLE_LABEL[r]);
const stepDelta = (d: number, by: number) => {
  const n = clamp(d + by, -50, 50);
  return n === 0 ? by : n;
};

export default function Gestion() {
  const {
    role, state, log, setCapacity, setSalesOpen, setForceSales, lockDoorPrices, setPriceMode, setCheckinLinks, setParams,
    setPricing, record, voidEntry, accounts, createAccount: addAccount, setAccountRole,
  } = useApp();
  const [linksDraft, setLinksDraft] = useState(state.checkinLinks);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [capDraft, setCapDraft] = useState(String(state.capacity));
  const [doorDraft, setDoorDraft] = useState({ student: state.doorStudent, other: state.doorOther });
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState('1');
  const [reason, setReason] = useState('');
  const [r0, setR0] = useState({ student: pct(state.params.r0.student), regular: pct(state.params.r0.regular) });
  const [q, setQ] = useState(pct(state.params.q));
  const [curve, setCurve] = useState(state.params.arrivalCurve.map((p) => pct(p.f)));
  const [base, setBase] = useState(state.pricing.base);
  const [tiers, setTiers] = useState(state.pricing.tiers);
  const [timeRule, setTimeRule] = useState({ from: clock(state.pricing.timeRules[0].from), mult: state.pricing.timeRules[0].mult });
  const [draft, setDraft] = useState({ username: '', name: '', role: 'bouncer' as Role, password: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  if (role === 'bouncer') return <Navigate to="/porte" replace />;
  if (role === 'viewer') return <Navigate to="/tableau" replace />;

  const save = (key: string) => {
    setSaved(key);
    setTimeout(() => setSaved((s) => (s === key ? null : s)), 2000);
  };

  // Enregistrée seulement à la validation : une saisie en cours (2, 28…) ne doit pas déclencher d'alerte.
  const cap = (n: number) => {
    const c = clamp(Math.round(n) || 1, 1, 300);
    const apply = () => {
      setCapacity(c);
      setCapDraft(String(c));
    };
    if (c > DEFAULT_CAPACITY && c > state.capacity) {
      setConfirm({
        title: `Monter la capacité à ${c} ?`,
        message: "Au-delà de 255, seulement avec l'accord de la sécurité de l'école.",
        label: `Monter à ${c}`,
        onConfirm: apply,
        onCancel: () => setCapDraft(String(state.capacity)),
      });
    } else {
      apply();
    }
  };

  const toggleSales = (open: boolean) => {
    if (open) return setSalesOpen(true);
    setConfirm({
      title: 'Fermer toutes les ventes ?',
      message: "Plus aucune vente à la porte, sur tous les téléphones, jusqu'à la réouverture.",
      label: 'Fermer les ventes',
      onConfirm: () => setSalesOpen(false),
    });
  };

  const toggleForce = (force: boolean) => {
    if (!force) return setForceSales(false);
    setConfirm({
      title: 'Forcer les ventes ?',
      message: 'Les ventes resteront ouvertes même si les scans Hi.Events ne sont plus à jour. Faites d’abord un décompte de la salle.',
      label: 'Forcer les ventes',
      onConfirm: () => setForceSales(true),
    });
  };

  const validPrice = (p: number) => Number.isInteger(p) && p >= 1 && p <= 100;

  const paramsError = (() => {
    if (![r0.student, r0.regular].every((x) => x >= 1 && x <= 100)) return 'r₀ : entre 1 et 100 %.';
    if (curve.some((f, i) => i > 0 && f < curve[i - 1])) return 'La courbe doit être croissante (arrivées cumulées).';
    if (curve[curve.length - 1] !== 100) return 'La dernière heure doit être à 100 %.';
    return '';
  })();

  const pricingError = (() => {
    if (![base.student, base.other].every(validPrice)) return 'Prix de base : entiers de 1 à 100 $.';
    if (!tiers.every((t) => Number.isInteger(t.min) && t.min >= 1)) return 'V minimum : entier de 1 ou plus.';
    if (new Set(tiers.map((t) => t.min)).size !== tiers.length) return 'Chaque V minimum doit être différent.';
    if (!tiers.every((t) => t.mult > 0 && t.mult <= 5)) return 'Multiplicateurs de palier : entre 0,05 et 5.';
    if (!/^\d{2}:\d{2}$/.test(timeRule.from) || !(timeRule.mult > 0 && timeRule.mult <= 2)) {
      return 'Règle horaire : heure valide et multiplicateur entre 0,05 et 2.';
    }
    const mults = tiers.map((t) => t.mult);
    const highest = Math.max(base.student, base.other) * Math.max(...mults) * Math.max(1, timeRule.mult);
    const lowest = Math.min(base.student, base.other) * Math.min(...mults) * Math.min(1, timeRule.mult);
    if (Math.round(highest) > 100) return 'Le prix suggéré pourrait dépasser 100 $.';
    if (Math.round(lowest) < 1) return 'Le prix suggéré pourrait descendre sous 1 $.';
    return '';
  })();

  const saveParams = () => {
    setParams({
      r0: { student: r0.student / 100, regular: r0.regular / 100 },
      q: q / 100,
      arrivalCurve: state.params.arrivalCurve.map((p, i) => ({ t: p.t, f: curve[i] / 100 })),
    });
    save('params');
  };

  const savePricing = () => {
    setPricing({ base, tiers, timeRules: [{ from: localTimeToUtc(timeRule.from), mult: timeRule.mult }] });
    save('prices');
  };

  const auto = state.priceMode === 'auto';
  const lockDoor = (student: number, other: number) => {
    lockDoorPrices(student, other);
    setDoorDraft({ student, other });
    save('door');
  };

  const count = clamp(Math.round(num(amount)) || 0, 0, 50);
  const delta = sign * count;

  const stepAdjust = (by: number) => {
    const d = stepDelta(delta, by);
    setSign(d > 0 ? 1 : -1);
    setAmount(String(Math.abs(d)));
  };

  const applyAdjust = () => {
    record('adjust', { delta, reason: reason.trim() });
    setReason('');
    setAmount('1');
    save('adjust');
  };

  const createAccount = () => {
    const username = draft.username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{2,}$/.test(username)) return setError('Identifiant : lettres, chiffres, point, tiret (2 caractères minimum).');
    if (accounts.some((a) => a.username === username)) return setError('Cet identifiant existe déjà.');
    if (!draft.name.trim()) return setError('Le nom est requis.');
    if (draft.password.length < 6) return setError('Mot de passe : 6 caractères minimum.');
    setError('');
    addAccount({ username, name: draft.name.trim(), role: draft.role, password: draft.password })
      .then(() => {
        setDraft({ username: '', name: '', role: 'bouncer', password: '' });
        save('accounts');
      })
      .catch((e: { code?: string }) =>
        setError(e.code === 'auth/email-already-in-use' ? 'Cet identifiant existe déjà.' : 'La création du compte a échoué.'));
  };

  const linksError = [linksDraft.student, linksDraft.regular].every((l) => l.trim() === '' || CHECKIN_LINK.test(l.trim()))
    ? ''
    : 'Format attendu : https://app.hi.events/check-in/cil_… (ou champ vide).';

  const saveLinks = () => {
    setCheckinLinks({ student: linksDraft.student.trim(), regular: linksDraft.regular.trim() });
    save('links');
  };

  const adminCount = accounts.filter((a) => a.role === 'admin').length;
  const isLastAdmin = (a: Account) => a.role === 'admin' && adminCount === 1;

  return (
    <div className="page">
      <Nav />

      <div className="grid-2">
        <section className="card">
          <h2>Capacité et ventes</h2>
          <p className="desc">
            Nombre maximal de personnes dans la salle, staff inclus. Montez vers 300 seulement si la sécurité l'autorise.
            « Ventes ouvertes » coupe ou rouvre toutes les ventes à la porte. « Forcer » permet de vendre même si les scans
            Hi.Events ne sont plus à jour : à utiliser seulement après un décompte de la salle.
          </p>
          <div className="stepper">
            <button onClick={() => cap(state.capacity - 5)}>−5</button>
            <input
              type="number" inputMode="numeric" min={1} max={300} aria-label="Capacité"
              value={capDraft} onChange={(e) => setCapDraft(e.target.value)}
              onBlur={() => cap(num(capDraft))} onKeyDown={(e) => e.key === 'Enter' && cap(num(capDraft))}
            />
            <button onClick={() => cap(state.capacity + 5)}>+5</button>
          </div>
          <p className="hint">De 1 à 300 (maximum de la salle). Valeur par défaut : 255. Validez avec Entrée.</p>
          <label className="switch-row">
            Ventes ouvertes
            <input type="checkbox" className="switch" checked={state.salesOpen} onChange={(e) => toggleSales(e.target.checked)} />
          </label>
          <label className="switch-row">
            Forcer malgré des scans périmés
            <input type="checkbox" className="switch" checked={state.forceSales} onChange={(e) => toggleForce(e.target.checked)} />
          </label>
        </section>

        <section className="card">
          <h2>Prix à la porte</h2>
          <p className="desc">
            Prix demandés aux personnes sans billet. En mode <strong>Automatique</strong>, ils suivent la suggestion du
            moteur (places vendables et heure) sans aucune action. <strong>Figé</strong> garde un prix fixe jusqu'au retour
            en automatique. Les bouncers voient chaque changement.
          </p>
          <div className="segmented">
            <button className={auto ? 'active plus' : ''} onClick={() => setPriceMode('auto')}>Automatique</button>
            <button className={auto ? '' : 'active accent'} onClick={() => lockDoor(state.doorStudent, state.doorOther)}>Figé</button>
          </div>
          <p className="hint">
            À la porte maintenant : <strong>{state.doorStudent} $ · {state.doorOther} $</strong> ({auto ? 'automatique' : 'figé'})
            {!auto && state.suggested && ` · suggéré : ${state.suggested.student} $ · ${state.suggested.other} $`}
          </p>
          <div className="row">
            <label className="field">
              <span>Étudiant ($)</span>
              <input type="number" inputMode="numeric" min={1} max={100} value={doorDraft.student}
                onChange={(e) => setDoorDraft({ ...doorDraft, student: num(e.target.value) })} />
            </label>
            <label className="field">
              <span>Autre ($)</span>
              <input type="number" inputMode="numeric" min={1} max={100} value={doorDraft.other}
                onChange={(e) => setDoorDraft({ ...doorDraft, other: num(e.target.value) })} />
            </label>
          </div>
          <div className="card-actions">
            <button className="btn btn-primary" disabled={!validPrice(doorDraft.student) || !validPrice(doorDraft.other)}
              onClick={() => lockDoor(doorDraft.student, doorDraft.other)}>
              Figer ces prix
            </button>
            {saved === 'door' && <span className="saved">✓ Prix figés à la porte</span>}
          </div>
        </section>

        <section className="card">
          <h2>Ajustement du compte</h2>
          <p className="desc">
            Corrige le compteur de la salle quand il ne correspond plus à la réalité. Faites un décompte, choisissez
            d'ajouter ou de retirer, puis entrez la différence. Le motif est obligatoire et tout est inscrit au journal.
          </p>
          <div className="segmented">
            <button className={sign > 0 ? 'active plus' : ''} onClick={() => setSign(1)}>+ Ajouter</button>
            <button className={sign < 0 ? 'active minus' : ''} onClick={() => setSign(-1)}>− Retirer</button>
          </div>
          <div className="stepper">
            <button onClick={() => stepAdjust(-1)} aria-label="Diminuer">−</button>
            <input
              type="number" inputMode="numeric" min={1} max={50} aria-label="Nombre de personnes"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            <button onClick={() => stepAdjust(1)} aria-label="Augmenter">+</button>
          </div>
          <p className="hint">De 1 à 50 personnes.</p>
          <label className="field">
            <span>Motif</span>
            <input value={reason} maxLength={200} placeholder="Ex. : décompte de 23 h" onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="card-actions">
            <button className="btn btn-primary" disabled={!reason.trim() || count < 1} onClick={applyAdjust}>
              Appliquer {sign > 0 ? '+' : '−'}{count}
            </button>
            {saved === 'adjust' && <span className="saved">✓ Inscrit au journal</span>}
          </div>
        </section>

        <section className="card">
          <h2>Paramètres du moteur</h2>
          <p className="desc">
            Servent à estimer combien de détenteurs de billets vont encore arriver. <strong>Tout s'ajuste seul pendant la
            soirée</strong> : si les scans sont en retard sur la courbe, elle est décalée (les détenteurs sont supposés en
            retard, jusqu'à 2 h) ; si plus de monde arrive que prévu, r̂ monte ; si plus de gens reviennent que prévu, q̂
            monte. Les valeurs ci-dessous ne sont que le point de départ, à régler avant la soirée.
          </p>
          <div className="row">
            <label className="field">
              <span>r₀ de départ étudiant (%)</span>
              <input type="number" min={0} max={100} value={r0.student} onChange={(e) => setR0({ ...r0, student: clamp(num(e.target.value), 0, 100) })} />
            </label>
            <label className="field">
              <span>r₀ de départ régulier (%)</span>
              <input type="number" min={0} max={100} value={r0.regular} onChange={(e) => setR0({ ...r0, regular: clamp(num(e.target.value), 0, 100) })} />
            </label>
            <label className="field">
              <span>q de départ, retour (%)</span>
              <input type="number" min={0} max={100} value={q} onChange={(e) => setQ(clamp(num(e.target.value), 0, 100))} />
            </label>
          </div>
          <div className="learned">
            <span>Ajusté automatiquement</span>
            <strong>Retard détecté : {Math.round(state.delayMs / 60_000)} min</strong>
            <strong>r̂ étudiant : {pct(state.rHat.student)} % · r̂ régulier : {pct(state.rHat.regular)} %</strong>
            <strong>q̂ retour : {pct(state.qHat)} %</strong>
          </div>
          <table>
            <thead>
              <tr><th>Heure</th><th>Départ F (%)</th><th>Ajusté (%)</th></tr>
            </thead>
            <tbody>
              {CURVE_HOURS.map((h, i) => (
                <tr key={h}>
                  <td>{h}</td>
                  <td>
                    <input
                      className="cell-input" type="number" min={0} max={100} aria-label={`F à ${h}`}
                      value={curve[i]}
                      onChange={(e) => setCurve(curve.map((v, j) => (j === i ? clamp(num(e.target.value), 0, 100) : v)))}
                    />
                  </td>
                  <td className="adjusted">
                    {pct(arrivalFraction(state.params.arrivalCurve, state.params.arrivalCurve[i].t - state.delayMs))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {paramsError && <p className="error">{paramsError}</p>}
          <div className="card-actions">
            <button className="btn btn-sm" disabled={!!paramsError} onClick={saveParams}>Enregistrer</button>
            {saved === 'params' && <span className="saved">✓ Enregistré</span>}
          </div>
        </section>

        <section className="card">
          <h2>Calcul de la suggestion</h2>
          <p className="desc">
            Règles du prix suggéré : prix de base × multiplicateur selon les places vendables (V), puis × multiplicateur
            horaire en fin de soirée. Ne change pas les prix à la porte tant que vous ne les appliquez pas.
          </p>
          <div className="row">
            <label className="field">
              <span>Base étudiant ($)</span>
              <input type="number" min={1} value={base.student} onChange={(e) => setBase({ ...base, student: num(e.target.value) })} />
            </label>
            <label className="field">
              <span>Base autre ($)</span>
              <input type="number" min={1} value={base.other} onChange={(e) => setBase({ ...base, other: num(e.target.value) })} />
            </label>
          </div>
          <table>
            <thead>
              <tr><th>V minimum</th><th>Multiplicateur</th><th>Étudiant</th><th>Autre</th></tr>
            </thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i}>
                  <td>
                    <input className="cell-input" type="number" min={1} aria-label={`V minimum du palier ${i + 1}`} value={t.min}
                      onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, min: num(e.target.value) } : x)))} />
                  </td>
                  <td>
                    <input className="cell-input" type="number" step={0.05} min={0} aria-label={`Multiplicateur du palier ${i + 1}`} value={t.mult}
                      onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, mult: num(e.target.value) } : x)))} />
                  </td>
                  <td>{Math.round(base.student * t.mult)} $</td>
                  <td>{Math.round(base.other * t.mult)} $</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <label className="field">
              <span>Règle horaire : à partir de</span>
              <input type="time" value={timeRule.from} onChange={(e) => setTimeRule({ ...timeRule, from: e.target.value })} />
            </label>
            <label className="field">
              <span>Multiplicateur</span>
              <input type="number" step={0.05} min={0} value={timeRule.mult} onChange={(e) => setTimeRule({ ...timeRule, mult: num(e.target.value) })} />
            </label>
          </div>
          {pricingError && <p className="error">{pricingError}</p>}
          <div className="card-actions">
            <button className="btn btn-sm" disabled={!!pricingError} onClick={savePricing}>Enregistrer</button>
            {saved === 'prices' && <span className="saved">✓ Enregistré</span>}
          </div>
        </section>

        <section className="card wide">
          <h2>Journal <span className="muted">· 50 dernières entrées</span></h2>
          <p className="desc">
            Toutes les actions de la soirée, la plus récente en haut. « Annuler » retire l'effet d'une action faite par
            erreur (ex. une vente en double) ; l'annulation est elle-même inscrite au journal.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Heure</th><th>Utilisateur</th><th>Action</th><th>Détail</th><th /></tr>
              </thead>
              <tbody>
                {log.map((e) => (
                  <tr key={e.id} className={e.voided ? 'voided' : ''}>
                    <td>{e.time}</td>
                    <td>{e.user}</td>
                    <td>{TYPE_LABEL[e.type]}</td>
                    <td>{e.detail}</td>
                    <td className="cell-action">
                      {e.voided ? (
                        <span className="badge">Annulé</span>
                      ) : (
                        e.type !== 'void' && <button className="btn btn-sm" onClick={() => voidEntry(e.id)}>Annuler</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {role === 'admin' && (
          <section className="card wide">
            <h2>Liens de check-in</h2>
            <p className="desc">
              Liens des pages de check-in Hi.Events, affichés en boutons sur l'écran Porte. Ils permettent de valider des
              billets sans mot de passe : ils ne sont visibles que par les Admins, Managers et Bouncers, jamais dans le code.
            </p>
            <div className="row">
              <label className="field">
                <span>Lien check-in étudiant</span>
                <input type="url" value={linksDraft.student} placeholder="https://app.hi.events/check-in/cil_…"
                  onChange={(e) => setLinksDraft({ ...linksDraft, student: e.target.value })} />
              </label>
              <label className="field">
                <span>Lien check-in régulier</span>
                <input type="url" value={linksDraft.regular} placeholder="https://app.hi.events/check-in/cil_…"
                  onChange={(e) => setLinksDraft({ ...linksDraft, regular: e.target.value })} />
              </label>
            </div>
            {linksError && <p className="error">{linksError}</p>}
            <div className="card-actions">
              <button className="btn btn-primary" disabled={!!linksError} onClick={saveLinks}>Enregistrer les liens</button>
              {saved === 'links' && <span className="saved">✓ Liens enregistrés</span>}
            </div>
          </section>
        )}

        {role === 'admin' && (
          <section className="card wide">
            <h2>Comptes</h2>
            <p className="desc">
              Qui peut se connecter et ce qu'il peut faire. Bouncer : écran Porte. Viewer : tableau de bord en lecture.
              Manager : tout sauf les comptes. Mot de passe oublié : créez un nouveau compte et désactivez l'ancien.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th /></tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.uid}>
                      <td>{a.username}</td>
                      <td>{a.name}</td>
                      <td>
                        <select className="cell-input" style={{ width: 130, textAlign: 'left' }} value={a.role}
                          disabled={isLastAdmin(a)} onChange={(e) => setAccountRole(a.uid, e.target.value as AccountRole)}>
                          {ACCOUNT_ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                        </select>
                      </td>
                      <td className="cell-action">
                        {a.role === 'disabled' ? (
                          <span className="badge">Désactivé</span>
                        ) : (
                          <button className="btn btn-sm" disabled={isLastAdmin(a)} onClick={() => setAccountRole(a.uid, 'disabled')}>
                            Désactiver
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="hint">Le dernier Admin ne peut pas être modifié ni désactivé.</p>
            <h3>Créer un compte</h3>
            <div className="row">
              <label className="field">
                <span>Identifiant</span>
                <input value={draft.username} maxLength={30} autoCapitalize="none" onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
              </label>
              <label className="field">
                <span>Nom</span>
                <input value={draft.name} maxLength={50} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </label>
              <label className="field">
                <span>Rôle</span>
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                  {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Mot de passe</span>
                <input type="password" value={draft.password} autoComplete="new-password" onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <div className="card-actions">
              <button className="btn btn-primary" onClick={createAccount}>Créer le compte</button>
              {saved === 'accounts' && <span className="saved">✓ Compte créé</span>}
            </div>
          </section>
        )}
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.label}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => {
            confirm.onCancel?.();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
