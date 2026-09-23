import {
  Timestamp, doc, getDoc, increment, serverTimestamp, setDoc, writeBatch, type Firestore, type WriteBatch,
} from 'firebase/firestore';

export const EVENT_ID = 'neon-party';

export type Qty = { student: number; other: number };

// Opérations du PLAN §7, telles qu'enregistrées dans le journal (sans uid ni heures).
export type Op =
  | { type: 'staff' }
  | { type: 'reentry' }
  | { type: 'exit'; w: number }
  | { type: 'sale'; qty: Qty; prices: Qty }
  | { type: 'adjust'; delta: number; reason: string };

export type VoidOp = { type: 'void'; ref: string; original: Op };

export const ZERO_SHARD = { staff: 0, saleStudent: 0, saleOther: 0, exit: 0, reentry: 0, adjust: 0, exitW: 0, lastOp: '' };

export const saleAmount = (op: { qty: Qty; prices: Qty }) =>
  op.qty.student * op.prices.student + op.qty.other * op.prices.other;

export const eventDoc = (db: Firestore) => doc(db, 'events', EVENT_ID);
export const configDoc = (db: Firestore) => doc(db, 'events', EVENT_ID, 'private', 'config');
export const shardDoc = (db: Firestore, uid: string) => doc(db, 'events', EVENT_ID, 'shards', uid);
export const moneyDoc = (db: Firestore, uid: string) => doc(db, 'events', EVENT_ID, 'money', uid);
export const logDoc = (db: Firestore, id: string) => doc(db, 'events', EVENT_ID, 'log', id);

// Crée à zéro le compteur et les revenus de l'utilisateur s'ils n'existent pas (PLAN §7).
export async function ensureCounters(db: Firestore, uid: string) {
  if (!(await getDoc(shardDoc(db, uid))).exists()) await setDoc(shardDoc(db, uid), ZERO_SHARD);
  if (!(await getDoc(moneyDoc(db, uid))).exists()) await setDoc(moneyDoc(db, uid), { revenue: 0, lastOp: '' });
}

function counterIncrements(op: Op, s: 1 | -1): Record<string, ReturnType<typeof increment>> {
  switch (op.type) {
    case 'staff': return { staff: increment(s) };
    case 'reentry': return { reentry: increment(s) };
    case 'exit': return { exit: increment(s), exitW: increment(s * op.w) };
    case 'sale': return { saleStudent: increment(s * op.qty.student), saleOther: increment(s * op.qty.other) };
    case 'adjust': return { adjust: increment(s * op.delta) };
  }
}

// 1 action = 1 lot atomique : journal (création seule) + son propre compteur (+ ses revenus pour une vente).
// Le journal ne se modifie jamais : un lot rejoué est refusé en entier par les règles.
export function buildOp(db: Firestore, uid: string, op: Op | VoidOp, opId: string = crypto.randomUUID()) {
  const id = op.type === 'void' ? `void_${op.ref}` : opId;
  const base = op.type === 'void' ? op.original : op;
  const s = op.type === 'void' ? -1 : 1;
  const logged = op.type === 'void' ? { type: 'void', ref: op.ref } : op;

  const batch: WriteBatch = writeBatch(db);
  batch.set(logDoc(db, id), { ...logged, uid, at: serverTimestamp(), clientAt: Timestamp.now() });
  batch.update(shardDoc(db, uid), { ...counterIncrements(base, s), lastOp: id });
  if (base.type === 'sale') batch.update(moneyDoc(db, uid), { revenue: increment(s * saleAmount(base)), lastOp: id });
  return { batch, id };
}
