// Moteur du PLAN §9 : fonction pure, aucune dépendance Firebase.

export const N0 = 30;
export const M0 = 20;
export const HALF_LIFE_MS = 20 * 60_000;
export const Z = 1.65;
export const STALE_MS = 60_000;
const HOUR_MS = 3_600_000;
export const MAX_DELAY_MS = 2 * HOUR_MS;

export type Kind = 'student' | 'regular';

export type Totals = {
  staff: number;
  saleStudent: number;
  saleOther: number;
  exit: number;
  reentry: number;
  adjust: number;
  exitW: number;
};

export type CurvePoint = { t: number; f: number };

export type Params = {
  r0: Record<Kind, number>;
  q: number;
  arrivalCurve: CurvePoint[];
};

export type Pricing = {
  base: { student: number; other: number };
  tiers: { min: number; mult: number }[];
  timeRules: { from: number; mult: number }[];
};

export type EngineInput = {
  now: number;
  doorsOpen: number;
  capacity: number;
  tickets: Record<Kind, number>;
  scanned: Record<Kind, number>;
  scansAgeMs: number;
  totals: Totals;
  salesOpen: boolean;
  forceSales: boolean;
  params: Params;
  pricing: Pricing;
};

export type SalesState = 'OUVERT' | 'FERMÉ' | 'SUSPENDU' | 'COMPLET';
export type Light = 'green' | 'yellow' | 'red';

export type EngineOutput = {
  occupancy: number;
  outside: number;
  expected: Record<Kind, number>;
  rHat: Record<Kind, number>;
  delayMs: number;
  qHat: number;
  returns: number;
  margin: number;
  reserve: number;
  sellable: number;
  expected1h: number;
  salesState: SalesState;
  light: Light;
  suggested: { student: number; other: number } | null;
};

export function arrivalFraction(curve: CurvePoint[], t: number): number {
  const pts = [...curve].sort((a, b) => a.t - b.t);
  if (pts.length === 0 || t > pts[pts.length - 1].t) return 1;
  if (t < pts[0].t) return 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (t <= b.t) return a.f + ((b.f - a.f) * (t - a.t)) / (b.t - a.t);
  }
  return pts[pts.length - 1].f;
}

// Premier instant où la courbe atteint `target`.
function timeAtFraction(curve: CurvePoint[], target: number): number {
  const pts = [...curve].sort((a, b) => a.t - b.t);
  if (target <= pts[0].f) return pts[0].t;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (b.f >= target) return b.f === a.f ? a.t : a.t + ((target - a.f) * (b.t - a.t)) / (b.f - a.f);
  }
  return pts[pts.length - 1].t;
}

// Hypothèse « retard » (§9) : des arrivées en retard sur la courbe la décalent, jamais l'inverse.
export function arrivalDelay(i: Pick<EngineInput, 'now' | 'tickets' | 'scanned' | 'params'>): number {
  const curve = i.params.arrivalCurve;
  const planned = i.tickets.student * i.params.r0.student + i.tickets.regular * i.params.r0.regular;
  if (curve.length === 0 || planned <= 0) return 0;
  const target = Math.min(1, (i.scanned.student + i.scanned.regular) / planned);
  if (arrivalFraction(curve, i.now) <= target) return 0;
  return Math.min(MAX_DELAY_MS, Math.max(0, i.now - timeAtFraction(curve, target)));
}

export function lightOf(v: number): Light {
  if (v >= 15) return 'green';
  if (v >= 1) return 'yellow';
  return 'red';
}

export function suggestedPrices(v: number, now: number, pricing: Pricing): EngineOutput['suggested'] {
  if (v < 1) return null;
  const tier = [...pricing.tiers].sort((a, b) => b.min - a.min).find((x) => v >= x.min);
  if (!tier) return null;
  const rule = [...pricing.timeRules].sort((a, b) => b.from - a.from).find((r) => now >= r.from);
  const multH = rule?.mult ?? 1;
  return {
    student: Math.round(pricing.base.student * tier.mult * multH),
    other: Math.round(pricing.base.other * tier.mult * multH),
  };
}

export function computeState(i: EngineInput): EngineOutput {
  const t = i.totals;
  const occupancy =
    i.scanned.student + i.scanned.regular + t.staff + t.saleStudent + t.saleOther + t.reentry + t.adjust - t.exit;

  const delayMs = arrivalDelay(i);
  const F = arrivalFraction(i.params.arrivalCurve, i.now - delayMs);
  const F1 = arrivalFraction(i.params.arrivalCurve, i.now + HOUR_MS - delayMs);
  const expected: Record<Kind, number> = { student: 0, regular: 0 };
  const rHat: Record<Kind, number> = { student: 0, regular: 0 };
  let variance = 0;
  let expected1h = 0;

  for (const k of ['student', 'regular'] as const) {
    const T = i.tickets[k];
    const S = i.scanned[k];
    const r0 = i.params.r0[k];
    const U = Math.max(0, T - S);
    const r = Math.min(1, Math.max(r0, (S + N0 * r0) / (T * F + N0)));
    rHat[k] = r;
    if (F >= 1) continue;
    const denom = 1 - r * F;
    const p = (r * (1 - F)) / denom;
    expected[k] = U * p;
    variance += U * p * (1 - p);
    expected1h += (U * r * (F1 - F)) / denom;
  }

  const outside = Math.max(0, t.exit - t.reentry);
  // Sorties encore « en attente de retour » (poids décroissant) vs sorties dont le retour aurait déjà dû se voir.
  const pending = t.exitW * 2 ** (-(i.now - i.doorsOpen) / HALF_LIFE_MS);
  const matured = Math.max(0, t.exit - pending);
  const qHat = Math.min(1, Math.max(i.params.q, (t.reentry + M0 * i.params.q) / (matured + M0)));
  const returns = Math.min(outside, qHat * pending);
  variance += returns;

  const margin = Z * Math.sqrt(variance);
  const reserve = expected.student + expected.regular + returns + margin;
  const sellable = Math.floor(i.capacity - occupancy - reserve);

  let salesState: SalesState = 'OUVERT';
  if (!i.salesOpen) salesState = 'FERMÉ';
  else if (i.scansAgeMs > STALE_MS && !i.forceSales) salesState = 'SUSPENDU';
  else if (sellable <= 0) salesState = 'COMPLET';

  return {
    occupancy,
    outside,
    expected,
    rHat,
    delayMs,
    qHat,
    returns,
    margin,
    reserve,
    sellable,
    expected1h,
    salesState,
    light: lightOf(sellable),
    suggested: suggestedPrices(sellable, i.now, i.pricing),
  };
}
