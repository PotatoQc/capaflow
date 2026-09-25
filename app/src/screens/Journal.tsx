import { Navigate } from 'react-router-dom';
import Nav from './Nav';
import { TYPE_LABEL, useApp } from '../data/AppContext';

// Journal de la soirée (PLAN §6.4) : page à part, Manager et Admin.
export default function Journal() {
  const { role, log, voidEntry } = useApp();
  if (role === 'bouncer') return <Navigate to="/porte" replace />;
  if (role === 'viewer') return <Navigate to="/tableau" replace />;

  return (
    <div className="page">
      <Nav />
      <section className="card">
        <h2>Journal <span className="muted">· 50 dernières entrées</span></h2>
        <p className="desc">
          Toutes les actions de la soirée, la plus récente en haut. « Annuler » retire l'effet d'une action faite par
          erreur (ex. une vente en double) ; l'annulation est elle-même inscrite au journal.
        </p>
        {log.length === 0 ? (
          <p className="hint">Aucune action pour l'instant.</p>
        ) : (
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
        )}
      </section>
    </div>
  );
}
