import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../data/AppContext';
import { useWakeLock } from '../screens/useWakeLock';

// Alertes dans la page (PLAN §6.2) : pas de notification système, peu fiable sur une page web.
type Alerts = { soundOn: boolean; toggleSound: () => void };

const AlertContext = createContext<Alerts | null>(null);

function beep(ctx: AudioContext, count: number) {
  for (let i = 0; i < count; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime + i * 0.3;
    gain.gain.setValueAtTime(0.3, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
    osc.start(t0);
    osc.stop(t0 + 0.2);
  }
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const { role, state } = useApp();
  const [soundOn, setSoundOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const previous = useRef<boolean[] | null>(null);

  const watching = role === 'admin' || role === 'manager';
  const full = state.occupancy >= state.capacity;
  const soldOut = state.sellable <= 0;
  const suspended = state.salesState === 'SUSPENDU';

  useWakeLock(watching && soundOn);

  useEffect(() => {
    const current = [full, soldOut, suspended];
    const before = previous.current;
    previous.current = current;
    if (!watching || !before || !current.some((v, i) => v && !before[i])) return;
    navigator.vibrate?.([200, 100, 200]);
    if (soundOn && audio.current) beep(audio.current, 3);
  }, [full, soldOut, suspended, watching, soundOn]);

  // Le navigateur n'autorise le son qu'après un geste de l'utilisateur : d'où ce bouton.
  const toggleSound = () => {
    if (soundOn) {
      setSoundOn(false);
      return;
    }
    audio.current ??= new AudioContext();
    void audio.current.resume();
    beep(audio.current, 1);
    setSoundOn(true);
  };

  return <AlertContext.Provider value={{ soundOn, toggleSound }}>{children}</AlertContext.Provider>;
}

export function useAlerts(): Alerts {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts doit être utilisé dans AlertProvider');
  return ctx;
}
