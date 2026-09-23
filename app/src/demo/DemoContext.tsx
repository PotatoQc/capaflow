import { createContext, useContext, useState, type ReactNode } from 'react';
import { computeState, type EngineOutput, type Params, type Pricing, type Totals } from '../engine/computeState';
import {
  DEFAULT_CAPACITY, DEFAULT_PARAMS, DEFAULT_PRICING, DOORS_OPEN, TICKETS, clock, exitWeight, scenarios, type Role,
} from './scenarios';

export type OpType = 'staff' | 'sale' | 'exit' | 'reentry' | 'adjust' | 'void';

export type Sale = { student: number; other: number; priceStudent: number; priceOther: number };

export const TYPE_LABEL: Record<OpType, string> = {
  staff: 'Staff',
  sale: 'Vente',
  exit: 'Sortie',
  reentry: 'Réentrée',
  adjust: 'Ajustement',
  void: 'Annulation',
};

type Effect = Totals & { revenue: number };

const NONE: Effect = { staff: 0, saleStudent: 0, saleOther: 0, exit: 0, reentry: 0, adjust: 0, exitW: 0, revenue: 0 };
const KEYS = Object.keys(NONE) as (keyof Effect)[];

function combine(a: Effect, b: Effect, sign: 1 | -1): Effect {
  const r = { ...a };
  for (const k of KEYS) r[k] = a[k] + sign * b[k];
  return r;
}

export function saleTotal(s: Sale): number {
  return s.student * s.priceStudent + s.other * s.priceOther;
}

function saleDetail(s: Sale): string {
  const parts = [
    s.student && `${s.student} étu × ${s.priceStudent} $`,
    s.other && `${s.other} autre × ${s.priceOther} $`,
  ].filter(Boolean);
  return `${parts.join(' + ')} = ${saleTotal(s)} $`;
}

const NO_SALE: Sale = { student: 0, other: 0, priceStudent: 0, priceOther: 0 };

function effectOf(type: OpType, delta: number, w: number, sale: Sale = NO_SALE): Effect {
  switch (type) {
    case 'staff': return { ...NONE, staff: 1 };
    case 'sale': return { ...NONE, saleStudent: sale.student, saleOther: sale.other, revenue: saleTotal(sale) };
    case 'exit': return { ...NONE, exit: 1, exitW: w };
    case 'reentry': return { ...NONE, reentry: 1 };
    case 'adjust': return { ...NONE, adjust: delta };
    case 'void': return NONE;
  }
}

export type LogEntry = {
  id: string;
  time: string;
  user: string;
  type: OpType;
  detail: string;
  voided: boolean;
  effect: Effect;
};

const USER: Record<Role, string> = { admin: 'admin', manager: 'manager1', bouncer: 'porte1', viewer: 'securite' };

function entry(time: string, user: string, type: OpType, detail: string, effect: Effect): LogEntry {
  return { id: Math.random().toString(36).slice(2, 10), time, user, type, detail, voided: false, effect };
}

function seedLog(): LogEntry[] {
  const w = exitWeight(Date.UTC(2026, 8, 26, 2, 57));
  const oneStudent: Sale = { student: 1, other: 0, priceStudent: 8, priceOther: 23 };
  const oneOther: Sale = { student: 0, other: 1, priceStudent: 8, priceOther: 23 };
  return [
    entry('22:58', 'porte1', 'sale', saleDetail(oneStudent), effectOf('sale', 0, 0, oneStudent)),
    entry('22:57', 'porte2', 'exit', '', effectOf('exit', 0, w)),
    entry('22:55', 'porte1', 'reentry', '', effectOf('reentry', 0, 0)),
    entry('22:52', 'porte2', 'sale', saleDetail(oneOther), effectOf('sale', 0, 0, oneOther)),
    entry('22:49', 'manager1', 'adjust', '+2 · décompte de la salle', effectOf('adjust', 2, 0)),
    entry('22:41', 'porte1', 'staff', '', effectOf('staff', 0, 0)),
  ];
}

export type PriceMode = 'auto' | 'locked';

export type CheckinLinks = { student: string; regular: string };

export type DemoState = EngineOutput & {
  priceMode: PriceMode;
  checkinLinks: CheckinLinks;
  capacity: number;
  clock: string;
  scanned: { student: number; regular: number };
  revenue: number;
  scanAgeS: number;
  salesOpen: boolean;
  forceSales: boolean;
  online: boolean;
  pending: number;
  doorStudent: number;
  doorOther: number;
  params: Params;
  pricing: Pricing;
};

