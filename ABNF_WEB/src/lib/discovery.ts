export type ReadingMode = 'explorer' | 'technical';
export type DiscoveryStatus = 'dormant' | 'inspected' | 'recovered';

export interface StoredDiscoveryState {
  inspected: string[];
  recovered: string[];
}

export interface DiscoverySnapshot {
  inspectedIds: Set<string>;
  recoveredIds: Set<string>;
}

export const DISCOVERY_STORAGE_KEY = 'rocky-team-discovery-v1';
export const DISCOVERY_EVENT = 'rocky-team:discovery-change';
export const READING_MODE_EVENT = 'rocky-team:reading-mode-change';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

export function readDiscoveryState(validIds?: Iterable<string>): DiscoverySnapshot {
  const inspectedIds = new Set<string>();
  const recoveredIds = new Set<string>();
  if (!isBrowser()) {
    return { inspectedIds, recoveredIds };
  }

  const allowed = validIds ? new Set(validIds) : null;

  try {
    const raw = window.sessionStorage.getItem(DISCOVERY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredDiscoveryState>;
      for (const id of parsed.inspected ?? []) {
        if (typeof id === 'string' && (!allowed || allowed.has(id))) {
          inspectedIds.add(id);
        }
      }
      for (const id of parsed.recovered ?? []) {
        if (typeof id === 'string' && (!allowed || allowed.has(id))) {
          inspectedIds.add(id);
          recoveredIds.add(id);
        }
      }
    }
  } catch {
    // Ignore storage unavailability
  }

  return { inspectedIds, recoveredIds };
}

function writeDiscoveryState(snapshot: DiscoverySnapshot): void {
  if (!isBrowser()) return;

  try {
    const data: StoredDiscoveryState = {
      inspected: [...snapshot.inspectedIds],
      recovered: [...snapshot.recoveredIds],
    };
    window.sessionStorage.setItem(DISCOVERY_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage unavailability
  }

  window.dispatchEvent(
    new CustomEvent(DISCOVERY_EVENT, {
      detail: {
        inspected: [...snapshot.inspectedIds],
        recovered: [...snapshot.recoveredIds],
      },
    }),
  );
}

export function getArtifactDiscoveryState(
  id: string,
  snapshot: DiscoverySnapshot = readDiscoveryState(),
): DiscoveryStatus {
  if (snapshot.recoveredIds.has(id)) return 'recovered';
  if (snapshot.inspectedIds.has(id)) return 'inspected';
  return 'dormant';
}

export function markArtifactInspected(id: string): DiscoverySnapshot {
  const snapshot = readDiscoveryState();
  const alreadyInspected = snapshot.inspectedIds.has(id);
  snapshot.inspectedIds.add(id);
  if (!alreadyInspected) {
    writeDiscoveryState(snapshot);
  } else if (isBrowser()) {
    // Still emit update notification when requested cleanly
    writeDiscoveryState(snapshot);
  }
  return snapshot;
}

export function markArtifactRecovered(id: string): DiscoverySnapshot {
  const snapshot = readDiscoveryState();
  snapshot.inspectedIds.add(id);
  snapshot.recoveredIds.add(id);
  writeDiscoveryState(snapshot);
  return snapshot;
}

export function subscribeDiscoveryChange(listener: (snapshot: DiscoverySnapshot) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = () => listener(readDiscoveryState());
  window.addEventListener(DISCOVERY_EVENT, handler);
  return () => window.removeEventListener(DISCOVERY_EVENT, handler);
}

export function getReadingMode(): ReadingMode {
  if (!isBrowser()) return 'explorer';
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'technical' ? 'technical' : 'explorer';
}

export function setReadingMode(mode: ReadingMode): void {
  if (!isBrowser()) return;
  const params = new URLSearchParams(window.location.search);
  if (mode === 'explorer') {
    params.delete('mode');
  } else {
    params.set('mode', mode);
  }
  const qs = params.toString();
  const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
  window.history.replaceState(null, '', nextUrl);
  window.dispatchEvent(
    new CustomEvent<{ mode: ReadingMode }>(READING_MODE_EVENT, {
      detail: { mode },
    }),
  );
}

export function subscribeReadingModeChange(listener: (mode: ReadingMode) => void): () => void {
  if (!isBrowser()) return () => {};
  const handler = (event: Event) => {
    const custom = event as CustomEvent<{ mode?: ReadingMode }>;
    listener(custom.detail?.mode ?? getReadingMode());
  };
  window.addEventListener(READING_MODE_EVENT, handler);
  return () => window.removeEventListener(READING_MODE_EVENT, handler);
}
