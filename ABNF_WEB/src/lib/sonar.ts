// Optional Web Audio API sonar synthesis (strictly muted by default, zero audio asset fetches).

let audioCtx: AudioContext | null = null;
let sonarEnabled = false;

export function isSonarEnabled(): boolean {
  return sonarEnabled;
}

export function setSonarEnabled(enabled: boolean): void {
  sonarEnabled = enabled;
  if (enabled && typeof window !== 'undefined' && !audioCtx) {
    const AudioContextCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      audioCtx = new AudioContextCtor();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended' && enabled) {
    void audioCtx.resume();
  }
}

export function playSonarTone(kind: 'ping' | 'scan' | 'recover' | 'tick'): void {
  if (!sonarEnabled || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  if (!audioCtx) {
    setSonarEnabled(true);
  }
  if (!audioCtx) return;

  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  if (kind === 'recover') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.24);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
    return;
  }

  if (kind === 'scan') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
    return;
  }

  if (kind === 'tick') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
    return;
  }

  // Default gentle radar ping
  osc.type = 'sine';
  osc.frequency.setValueAtTime(740, now);
  osc.frequency.exponentialRampToValueAtTime(587.33, now + 0.18);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.22);
}

const SUBSYSTEM_FREQS = [392.0, 440.0, 523.25, 587.33, 659.25];

export function playSubsystemPulseTone(index: number, nominal = true): void {
  if (!sonarEnabled || typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!audioCtx) setSonarEnabled(true);
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') void audioCtx.resume();

  const base = SUBSYSTEM_FREQS[((index % 5) + 5) % 5] ?? 440;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = nominal ? 'triangle' : 'sawtooth';
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(nominal ? base * 1.5 : base * 0.72, now + 0.19);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.23);
}
