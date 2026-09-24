import { createContext, useContext } from 'react';
import type { EngineOutput, Params, Pricing } from '../engine/computeState';
import type { AccountRole, Role } from './event';

// Interface commune aux écrans : fournie par FirebaseProvider (production) ou MemoryProvider (tests).

export type OpType = 'staff' | 'staffOut' | 'sale' | 'exit' | 'reentry' | 'adjust' | 'void';
export type Sale = { student: number; other: number; priceStudent: number; priceOther: number };
export type PriceMode = 'auto' | 'locked';
export type CheckinLinks = { student: string; regular: string };

export const TYPE_LABEL: Record<OpType, string> = {
  staff: 'Staff',
  staffOut: 'Staff parti',
  sale: 'Vente',
  exit: 'Sortie',
  reentry: 'Réentrée',
  adjust: 'Ajustement',
  void: 'Annulation',
};

export function saleTotal(s: Sale): number {
  return s.student * s.priceStudent + s.other * s.priceOther;
}

export function saleDetail(s: Sale): string {
  const parts = [
    s.student && `${s.student} étu × ${s.priceStudent} $`,
    s.other && `${s.other} autre × ${s.priceOther} $`,
  ].filter(Boolean);
  return `${parts.join(' + ')} = ${saleTotal(s)} $`;
}

export type LogEntry = { id: string; time: string; user: string; type: OpType; detail: string; voided: boolean };
export type Account = { uid: string; username: string; name: string; role: AccountRole };

export type AppState = EngineOutput & {
  priceMode: PriceMode;
  checkinLinks: CheckinLinks;
  capacity: number;
  clock: string;
  scanned: { student: number; regular: number };
  revenue: number;
  staff: number;
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

export type AppApi = {
  role: Role;
  state: AppState;
  log: LogEntry[];
  accounts: Account[];
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
  createAccount: (a: { username: string; name: string; role: Role; password: string }) => Promise<void>;
  setAccountRole: (uid: string, role: AccountRole) => void;
  resetCounts: () => Promise<void>;
  signOut: () => void;
};

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp doit être utilisé dans un fournisseur de données');
  return ctx;
}
