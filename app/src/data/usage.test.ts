// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { addReads, addWrites, countSnapshot, myUsage, quotaDay, sumUsage, worstRatio } from './usage';

describe('Consommation Firebase', () => {
  it('jour de quota à l’heure du Pacifique : 02:59 à Montréal = veille, 03:00 = nouveau jour', () => {
    expect(quotaDay(Date.parse('2026-09-26T06:59:00Z'))).toBe('2026-09-25');
    expect(quotaDay(Date.parse('2026-09-26T07:00:00Z'))).toBe('2026-09-26');
  });

  it('compte les documents reçus du serveur, pas ceux du cache', () => {
    const before = myUsage().reads;
    countSnapshot({ metadata: { fromCache: true }, docChanges: () => [1, 2, 3] });
    countSnapshot({ metadata: { fromCache: false }, docChanges: () => [1, 2, 3] });
    countSnapshot({ metadata: { fromCache: false } });
    addReads(10);
    addWrites(2);
    expect(myUsage().reads - before).toBe(14);
  });

  it('additionne les appareils du jour seulement ; ratio le plus élevé', () => {
    const day = quotaDay();
    const u = sumUsage([
      { day, reads: 30_000, writes: 1_000, deletes: 0 },
      { day, reads: 10_000, writes: 500, deletes: 0 },
      { day: '2000-01-01', reads: 99_999, writes: 99_999, deletes: 0 },
    ]);
    expect(u).toEqual({ reads: 40_000, writes: 1_500, deletes: 0 });
    expect(worstRatio(u)).toBe(0.8);
  });
});
