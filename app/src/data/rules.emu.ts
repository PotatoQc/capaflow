// Tests A1.1–A1.3 (PLAN §13) contre l'émulateur Firestore : `npm run test:emu`.
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp, disableNetwork, doc, enableNetwork, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore,
} from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  EVENT_ID, ZERO_SHARD, buildOp, configDoc, eventDoc, logDoc, moneyDoc, shardDoc, type Op,
} from './ops';

let env: RulesTestEnvironment;

const USERS = { admin: 'admin', manager: 'manager', b1: 'bouncer', b2: 'bouncer', v: 'viewer' } as const;
const CONFIG = {
  priceMode: 'auto',
  doorPrices: { student: 5, other: 15 },
  checkinLinks: { student: '', regular: '' },
  params: {},
  pricing: {},
};
const SALE: Op = { type: 'sale', qty: { student: 2, other: 1 }, prices: { student: 8, other: 23 } };

const db = (uid: string) => env.authenticatedContext(uid).firestore() as unknown as Firestore;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-capaflow',
    firestore: { rules: readFileSync('../firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore() as unknown as Firestore;
    for (const [uid, role] of Object.entries(USERS)) {
      await setDoc(doc(f, 'users', uid), { username: uid, name: uid, role, createdAt: Timestamp.now() });
      await setDoc(shardDoc(f, uid), ZERO_SHARD);
      await setDoc(moneyDoc(f, uid), { revenue: 0, lastOp: '' });
    }
    await setDoc(eventDoc(f), { capacity: 255, salesOpen: true, forceSales: false });
    await setDoc(configDoc(f), CONFIG);
  });
});

const read = async (path: string[]) => {
  let data: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await getDoc(doc(ctx.firestore() as unknown as Firestore, path.join('/')))).data();
  });
  return data!;
};
const shard = (uid: string) => read(['events', EVENT_ID, 'shards', uid]);

