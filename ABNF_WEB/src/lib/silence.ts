export interface SilenceParts {
  totalMs: number;
  totalSeconds: number;
  years: number;
  months: number;
  days: number;
  totalDaysRemainder: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export interface CombinedSilence {
  totalMs: number;
  years: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  formattedMono: string;
  formattedAccessible: string;
}

export type TimelineState = 'pre-launch' | 'operating' | 'silent';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const DAYS_PER_YEAR = 365.2425;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

export function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

export function pad3(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(3, '0');
}

export function pad4(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(4, '0');
}

export function parseUtcIsoDate(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00Z`);
}

/**
 * Computes exact UTC calendar years/months/days plus total elapsed telemetry
 * from a spacecraft's final contact ISO date up to `nowMs`.
 */
export function computeSilenceParts(lastContactIso: string, nowMs: number = Date.now()): SilenceParts {
  const startMs = parseUtcIsoDate(lastContactIso);
  const clampedNow = Math.max(startMs, nowMs);
  const totalMs = clampedNow - startMs;
  const totalSeconds = Math.floor(totalMs / MS_PER_SECOND);

  const start = new Date(startMs);
  const now = new Date(clampedNow);

  let years = now.getUTCFullYear() - start.getUTCFullYear();
  let months = now.getUTCMonth() - start.getUTCMonth();
  let days = now.getUTCDate() - start.getUTCDate();

  if (days < 0) {
    months -= 1;
    const prevMonthLastDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
    ).getUTCDate();
    days += prevMonthLastDay;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.floor(totalMs / MS_PER_DAY);
  const totalDaysRemainder = totalDays % 365;
  const hours = Math.floor((totalMs % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((totalMs % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((totalMs % MS_PER_MINUTE) / MS_PER_SECOND);

  return {
    totalMs,
    totalSeconds,
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
    totalDaysRemainder,
    hours,
    minutes,
    seconds,
  };
}

export function formatSilenceLine(lastContactIso: string, nowMs: number = Date.now()): string {
  const parts = computeSilenceParts(lastContactIso, nowMs);
  return `LAST CONTACT · ${lastContactIso} UTC · SILENT FOR ${pad2(parts.years)}Y ${pad2(parts.months)}M ${pad2(parts.days)}D`;
}

export function formatSilenceCompact(lastContactIso: string, nowMs: number = Date.now()): string {
  const parts = computeSilenceParts(lastContactIso, nowMs);
  return `${pad2(parts.years)}Y ${pad2(parts.months)}M ${pad2(parts.days)}D`;
}

export function formatSilenceDetailed(lastContactIso: string, nowMs: number = Date.now()): string {
  const parts = computeSilenceParts(lastContactIso, nowMs);
  return `${pad2(parts.years)}Y ${pad2(parts.months)}M ${pad2(parts.days)}D · ${pad2(parts.hours)}:${pad2(parts.minutes)}:${pad2(parts.seconds)}`;
}

export function formatSilenceAccessible(lastContactIso: string, nowMs: number = Date.now()): string {
  const parts = computeSilenceParts(lastContactIso, nowMs);
  return `Last contact ${lastContactIso} UTC. Silent for ${parts.years} years, ${parts.months} months, and ${parts.days} days.`;
}

/**
 * Sums total silence durations across multiple cataloged spacecraft.
 */
export function computeCombinedSilence(
  lastContactDates: string[],
  nowMs: number = Date.now(),
): CombinedSilence {
  let totalMs = 0;
  for (const iso of lastContactDates) {
    const startMs = parseUtcIsoDate(iso);
    if (Number.isFinite(startMs)) {
      totalMs += Math.max(0, nowMs - startMs);
    }
  }

  const years = Math.floor(totalMs / MS_PER_YEAR);
  const remainderAfterYears = totalMs - years * MS_PER_YEAR;
  const days = Math.floor(remainderAfterYears / MS_PER_DAY);
  const hours = Math.floor((remainderAfterYears % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((remainderAfterYears % MS_PER_HOUR) / MS_PER_MINUTE);
  const seconds = Math.floor((remainderAfterYears % MS_PER_MINUTE) / MS_PER_SECOND);

  return {
    totalMs,
    years,
    days,
    hours,
    minutes,
    seconds,
    formattedMono: `${pad4(years)}Y : ${pad3(days)}D : ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`,
    formattedAccessible: `Combined registry silence: ${years} years, ${days} days, and ${hours} hours across ${lastContactDates.length} artifacts.`,
  };
}

export function formatOperationalDuration(launchIso: string, lastContactIso: string): string {
  const launchMs = parseUtcIsoDate(launchIso);
  const endMs = parseUtcIsoDate(lastContactIso);
  const totalDays = Math.max(0, Math.round((endMs - launchMs) / MS_PER_DAY));
  if (totalDays >= 365) {
    const yrs = (totalDays / 365.2425).toFixed(1);
    return `${yrs}Y (${totalDays.toLocaleString('en-US')}D)`;
  }
  return `${totalDays}D`;
}

export function getArtifactTimelineState(
  launchIso: string,
  lastContactIso: string,
  scrubYear: number,
  currentYear: number = new Date().getUTCFullYear(),
): TimelineState {
  const launchYear = Number.parseInt(launchIso.slice(0, 4), 10);
  const endYear = Number.parseInt(lastContactIso.slice(0, 4), 10);
  const effectiveYear = Math.min(scrubYear, currentYear);

  if (effectiveYear < launchYear) {
    return 'pre-launch';
  }
  if (effectiveYear <= endYear) {
    return 'operating';
  }
  return 'silent';
}

export function formatUtcClock(nowMs: number = Date.now()): {
  mono: string;
  accessible: string;
} {
  const d = new Date(nowMs);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());

  return {
    mono: `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC`,
    accessible: `Current mission UTC time ${yyyy}-${mm}-${dd} ${hh}:${min} UTC`,
  };
}

// ============================================================================
// Single Shared Client Ticker (one setInterval, auto-pauses when tab is hidden)
// ============================================================================

type ClockSubscriber = (nowMs: number) => void;

const subscribers = new Set<ClockSubscriber>();
let timerId: number | null = null;
let visibilityBound = false;

function broadcastTick(): void {
  const now = Date.now();
  for (const cb of subscribers) {
    cb(now);
  }
}

function startTimer(): void {
  if (typeof window === 'undefined' || timerId !== null) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  timerId = window.setInterval(broadcastTick, 1000);
}

function stopTimer(): void {
  if (typeof window === 'undefined' || timerId === null) return;
  window.clearInterval(timerId);
  timerId = null;
}

function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;
  if (document.hidden) {
    stopTimer();
  } else {
    broadcastTick();
    startTimer();
  }
}

export function subscribeMissionClock(cb: ClockSubscriber): () => void {
  subscribers.add(cb);

  if (typeof document !== 'undefined' && !visibilityBound) {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityBound = true;
  }

  startTimer();

  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0) {
      stopTimer();
      if (typeof document !== 'undefined' && visibilityBound) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        visibilityBound = false;
      }
    }
  };
}
