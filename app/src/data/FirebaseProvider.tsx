import { getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  signOut as fbSignOut, type User,
} from 'firebase/auth';
import {
  Timestamp, collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch,
  type QuerySnapshot, type WriteBatch,
} from 'firebase/firestore';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { computeState, type Params, type Pricing, type Totals } from '../engine/computeState';
import { useScanCounts } from '../hievents/useScanCounts';
import Connexion from '../screens/Connexion';
import { Blocked, InitEvent, Splash } from '../screens/Gate';
import {
  AppContext, TYPE_LABEL, saleDetail, type Account, type AppApi, type CheckinLinks, type LogEntry,
  type PriceMode, type SquareConfig,
} from './AppContext';
import {
  DEFAULT_CAPACITY, DEFAULT_PARAMS, DEFAULT_PRICING, DOORS_OPEN, EVENT_END, TICKETS, TIMEZONE, clock, exitWeight,
  type AccountRole, type Role,
} from './event';
import { auth, db, firebaseConfig, loginEmail } from './firebase';
import { EVENT_ID, ZERO_SHARD, buildOp, configDoc, ensureCounters, eventDoc, type Op } from './ops';
import { addDeletes, addReads, addWrites, countSnapshot, myUsage, sumUsage, type Usage } from './usage';

type EventDoc = {
  doorsOpen: Timestamp;
  capacity: number;
  salesOpen: boolean;
  forceSales: boolean;
  tickets: { student: number; regular: number };
};
type ConfigDoc = {
  priceMode: PriceMode;
  doorPrices: { student: number; other: number };
  checkinLinks: CheckinLinks;
  square?: SquareConfig;
  params: Params;
  pricing: Pricing;
};
type LogDoc = (Op | { type: 'void'; ref: string }) & { uid: string; at: Timestamp | null };

const ACTIVE: AccountRole[] = ['admin', 'manager', 'bouncer', 'viewer'];
const COUNTERS: (keyof Totals)[] = ['staff', 'saleStudent', 'saleOther', 'exit', 'reentry', 'adjust', 'exitW'];
const report = (e: unknown) => console.error('Écriture refusée', e);
const USAGE_SYNC_MS = 120_000;
// Compte les documents reçus du serveur avant de traiter l'instantané (PLAN §6.3, consommation Firebase).
const tally = <S extends { metadata: { fromCache: boolean } }>(fn: (s: S) => void) => (s: S) => {
  countSnapshot(s as S & { docChanges?: () => unknown[] });
  fn(s);
};

function logDetail(d: LogDoc, all: Map<string, LogDoc>, names: Map<string, string>): string {
  switch (d.type) {
    case 'sale':
      return saleDetail({ student: d.qty.student, other: d.qty.other, priceStudent: d.prices.student, priceOther: d.prices.other });
    case 'adjust':
      return `${d.delta > 0 ? '+' : ''}${d.delta} · ${d.reason}`;
    case 'void': {
      const original = all.get(d.ref);
      return original ? `${TYPE_LABEL[original.type]} de ${names.get(original.uid) ?? '?'}` : 'une opération';
    }
    default:
      return '';
  }
}

