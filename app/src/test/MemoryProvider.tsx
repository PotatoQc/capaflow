import { useState, type ReactNode } from 'react';
import {
  AppContext, TYPE_LABEL, saleDetail, saleTotal, type Account, type AppApi, type CheckinLinks, type SquareConfig, type LogEntry, type OpType,
  type PriceMode, type Sale,
} from '../data/AppContext';
import {
  DEFAULT_CAPACITY, DEFAULT_PARAMS, DEFAULT_PRICING, DOORS_OPEN, TICKETS, clock, exitWeight, type AccountRole, type Role,
} from '../data/event';
import { computeState, type Params, type Pricing, type Totals } from '../engine/computeState';

// Fournisseur en mémoire, pour les tests d'écran seulement : scénario E2 du PLAN §9 (23:00, 195 personnes).
const NOW = Date.UTC(2026, 8, 26, 3);
const SCANNED = { student: 100, regular: 75 };
const BASE: Totals = { staff: 20, saleStudent: 20, saleOther: 5, exit: 25, reentry: 0, adjust: 0, exitW: 12 * 2 ** 12 };

type Effect = Totals & { revenue: number };
const NONE: Effect = { staff: 0, saleStudent: 0, saleOther: 0, exit: 0, reentry: 0, adjust: 0, exitW: 0, revenue: 0 };

const combine = (a: Effect, b: Effect, sign: 1 | -1) =>
  Object.fromEntries(Object.keys(a).map((k) => [k, a[k as keyof Effect] + sign * b[k as keyof Effect]])) as Effect;

function effectOf(type: OpType, delta: number, sale?: Sale): Effect {
  switch (type) {
    case 'staff': return { ...NONE, staff: 1 };
    case 'staffOut': return { ...NONE, staff: -1 };
    case 'sale': return sale ? { ...NONE, saleStudent: sale.student, saleOther: sale.other, revenue: saleTotal(sale) } : NONE;
    case 'exit': return { ...NONE, exit: 1, exitW: exitWeight(NOW) };
    case 'reentry': return { ...NONE, reentry: 1 };
    case 'adjust': return { ...NONE, adjust: delta };
    case 'void': return NONE;
  }
}

const SEED_ACCOUNTS: Account[] = [
  { uid: 'u1', username: 'admin', name: 'Organisateur', role: 'admin' },
  { uid: 'u2', username: 'manager1', name: 'Responsable de salle', role: 'manager' },
  { uid: 'u3', username: 'porte1', name: 'Porte principale', role: 'bouncer' },
];

export function MemoryProvider({ role = 'manager', children }: { role?: Role; children: ReactNode }) {
  const [delta, setDelta] = useState<Effect>(NONE);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [effects, setEffects] = useState<Record<string, Effect>>({});
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY);
  const [salesOpen, setSalesOpen] = useState(true);
  const [forceSales, setForceSales] = useState(false);
  const [door, setDoor] = useState(DEFAULT_PRICING.base);
  const [priceMode, setPriceMode] = useState<PriceMode>('auto');
  const [checkinLinks, setCheckinLinks] = useState<CheckinLinks>({ student: '', regular: '' });
  const [square, setSquare] = useState<SquareConfig>({ enabled: false, appId: '' });
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [pricing, setPricing] = useState<Pricing>(DEFAULT_PRICING);
  const [accounts, setAccounts] = useState<Account[]>(SEED_ACCOUNTS);

  const { revenue, ...totals } = combine({ ...BASE, revenue: 175 }, delta, 1);
  const out = computeState({
    now: NOW, doorsOpen: DOORS_OPEN, capacity, tickets: TICKETS, scanned: SCANNED, scansAgeMs: 12_000,
    totals, salesOpen, forceSales, params, pricing,
  });
  const applied = priceMode === 'auto' && out.suggested ? out.suggested : door;

  const api: AppApi = {
    role,
    state: {
      ...out, priceMode, checkinLinks, square, capacity, clock: clock(NOW), scanned: SCANNED, revenue, staff: totals.staff, scanAgeS: 12,
      salesOpen, forceSales, online: true, pending: 0, doorStudent: applied.student, doorOther: applied.other, params, pricing,
    },
    log,
    accounts,
    record: (type, opts = {}) => {
      const id = `op${log.length + 1}`;
      const effect = effectOf(type, opts.delta ?? 0, opts.sale);
      const detail = opts.sale ? saleDetail(opts.sale) : '';
      setLog((l) => [{ id, time: clock(NOW), user: 'test', type, detail, voided: false }, ...l]);
      setEffects((e) => ({ ...e, [id]: effect }));
      setDelta((d) => combine(d, effect, 1));
      return id;
    },
    voidEntry: (id) => {
      const effect = effects[id];
      if (!effect) return;
      setLog((l) => [
        { id: `void_${id}`, time: clock(NOW), user: 'test', type: 'void', detail: TYPE_LABEL.void, voided: false },
        ...l.map((x) => (x.id === id ? { ...x, voided: true } : x)),
      ]);
      setDelta((d) => combine(d, effect, -1));
    },
    setCapacity,
    setSalesOpen,
    setForceSales,
    lockDoorPrices: (student, other) => {
      setDoor({ student, other });
      setPriceMode('locked');
    },
    setPriceMode,
    setCheckinLinks,
    setSquare,
    setParams,
    setPricing,
    createAccount: async ({ username, name, role: r }) => {
      setAccounts((a) => [...a, { uid: `u${a.length + 1}`, username, name, role: r }]);
    },
    setAccountRole: (uid, r: AccountRole) => setAccounts((a) => a.map((x) => (x.uid === uid ? { ...x, role: r } : x))),
    resetCounts: async () => {
      setDelta({ ...NONE, ...Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, -v])), revenue: -175 });
      setLog([]);
      setEffects({});
    },
    signOut: () => undefined,
  };

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}