type Demo = {
  role: Role;
  setRole: (r: Role) => void;
  scenarioId: string;
  setScenarioId: (id: string) => void;
  state: DemoState;
  log: LogEntry[];
  record: (type: OpType, opts?: { sale?: Sale; delta?: number; reason?: string }) => string;
  voidEntry: (id: string) => void;
  setCapacity: (c: number) => void;
  setSalesOpen: (b: boolean) => void;
  setForceSales: (b: boolean) => void;
  lockDoorPrices: (student: number, other: number) => void;
  setPriceMode: (m: PriceMode) => void;
  setCheckinLinks: (links: CheckinLinks) => void;
  setParams: (p: Params) => void;
  setPricing: (p: Pricing) => void;
};

const DemoContext = createContext<Demo | null>(null);

type Overrides = { capacity?: number; salesOpen?: boolean; forceSales?: boolean };

export function DemoProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('manager');
  const [scenarioId, setId] = useState('e2');
  const [overrides, setOverrides] = useState<Overrides>({});
  const [delta, setDelta] = useState<Effect>(NONE);
  const [log, setLog] = useState<LogEntry[]>(seedLog);
  const [door, setDoor] = useState({ student: 5, other: 15 });
  const [priceMode, setPriceMode] = useState<PriceMode>('auto');
  const [checkinLinks, setCheckinLinks] = useState<CheckinLinks>({ student: '', regular: '' });
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);

  const base = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const capacity = overrides.capacity ?? DEFAULT_CAPACITY;
  const salesOpen = overrides.salesOpen ?? base.salesOpen;
  const forceSales = overrides.forceSales ?? base.forceSales;
  const { revenue, ...totals } = combine({ ...base.totals, revenue: base.revenue }, delta, 1);

  const out = computeState({
    now: base.now,
    doorsOpen: DOORS_OPEN,
    capacity,
    tickets: TICKETS,
    scanned: base.scanned,
    scansAgeMs: base.scanAgeS * 1000,
    totals,
    salesOpen,
    forceSales,
    params,
    pricing,
  });

  const applied = priceMode === 'auto' && out.suggested ? out.suggested : door;

  const state: DemoState = {
    ...out,
    priceMode,
    checkinLinks,
    capacity,
    clock: clock(base.now),
    scanned: base.scanned,
    revenue,
    scanAgeS: base.scanAgeS,
    salesOpen,
    forceSales,
    online: base.online,
    pending: base.pending,
    doorStudent: applied.student,
    doorOther: applied.other,
    params,
    pricing,
  };

  const value: Demo = {
    role,
    setRole,
    scenarioId,
    setScenarioId: (id) => {
      setId(id);
      setOverrides({});
      setDelta(NONE);
      setLog(seedLog());
    },
    state,
    log,
    record: (type, opts = {}) => {
      const d = opts.delta ?? 0;
      const detail = opts.sale ? saleDetail(opts.sale) : type === 'adjust' ? `${d > 0 ? '+' : ''}${d} · ${opts.reason ?? ''}` : '';
      const e = entry(clock(base.now), USER[role], type, detail, effectOf(type, d, exitWeight(base.now), opts.sale));
      setLog((l) => [e, ...l].slice(0, 50));
      setDelta((x) => combine(x, e.effect, 1));
      return e.id;
    },
    voidEntry: (id) => {
      const target = log.find((x) => x.id === id);
      if (!target || target.voided || target.type === 'void') return;
      const v = { ...entry(clock(base.now), USER[role], 'void', `${TYPE_LABEL[target.type]} de ${target.user}`, NONE), id: `void_${id}` };
      setLog((l) => [v, ...l.map((x) => (x.id === id ? { ...x, voided: true } : x))].slice(0, 50));
      setDelta((x) => combine(x, target.effect, -1));
    },
    setCapacity: (c) => setOverrides((o) => ({ ...o, capacity: c })),
    setSalesOpen: (b) => setOverrides((o) => ({ ...o, salesOpen: b })),
    setForceSales: (b) => setOverrides((o) => ({ ...o, forceSales: b })),
    lockDoorPrices: (student, other) => {
      setDoor({ student, other });
      setPriceMode('locked');
    },
    setPriceMode,
    setCheckinLinks,
    setParams,
    setPricing,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): Demo {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo doit être utilisé dans DemoProvider');
  return ctx;
}
