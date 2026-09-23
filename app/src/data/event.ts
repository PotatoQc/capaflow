import { HALF_LIFE_MS, type Params, type Pricing } from '../engine/computeState';

export type Role = 'admin' | 'manager' | 'bouncer' | 'viewer';
export type AccountRole = Role | 'disabled';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  manager: 'Manager',
  bouncer: 'Bouncer',
  viewer: 'Viewer',
};

const at = (d: number, h: number, m = 0) => Date.UTC(2026, 8, d, h, m);

// Valeurs par défaut du PLAN §7, écrites par « Initialiser l'événement ».
export const TIMEZONE = 'America/Toronto';
export const DOORS_OPEN = at(25, 23);
export const EVENT_END = at(26, 7);
export const DEFAULT_CAPACITY = 255;
export const TICKETS = { student: 166, regular: 89 };
export const CURVE_HOURS = ['19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00'];

export const DEFAULT_PARAMS: Params = {
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
};

export const DEFAULT_PRICING: Pricing = {
  base: { student: 5, other: 15 },
  tiers: [
    { min: 30, mult: 1 },
    { min: 15, mult: 1.25 },
    { min: 5, mult: 1.5 },
    { min: 1, mult: 2 },
  ],
  timeRules: [{ from: at(26, 5), mult: 0.8 }],
};

const fmt = new Intl.DateTimeFormat('fr-CA', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function clock(ms: number): string {
  const parts = fmt.formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}`;
}

// Heure locale « HH:MM » de la soirée → UTC (avant midi = samedi 26, sinon vendredi 25 ; EDT = UTC−4).
export function localTimeToUtc(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(2026, 8, h < 12 ? 26 : 25, h + 4, m);
}

// Âge vérifié en date du vendredi 25 septembre 2026 (jour de l'événement).
export function bornOnOrBefore(age: number): string {
  return `25/09/${2026 - age}`;
}

export function exitWeight(now: number): number {
  return 2 ** ((now - DOORS_OPEN) / HALF_LIFE_MS);
}
