import { useEffect, useState } from 'react';

// Scans Hi.Events via le Worker (PLAN §10) : toutes les 15 s, délai d'attente 8 s.
const POLL_MS = 15_000;
const TIMEOUT_MS = 8_000;

type Counts = { student: number; regular: number; totalStudent: number; totalRegular: number };

export function useScanCounts() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  useEffect(() => {
    const url = import.meta.env.VITE_COUNTS_URL;
    if (!url) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
        if (!res.ok) return;
        const d = await res.json();
        if (stopped) return;
        setCounts({
          student: d.student.scanned,
          regular: d.regular.scanned,
          totalStudent: d.student.total,
          totalRegular: d.regular.total,
        });
        // Âge mesuré sur l'horloge de l'appareil, pour ne pas dépendre de celle du Worker.
        setFetchedAt(Date.now() - d.ageMs);
      } catch {
        // Échec : on garde la dernière valeur, l'âge des scans continue d'augmenter.
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, []);

  return { counts, fetchedAt };
}
