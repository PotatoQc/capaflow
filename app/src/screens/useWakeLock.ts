import { useEffect } from 'react';

// Garde l'écran allumé tant que `active` est vrai (redemandé au retour sur la page).
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active) return;
    let lock: WakeLockSentinel | null = null;
    let unmounted = false;
    const request = async () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (unmounted) lock.release();
      } catch {
        // Refusé par le navigateur (économie d'énergie) : l'app fonctionne quand même.
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      unmounted = true;
      document.removeEventListener('visibilitychange', request);
      lock?.release();
    };
  }, [active]);
}