// Rétablit l'opération d'origine à partir d'un document du journal (pour l'annuler) ; une annulation ne s'annule pas.
function toOp(d: LogDoc): Op | undefined {
  switch (d.type) {
    case 'exit': return { type: 'exit', w: d.w };
    case 'sale': return { type: 'sale', qty: d.qty, prices: d.prices };
    case 'adjust': return { type: 'adjust', delta: d.delta, reason: d.reason };
    case 'void': return undefined;
    default: return { type: d.type };
  }
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<{ role: AccountRole; username: string } | null | undefined>(undefined);
  const [profileTry, setProfileTry] = useState(0);
  const [eventData, setEventData] = useState<EventDoc | null | undefined>(undefined);
  const [config, setConfig] = useState<ConfigDoc | null | undefined>(undefined);
  const [shards, setShards] = useState<Totals[]>([]);
  const [revenue, setRevenue] = useState(0);
  const [logDocs, setLogDocs] = useState<Map<string, LogDoc>>(new Map());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pending, setPending] = useState(0);
  const [lastRejectAt, setLastRejectAt] = useState<number | null>(null);
  const [usageDocs, setUsageDocs] = useState<(Usage & { day: string })[]>([]);
  const [pushed, setPushed] = useState<{ student: number; regular: number; at: number } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(() => Date.now());
  const ownOps = useRef(new Map<string, Op>());
  const { counts, fetchedAt } = useScanCounts();

  const uid = user?.uid;
  const role = profile && ACTIVE.includes(profile.role) ? (profile.role as Role) : null;
  const isDoor = role === 'admin' || role === 'manager' || role === 'bouncer';
  const isManager = role === 'admin' || role === 'manager';

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      setProfile(user === null ? null : undefined);
      return;
    }
    // Juste après la connexion, la lecture peut être refusée le temps que le jeton arrive : on réessaie
    // au lieu d'afficher « compte désactivé ».
    let retry: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      tally((s) => setProfile(s.exists() ? (s.data() as { role: AccountRole; username: string }) : null)),
      () => { retry = setTimeout(() => setProfileTry((n) => n + 1), 1000); },
    );
    return () => {
      unsub();
      clearTimeout(retry);
    };
  }, [uid, user, profileTry]);

  useEffect(() => {
    if (!role) return;
    const unsubs = [
      onSnapshot(eventDoc(db), tally((s) => setEventData(s.exists() ? (s.data() as EventDoc) : null)), () => setEventData(null)),
      onSnapshot(collection(db, 'events', EVENT_ID, 'shards'), tally((s: QuerySnapshot) => setShards(s.docs.map((d) => d.data() as Totals)))),
      // Totaux poussés par le webhook Hi.Events (~1 s) ; l'appel du Worker toutes les 15 s reste en secours.
      onSnapshot(doc(db, 'events', EVENT_ID, 'scans', 'totals'), tally((s) => {
        const d = s.data({ serverTimestamps: 'estimate' });
        setPushed(d ? { student: d.student, regular: d.regular, at: (d.at as Timestamp).toMillis() } : null);
      }), () => setPushed(null)),
    ];
    if (isDoor) unsubs.push(onSnapshot(configDoc(db), tally((s) => setConfig(s.exists() ? (s.data() as ConfigDoc) : null)), () => setConfig(null)));
    if (isManager) {
      unsubs.push(
        onSnapshot(collection(db, 'events', EVENT_ID, 'money'), tally((s: QuerySnapshot) => setRevenue(s.docs.reduce((sum, d) => sum + (d.data().revenue as number), 0)))),
        onSnapshot(query(collection(db, 'events', EVENT_ID, 'log'), orderBy('at', 'desc'), limit(50)), tally((s: QuerySnapshot) =>
          setLogDocs(new Map(s.docs.map((d) => [d.id, d.data({ serverTimestamps: 'estimate' }) as LogDoc]))))),
        onSnapshot(collection(db, 'users'), tally((s: QuerySnapshot) =>
          setAccounts(s.docs.map((d) => ({ uid: d.id, ...(d.data() as Omit<Account, 'uid'>) })).sort((a, b) => a.username.localeCompare(b.username))))),
        onSnapshot(collection(db, 'events', EVENT_ID, 'usage'), tally((s: QuerySnapshot) => setUsageDocs(s.docs.map((d) => d.data() as Usage & { day: string })))),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [role, isDoor, isManager]);

  // Compteur et revenus de l'utilisateur créés à zéro au besoin (PLAN §7).
  // Publie la consommation de cet appareil toutes les 2 min (seulement si elle a changé).
  useEffect(() => {
    if (!uid || !role) return;
    let sent = '';
    const sync = () => {
      const u = myUsage();
      const key = JSON.stringify(u);
      if (key === sent) return;
      sent = key;
      addWrites(1);
      setDoc(doc(db, 'events', EVENT_ID, 'usage', uid), { ...u, at: serverTimestamp() }).catch(report);
    };
    const first = setTimeout(sync, 10_000);
    const t = setInterval(sync, USAGE_SYNC_MS);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [uid, role]);

  const hasEvent = !!eventData;
  useEffect(() => {
    if (uid && isDoor && hasEvent) ensureCounters(db, uid).catch(report);
  }, [uid, isDoor, hasEvent]);

  if (user === undefined || (user && profile === undefined)) return <Splash />;
  if (!user) {
    return <Connexion onSignIn={(u, p) => signInWithEmailAndPassword(auth, loginEmail(u), p).then(() => undefined)} />;
  }
  if (!role) return <Blocked message="Ce compte est désactivé ou n'a pas encore de rôle." onSignOut={() => fbSignOut(auth)} />;
  if (eventData === undefined || (isDoor && config === undefined)) return <Splash />;
  if (!eventData || (isDoor && !config)) {
    if (role !== 'admin') return <Blocked message="L'événement n'est pas encore initialisé par l'Admin." onSignOut={() => fbSignOut(auth)} />;
    return <InitEvent onInit={initEvent} />;
  }

  const totals = Object.fromEntries(COUNTERS.map((k) => [k, shards.reduce((sum, s) => sum + (s[k] ?? 0), 0)])) as Totals;
  // Source la plus récente entre le webhook et l'appel périodique du Worker.
  const usePushed = pushed !== null && (fetchedAt === null || pushed.at >= fetchedAt);
  const scanned = usePushed
    ? { student: pushed.student, regular: pushed.regular }
    : { student: counts?.student ?? 0, regular: counts?.regular ?? 0 };
  const lastScanAt = Math.max(fetchedAt ?? -Infinity, pushed?.at ?? -Infinity);
  const scansAgeMs = Number.isFinite(lastScanAt) ? now - lastScanAt : Infinity;
  const params = config?.params ?? DEFAULT_PARAMS;
  const pricing = config?.pricing ?? DEFAULT_PRICING;
  const out = computeState({
    now,
    doorsOpen: eventData.doorsOpen.toMillis(),
    capacity: eventData.capacity,
    tickets: eventData.tickets,
    scanned,
    scansAgeMs,
    totals,
    salesOpen: eventData.salesOpen,
    forceSales: eventData.forceSales,
    params,
    pricing,
  });
  const priceMode = config?.priceMode ?? 'auto';
  const doorPrices = config?.doorPrices ?? DEFAULT_PRICING.base;
  const applied = priceMode === 'auto' && out.suggested ? out.suggested : doorPrices;

  const names = new Map(accounts.map((a) => [a.uid, a.username]));
  const voidedRefs = new Set([...logDocs.values()].flatMap((d) => (d.type === 'void' ? [d.ref] : [])));
  const log: LogEntry[] = [...logDocs.entries()].map(([id, d]) => ({
    id,
    time: d.at ? clock(d.at.toMillis()) : '…',
    user: names.get(d.uid) ?? '?',
    type: d.type,
    detail: logDetail(d, logDocs, names),
    voided: voidedRefs.has(id),
  }));

  const commit = (p: Promise<void>, writes = 1) => {
    addWrites(writes);
    setPending((n) => n + 1);
    p.catch((e) => {
      report(e);
      setLastRejectAt(Date.now());
    }).finally(() => setPending((n) => n - 1));
  };
  const updateEvent = (data: Partial<EventDoc>) => commit(updateDoc(eventDoc(db), data));
  const updateConfig = (data: Partial<ConfigDoc>) => commit(updateDoc(configDoc(db), data));

  async function initEvent() {
    await setDoc(eventDoc(db), {
      name: 'Neon Party',
      timezone: TIMEZONE,
      doorsOpen: Timestamp.fromMillis(DOORS_OPEN),
      end: Timestamp.fromMillis(EVENT_END),
      capacity: DEFAULT_CAPACITY,
      salesOpen: true,
      forceSales: false,
      tickets: TICKETS,
    });
    await setDoc(configDoc(db), {
      priceMode: 'auto',
      doorPrices: DEFAULT_PRICING.base,
      checkinLinks: { student: '', regular: '' },
      params: DEFAULT_PARAMS,
      pricing: DEFAULT_PRICING,
    });
  }

  const api: AppApi = {
    role,
    state: {
      ...out,
      priceMode,
      checkinLinks: config?.checkinLinks ?? { student: '', regular: '' },
      square: config?.square ?? { enabled: false, appId: '' },
      capacity: eventData.capacity,
      clock: clock(now),
      scanned,
      revenue,
      staff: totals.staff,
      doorSales: { student: totals.saleStudent, other: totals.saleOther },
      scanAgeS: Number.isFinite(scansAgeMs) ? Math.max(0, Math.round(scansAgeMs / 1000)) : Infinity,
      salesOpen: eventData.salesOpen,
      forceSales: eventData.forceSales,
      online,
      pending,
      lastRejectAt,
      // Les poussées du webhook Hi.Events (≈ 1 écriture par scan) s'ajoutent aux appareils.
      usage: isManager ? (({ reads, writes, deletes }) => ({ reads, writes: writes + scanned.student + scanned.regular, deletes }))(sumUsage(usageDocs)) : null,
      doorStudent: applied.student,
      doorOther: applied.other,
      params,
      pricing,
    },
    log,
    accounts,
    record: (type, opts = {}) => {
      const s = opts.sale;
      const op: Op =
        type === 'exit' ? { type: 'exit', w: exitWeight(Date.now()) }
        : type === 'sale' && s ? { type: 'sale', qty: { student: s.student, other: s.other }, prices: { student: s.priceStudent, other: s.priceOther } }
        : type === 'adjust' ? { type: 'adjust', delta: opts.delta ?? 0, reason: opts.reason ?? '' }
        : { type: type as 'staff' | 'staffOut' | 'reentry' };
      const { batch, id } = buildOp(db, user.uid, op);
      ownOps.current.set(id, op);
      commit(batch.commit(), op.type === 'sale' ? 3 : 2);
      return id;
    },
    voidEntry: (id) => {
      const logged = logDocs.get(id);
      const original = logged ? toOp(logged) : ownOps.current.get(id);
      if (!original) return;
      commit(buildOp(db, user.uid, { type: 'void', ref: id, original }).batch.commit(), original.type === 'sale' ? 3 : 2);
    },
    setCapacity: (capacity) => updateEvent({ capacity }),
    setSalesOpen: (salesOpen) => updateEvent({ salesOpen }),
    setForceSales: (forceSales) => updateEvent({ forceSales }),
    lockDoorPrices: (student, other) => updateConfig({ priceMode: 'locked', doorPrices: { student, other } }),
    setPriceMode: (m) => updateConfig({ priceMode: m }),
    setCheckinLinks: (links) => updateConfig({ checkinLinks: links }),
    setSquare: (square) => updateConfig({ square }),
    setParams: (p) => updateConfig({ params: p }),
    setPricing: (p) => updateConfig({ pricing: p }),
    createAccount: async ({ username, name, role: newRole, password }) => {
      // 2e instance Firebase : créer un compte sans déconnecter l'Admin (PLAN §5).
      const existing = getApps().find((a) => a.name === 'secondary');
      const secondaryAuth = getAuth(existing ?? initializeApp(firebaseConfig, 'secondary'));
      if (!existing && import.meta.env.VITE_USE_EMULATOR === '1') {
        connectAuthEmulator(secondaryAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
      }
      const cred = await createUserWithEmailAndPassword(secondaryAuth, loginEmail(username), password);
      await fbSignOut(secondaryAuth);
      addWrites(1);
      await setDoc(doc(db, 'users', cred.user.uid), { username, name, role: newRole, createdAt: serverTimestamp() });
    },
    setAccountRole: (accountUid, r) => commit(updateDoc(doc(db, 'users', accountUid), { role: r })),
    // Remise à zéro de test (PLAN §6.3) : compteurs, revenus et journal ; la configuration reste.
    resetCounts: async () => {
      const col = (name: string) => getDocs(collection(db, 'events', EVENT_ID, name));
      const [shardSnap, moneySnap, logSnap] = await Promise.all([col('shards'), col('money'), col('log')]);
      const writes: ((b: WriteBatch) => void)[] = [
        ...shardSnap.docs.map((d) => (b: WriteBatch) => b.set(d.ref, ZERO_SHARD)),
        ...moneySnap.docs.map((d) => (b: WriteBatch) => b.set(d.ref, { revenue: 0, lastOp: '' })),
        ...logSnap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref)),
      ];
      addReads(shardSnap.size + moneySnap.size + logSnap.size);
      addWrites(shardSnap.size + moneySnap.size);
      addDeletes(logSnap.size);
      for (let i = 0; i < writes.length; i += 400) {
        const batch = writeBatch(db);
        writes.slice(i, i + 400).forEach((w) => w(batch));
        await batch.commit();
      }
      ownOps.current.clear();
    },
    signOut: () => fbSignOut(auth),
  };

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}
