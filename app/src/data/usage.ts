// Consommation Firestore estimée (PLAN §6.3) : chaque appareil compte ses lectures (documents reçus du serveur)
// et ses écritures, puis les publie dans /events/{id}/usage/{uid}. Gestion additionne tous les appareils.
// Quotas gratuits Spark par jour ; remise à zéro à minuit, heure du Pacifique (03:00 à Montréal).

export const LIMITS = { reads: 50_000, writes: 20_000, deletes: 20_000 } as const;
export const WARN = 0.7;
export const DANGER = 0.9;

export type Usage = { reads: number; writes: number; deletes: number };
type Stored = Usage & { day: string };

const KEY = 'se.usage';
const ZERO: Usage = { reads: 0, writes: 0, deletes: 0 };

// Jour de quota Google (AAAA-MM-JJ, heure du Pacifique).
export const quotaDay = (t = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(t);

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (s && s.day === quotaDay()) return s;
  } catch {
    // Stockage illisible : on repart de zéro.
  }
  return { ...ZERO, day: quotaDay() };
}

let current = load();

function bump(key: keyof Usage, n: number) {
  if (n <= 0) return;
  if (current.day !== quotaDay()) current = { ...ZERO, day: quotaDay() };
  current = { ...current, [key]: current[key] + n };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Stockage bloqué : le compte reste en mémoire.
  }
}

export const addReads = (n: number) => bump('reads', n);
export const addWrites = (n: number) => bump('writes', n);
export const addDeletes = (n: number) => bump('deletes', n);
export const myUsage = (): Stored => (current.day === quotaDay() ? current : { ...ZERO, day: quotaDay() });

// Lectures facturées d'un instantané : documents venus du serveur (pas du cache local).
export function countSnapshot(s: { metadata: { fromCache: boolean }; docChanges?: () => unknown[] }) {
  if (s.metadata.fromCache) return;
  addReads(s.docChanges ? s.docChanges().length : 1);
}

// Somme des appareils pour le jour de quota courant.
export function sumUsage(docs: (Usage & { day: string })[]): Usage {
  const day = quotaDay();
  return docs
    .filter((d) => d.day === day)
    .reduce((a, d) => ({ reads: a.reads + d.reads, writes: a.writes + d.writes, deletes: a.deletes + d.deletes }), { ...ZERO });
}

// Part la plus élevée des trois quotas (0 à 1+).
export const worstRatio = (u: Usage) => Math.max(u.reads / LIMITS.reads, u.writes / LIMITS.writes, u.deletes / LIMITS.deletes);
