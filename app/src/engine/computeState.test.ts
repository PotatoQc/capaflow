import { describe, expect, it } from 'vitest';
import { computeState, suggestedPrices, type EngineInput, type Pricing, type Totals } from './computeState';

const at = (d: number, h: number, m = 0) => Date.UTC(2026, 8, d, h, m);
const DOORS = at(25, 23);

const PRICING: Pricing = {
  base: { student: 5, other: 15 },
  tiers: [
    { min: 30, mult: 1 },
    { min: 15, mult: 1.25 },
    { min: 5, mult: 1.5 },
    { min: 1, mult: 2 },
  ],
  timeRules: [{ from: at(26, 5), mult: 0.8 }],
};

const ZERO: Totals = { staff: 0, saleStudent: 0, saleOther: 0, exit: 0, reentry: 0, adjust: 0, exitW: 0 };

const BASE: EngineInput = {
  now: DOORS,
  doorsOpen: DOORS,
  capacity: 255,
  tickets: { student: 166, regular: 89 },
  scanned: { student: 0, regular: 0 },
  scansAgeMs: 10_000,
  totals: ZERO,
  salesOpen: true,
  forceSales: false,
  params: {
    r0: { student: 0.75, regular: 0.95 },
    q: 0.7,
    arrivalCurve: [
      { t: at(25, 23), f: 0 },
      { t: at(26, 0), f: 0.1 },
      { t: at(26, 1), f: 0.3 },
      { t: at(26, 2), f: 0.6 },
      { t: at(26, 3), f: 0.85 },
      { t: at(26, 4), f: 0.95 },
      { t: at(26, 5), f: 0.98 },
      { t: at(26, 6), f: 1 },
    ],
  },
  pricing: PRICING,
};

const run = (o: Partial<EngineInput>, totals: Partial<Totals> = {}) =>
  computeState({ ...BASE, ...o, totals: { ...ZERO, ...totals } });

const E2_TOTALS: Partial<Totals> = { staff: 20, saleStudent: 20, saleOther: 5, exit: 25, exitW: 12 * 2 ** 12 };
const E2: Partial<EngineInput> = { now: at(26, 3), scanned: { student: 100, regular: 75 } };

describe('computeState — scénarios du PLAN §9', () => {
  it('E1 : ouverture à 19:00 avec 20 staff', () => {
    const r = run({}, { staff: 20 });
    expect(r.reserve).toBeCloseTo(218.86, 2);
    expect(r.sellable).toBe(16);
    expect(r.suggested).toEqual({ student: 6, other: 19 });
    expect(r.light).toBe('green');
  });

  it('E2 : 23:00 achalandé, léger retard détecté', () => {
    const r = run(E2, E2_TOTALS);
    expect(r.occupancy).toBe(195);
    expect(r.delayMs / 60_000).toBeCloseTo(3.1, 1);
    expect(r.expected.student).toBeCloseTo(21.66, 1);
    expect(r.expected.regular).toBeCloseTo(13.21, 1);
    expect(r.returns).toBeCloseTo(8.4, 6);
    expect(r.margin).toBeCloseTo(8.03, 1);
    expect(r.sellable).toBe(8);
    expect(r.suggested).toEqual({ student: 8, other: 23 });
    expect(r.light).toBe('yellow');
    expect(r.expected1h).toBeCloseTo(23.1, 0);
  });

  it('E3 : 01:30, fin de soirée avec règle horaire', () => {
    const r = run(
      { now: at(26, 5, 30), scanned: { student: 120, regular: 85 } },
      { staff: 20, saleStudent: 15, saleOther: 5, exit: 100, reentry: 60, exitW: 10 * 2 ** 19.5 },
    );
    expect(r.occupancy).toBe(205);
    expect(r.delayMs / 60_000).toBeCloseTo(28.1, 0);
    expect(r.returns).toBeCloseTo(7, 6);
    expect(r.sellable).toBe(33);
    expect(r.suggested).toEqual({ student: 4, other: 12 });
  });

  it('E4 : comme E2 avec 31 staff → complet', () => {
    const r = run(E2, { ...E2_TOTALS, staff: 31 });
    expect(r.occupancy).toBe(206);
    expect(r.sellable).toBe(-3);
    expect(r.salesState).toBe('COMPLET');
    expect(r.suggested).toBeNull();
  });

  it('E5 : scans périmés → SUSPENDU, sauf forçage', () => {
    expect(run({ ...E2, scansAgeMs: 61_000 }, E2_TOTALS).salesState).toBe('SUSPENDU');
    expect(run({ ...E2, scansAgeMs: 61_000, forceSales: true }, E2_TOTALS).salesState).toBe('OUVERT');
  });

  it('E6 : après 02:00 (F = 1) avec r̂ = 1, aucune division par zéro', () => {
    const r = run({
      now: at(26, 6, 30),
      scanned: { student: 166, regular: 89 },
      params: { ...BASE.params, r0: { student: 1, regular: 1 } },
    });
    expect(r.delayMs).toBe(0);
    expect(r.expected).toEqual({ student: 0, regular: 0 });
    expect(r.expected1h).toBe(0);
    expect(Number.isFinite(r.reserve)).toBe(true);
  });

  it('E8 : aucun scan à 22:00 → retard plafonné à 2 h (courbe lue à 20:00)', () => {
    const r = run({ now: at(26, 2) });
    expect(r.delayMs).toBe(2 * 3_600_000);
    expect(r.rHat).toEqual({ student: 0.75, regular: 0.95 });
  });

  it('E10 : beaucoup de réentrées → q̂ monte ; peu de réentrées → q̂ reste à q', () => {
    const many = run(E2, { ...E2_TOTALS, exit: 50, reentry: 45, exitW: 2 * 2 ** 12 });
    expect(many.qHat).toBeCloseTo((45 + 20 * 0.7) / (48 + 20), 6);
    expect(run(E2, E2_TOTALS).qHat).toBe(0.7);
  });

  it('E9 : arrivées en avance → aucun retard, r̂ monte', () => {
    const r = run({ ...E2, scanned: { student: 150, regular: 88 } }, E2_TOTALS);
    expect(r.delayMs).toBe(0);
    expect(r.rHat.student).toBeGreaterThan(0.75);
  });

  it('E7 : S > T → aucun attendu négatif', () => {
    const r = run({ ...E2, scanned: { student: 170, regular: 75 } }, E2_TOTALS);
    expect(r.expected.student).toBe(0);
  });
});

describe('suggestedPrices — table des prix du PLAN §9', () => {
  const before = at(26, 3);
  const after = at(26, 5, 30);
  it.each([
    [30, before, { student: 5, other: 15 }],
    [15, before, { student: 6, other: 19 }],
    [5, before, { student: 8, other: 23 }],
    [1, before, { student: 10, other: 30 }],
    [30, after, { student: 4, other: 12 }],
    [15, after, { student: 5, other: 15 }],
    [5, after, { student: 6, other: 18 }],
    [1, after, { student: 8, other: 24 }],
  ])('V = %i', (v, now, expected) => {
    expect(suggestedPrices(v, now, PRICING)).toEqual(expected);
  });

  it('V ≤ 0 → ventes fermées', () => {
    expect(suggestedPrices(0, before, PRICING)).toBeNull();
  });
});
