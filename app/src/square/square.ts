import { saleTotal, type Sale } from '../data/AppContext';

// Paiement par l'app Square Point of Sale (PLAN §6.1) : « Point of Sale API » pour le web mobile.
// L'app ouvre Square avec le montant, Square revient sur l'adresse de retour avec le résultat, et la vente
// en attente (gardée dans le téléphone, car la page est rechargée) n'est enregistrée que si le paiement a réussi.

const KEY = 'se.squarePending';
const MAX_AGE_MS = 15 * 60_000;

export const APP_ID = /^sq0id[a-z]-[A-Za-z0-9_-]{10,}$/;

export type SquareReturn = { ok: true; txn?: string } | { ok: false; error: string };
type Pending = { sale: Sale; at: number };

export const callbackUrl = () => `${window.location.origin}/`;

export function squareUrl(appId: string, sale: Sale, android: boolean): string {
  const cents = saleTotal(sale) * 100;
  if (android) {
    const cb = callbackUrl();
    return [
      'intent:#Intent',
      'action=com.squareup.pos.action.CHARGE',
      'package=com.squareup',
      `S.browser_fallback_url=${cb}`,
      `S.com.squareup.pos.WEB_CALLBACK_URI=${cb}`,
      `S.com.squareup.pos.CLIENT_ID=${appId}`,
      'S.com.squareup.pos.API_VERSION=v2.1',
      `i.com.squareup.pos.TOTAL_AMOUNT=${cents}`,
      'S.com.squareup.pos.CURRENCY_CODE=CAD',
      'S.com.squareup.pos.TENDER_TYPES=com.squareup.pos.TENDER_CARD,com.squareup.pos.TENDER_CASH',
      'end',
    ].join(';');
  }
  const data = {
    amount_money: { amount: String(cents), currency_code: 'CAD' },
    callback_url: callbackUrl(),
    client_id: appId,
    version: '1.3',
    notes: `Neon Party · ${sale.student} étudiant · ${sale.other} autre`,
    options: { supported_tender_types: ['CARD_FROM_READER', 'KEYED_IN_CARD', 'CASH'] },
  };
  return `square-commerce-v1://payment/create?data=${encodeURIComponent(JSON.stringify(data))}`;
}

export const isAndroid = () => /android/i.test(navigator.userAgent);

export function savePending(sale: Sale) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sale, at: Date.now() } satisfies Pending));
  } catch {
    // Stockage bloqué : la vente ne pourra pas être enregistrée automatiquement (message au retour).
  }
}

// Lit et efface la vente en attente (une seule fois), si elle a moins de 15 min.
export function takePending(): Sale | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Pending;
    return Date.now() - p.at <= MAX_AGE_MS ? p.sale : null;
  } catch {
    return null;
  }
}

// Paiements déjà traités (identifiant de transaction Square) : une adresse de retour rouverte ne recompte rien.
const DONE_KEY = 'se.squareDone';
const readDone = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
export const isDone = (txn: string) => readDone().includes(txn);
export function markDone(txn: string) {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...readDone(), txn].slice(-20)));
  } catch {
    // Stockage bloqué : sans effet.
  }
}

// Résultat renvoyé par Square dans l'adresse de retour : iOS (paramètre data en JSON) ou Android (paramètres séparés).
export function readReturn(search: string): SquareReturn | null {
  const q = new URLSearchParams(search);
  const data = q.get('data');
  if (data !== null) {
    try {
      const d = JSON.parse(data) as Record<string, string>;
      return d.error_code ? { ok: false, error: d.error_code } : { ok: true, txn: d.client_transaction_id ?? d.transaction_id };
    } catch {
      return { ok: false, error: 'réponse illisible' };
    }
  }
  const error = q.get('com.squareup.pos.ERROR_CODE');
  if (error) return { ok: false, error };
  const txn = q.get('com.squareup.pos.CLIENT_TRANSACTION_ID') ?? q.get('com.squareup.pos.SERVER_TRANSACTION_ID');
  return txn !== null ? { ok: true, txn } : null;
}