describe('A1.1 — règles de sécurité', () => {
  it('un Viewer ne peut rien écrire, ni lire la config privée ou les revenus', async () => {
    const f = db('v');
    await assertSucceeds(getDoc(eventDoc(f)));
    await assertFails(getDoc(configDoc(f)));
    await assertFails(getDoc(moneyDoc(f, 'v')));
    await assertFails(updateDoc(eventDoc(f), { capacity: 200 }));
    await assertFails(buildOp(f, 'v', { type: 'staff' }).batch.commit());
  });

  it('un Bouncer ne lit pas les revenus ni le journal', async () => {
    const f = db('b1');
    await assertFails(getDoc(moneyDoc(f, 'b1')));
    await assertFails(getDoc(logDoc(f, 'x')));
    await assertSucceeds(getDoc(configDoc(f)));
  });

  it('un Bouncer compte un staff, mais pas dans le compteur d’un autre', async () => {
    await assertSucceeds(buildOp(db('b1'), 'b1', { type: 'staff' }).batch.commit());
    expect((await shard('b1')).staff).toBe(1);
    const f = db('b1');
    const batch = writeBatch(f);
    batch.set(logDoc(f, 'x1'), { type: 'staff', uid: 'b1', at: serverTimestamp(), clientAt: Timestamp.now() });
    batch.update(shardDoc(f, 'b2'), { lastOp: 'x1' });
    await assertFails(batch.commit());
  });

  it('un lot rejoué (même opération) est refusé en entier', async () => {
    await assertSucceeds(buildOp(db('b1'), 'b1', { type: 'staff' }, 'op-1').batch.commit());
    await assertFails(buildOp(db('b1'), 'b1', { type: 'staff' }, 'op-1').batch.commit());
    expect((await shard('b1')).staff).toBe(1);
  });

  it('vente mixte : compteurs et revenus mis à jour ensemble', async () => {
    await assertSucceeds(buildOp(db('b1'), 'b1', SALE).batch.commit());
    const s = await shard('b1');
    expect([s.saleStudent, s.saleOther]).toEqual([2, 1]);
    expect((await read(['events', EVENT_ID, 'money', 'b1'])).revenue).toBe(39);
  });

  it('vente refusée : prix 0 ou 101, plus de 10 billets, revenus non mis à jour', async () => {
    const bad = (prices: { student: number; other: number }, qty = { student: 1, other: 0 }) =>
      buildOp(db('b1'), 'b1', { type: 'sale', qty, prices }).batch.commit();
    await assertFails(bad({ student: 0, other: 15 }));
    await assertFails(bad({ student: 5, other: 101 }));
    await assertFails(bad({ student: 5, other: 15 }, { student: 6, other: 5 }));
    const f = db('b1');
    const batch = writeBatch(f);
    batch.set(logDoc(f, 'x2'), { ...SALE, uid: 'b1', at: serverTimestamp(), clientAt: Timestamp.now() });
    batch.update(shardDoc(f, 'b1'), { saleStudent: 2, saleOther: 1, lastOp: 'x2' });
    await assertFails(batch.commit());
  });

  it('annulation : la sienne sous 30 s oui, deux fois non', async () => {
    await buildOp(db('b1'), 'b1', { type: 'staff' }, 'op-2').batch.commit();
    const cancel = () => buildOp(db('b1'), 'b1', { type: 'void', ref: 'op-2', original: { type: 'staff' } }).batch.commit();
    await assertSucceeds(cancel());
    await assertFails(cancel());
    expect((await shard('b1')).staff).toBe(0);
  });

  it('annulation par un Bouncer après 30 s refusée ; par un Manager acceptée', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore() as unknown as Firestore;
      await setDoc(logDoc(f, 'old'), { type: 'staff', uid: 'b1', at: Timestamp.fromMillis(Date.now() - 60_000), clientAt: Timestamp.now() });
      await setDoc(shardDoc(f, 'b1'), { ...ZERO_SHARD, staff: 1, lastOp: 'old' });
    });
    await assertFails(buildOp(db('b1'), 'b1', { type: 'void', ref: 'old', original: { type: 'staff' } }).batch.commit());
    await assertSucceeds(buildOp(db('manager'), 'manager', { type: 'void', ref: 'old', original: { type: 'staff' } }).batch.commit());
    expect((await shard('manager')).staff).toBe(-1);
  });

  it('ajustement : refusé pour un Bouncer, accepté pour un Manager', async () => {
    const adjust: Op = { type: 'adjust', delta: -3, reason: 'Décompte' };
    await assertFails(buildOp(db('b1'), 'b1', adjust).batch.commit());
    await assertSucceeds(buildOp(db('manager'), 'manager', adjust).batch.commit());
    expect((await shard('manager')).adjust).toBe(-3);
  });

  it('capacité : 300 accepté, 301 refusé', async () => {
    await assertSucceeds(updateDoc(eventDoc(db('manager')), { capacity: 300 }));
    await assertFails(updateDoc(eventDoc(db('manager')), { capacity: 301 }));
  });

  it('comptes : modifiables seulement par l’Admin', async () => {
    const user = { username: 'porte9', name: 'Porte 9', role: 'bouncer', createdAt: Timestamp.now() };
    await assertFails(setDoc(doc(db('manager'), 'users', 'new1'), user));
    await assertSucceeds(setDoc(doc(db('admin'), 'users', 'new1'), user));
  });

  it('liens de check-in : Admin seulement, format Hi.Events seulement', async () => {
    const links = (student: string) => ({ checkinLinks: { student, regular: '' } });
    await assertFails(updateDoc(configDoc(db('manager')), links('https://app.hi.events/check-in/cil_Abc123')));
    await assertFails(updateDoc(configDoc(db('admin')), links('javascript:alert(1)')));
    await assertSucceeds(updateDoc(configDoc(db('admin')), links('https://app.hi.events/check-in/cil_Abc123#scan')));
  });
});

describe('A1.2–A1.3 — intégration', () => {
  it('A1.2 : 5 clients × 100 actions simultanées → sommes exactes', async () => {
    const clients = ['admin', 'manager', 'b1', 'b2', 'b1x'];
    await env.withSecurityRulesDisabled(async (ctx) => {
      const f = ctx.firestore() as unknown as Firestore;
      await setDoc(doc(f, 'users', 'b1x'), { username: 'b1x', name: 'b1x', role: 'bouncer', createdAt: Timestamp.now() });
      await setDoc(shardDoc(f, 'b1x'), ZERO_SHARD);
    });
    await Promise.all(clients.flatMap((uid) => {
      const f = db(uid);
      return Array.from({ length: 100 }, () => buildOp(f, uid, { type: 'staff' }).batch.commit());
    }));
    const totals = await Promise.all(clients.map(async (uid) => (await shard(uid)).staff as number));
    expect(totals.reduce((a, b) => a + b, 0)).toBe(500);
  });

  it('A1.3 : hors ligne, 50 actions, reconnexion → exactement +50', async () => {
    const f = db('b2');
    await getDoc(shardDoc(f, 'b2'));
    await disableNetwork(f);
    const pending = Array.from({ length: 50 }, () => buildOp(f, 'b2', { type: 'reentry' }).batch.commit());
    await enableNetwork(f);
    await Promise.all(pending);
    expect((await shard('b2')).reentry).toBe(50);
  });
});
