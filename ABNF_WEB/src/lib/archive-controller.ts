import {
  DISCOVERY_STORAGE_KEY,
  getReadingMode,
  markArtifactInspected,
  markArtifactRecovered,
  readDiscoveryState,
  setReadingMode,
  subscribeDiscoveryChange,
  subscribeReadingModeChange,
  type ReadingMode,
} from './discovery';
import { formatCoordinates, type Artifact } from './format';
import {
  computeCombinedSilence,
  formatOperationalDuration,
  formatSilenceCompact,
  formatSilenceLine,
  getArtifactTimelineState,
  subscribeMissionClock,
} from './silence';
import { playSonarTone } from './sonar';

interface CatalogPayload {
  artifacts: Artifact[];
  minYear: number;
  maxYear: number;
}

const RING_CIRCUMFERENCE = 169.65;
const HOLD_DURATION_MS = 1200;
const QUICK_TAP_THRESHOLD_MS = 220;

export function initArchiveDashboard(): void {
  const payloadEl = document.getElementById('archive-catalog-data');
  if (!payloadEl) return;

  const payload = JSON.parse(payloadEl.textContent || '{}') as CatalogPayload;
  const artifacts = payload.artifacts ?? [];
  const minYear = payload.minYear ?? 1967;
  const maxYear = payload.maxYear ?? new Date().getUTCFullYear();
  const artifactById = new Map<string, Artifact>(artifacts.map((a) => [a.id, a]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Read initial URL filters, reading mode & deep-link artifact
  const initialParams = new URLSearchParams(window.location.search);
  let activeBody = initialParams.get('body') || 'all';
  if (!['all', 'mars', 'moon'].includes(activeBody)) activeBody = 'all';

  let activeType = initialParams.get('type') || 'all';
  const validTypes = new Set(['all', ...artifacts.map((a) => a.type)]);
  if (!validTypes.has(activeType)) activeType = 'all';

  let readingMode: ReadingMode = getReadingMode();

  let activeArtifactId: string | null = initialParams.get('artifact');
  if (activeArtifactId && !artifactById.has(activeArtifactId)) activeArtifactId = null;

  let scrubYear = maxYear;

  const initialDiscovery = readDiscoveryState(artifactById.keys());
  const inspectedIds = initialDiscovery.inspectedIds;
  const recoveredIds = initialDiscovery.recoveredIds;

  // Keep storage reference key explicit
  void DISCOVERY_STORAGE_KEY;

  // DOM References
  const bodyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter-body]'));
  const typeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter-type]'));
  const readingModeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-reading-mode]'),
  );
  const readingHintEl = document.getElementById('reading-mode-hint');
  const liveStatusEl = document.getElementById('filter-live-status');
  const resetInlineBtn = document.getElementById('reset-filters-inline');
  const emptyStateEl = document.getElementById('archive-empty-state');
  const emptyResetBtn = document.getElementById('reset-filters-empty');

  const kpiCountEl = document.querySelector<HTMLElement>('[data-kpi="count"]');
  const kpiVerifiedEl = document.querySelector<HTMLElement>('[data-kpi="verified-summary"]');
  const kpiBodySplitEl = document.querySelector<HTMLElement>('[data-kpi="body-split"]');
  const kpiCombinedEl = document.querySelector<HTMLElement>('[data-kpi="combined-silence"]');
  const kpiCombinedSrEl = document.querySelector<HTMLElement>('[data-kpi="combined-silence-sr"]');
  const kpiLatestDateEl = document.querySelector<HTMLElement>('[data-kpi="latest-date"]');
  const kpiLatestNameEl = document.querySelector<HTMLElement>('[data-kpi="latest-name"]');

  const discoveryInspectedEl = document.querySelector<HTMLElement>('[data-discovery="inspected"]');
  const discoveryRecoveredEl = document.querySelector<HTMLElement>('[data-discovery="recovered"]');
  const discoveryInspectedBar = document.querySelector<HTMLElement>('[data-discovery-bar="inspected"]');
  const discoveryRecoveredBar = document.querySelector<HTMLElement>('[data-discovery-bar="recovered"]');

  const cardEls = Array.from(document.querySelectorAll<HTMLElement>('[data-artifact-card]'));
  const cardSilenceEls = Array.from(document.querySelectorAll<HTMLElement>('[data-card-silence]'));
  const cardSummaryEls = Array.from(document.querySelectorAll<HTMLElement>('[data-card-summary]'));
  const discoveryPills = Array.from(document.querySelectorAll<HTMLElement>('[data-discovery-pill]'));
  const atlasPins = Array.from(document.querySelectorAll<SVGGElement>('[data-atlas-pin]'));
  const atlasChips = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-atlas-chip]'));
  const atlasCountMars = document.querySelector<HTMLElement>('[data-atlas-count="mars"]');
  const atlasCountMoon = document.querySelector<HTMLElement>('[data-atlas-count="moon"]');
  const atlasTooltipMars = document.querySelector<HTMLElement>('[data-atlas-tooltip="mars"]');
  const atlasTooltipMoon = document.querySelector<HTMLElement>('[data-atlas-tooltip="moon"]');

  const scrubberInput = document.getElementById('epoch-scrubber') as HTMLInputElement | null;
  const scrubberYearEl = document.getElementById('scrubber-year-value');
  const scrubberSummaryEl = document.getElementById('scrubber-state-summary');
  const scrubberResetBtn = document.getElementById('scrubber-reset-btn') as HTMLButtonElement | null;
  const lifelineRows = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-lifeline-row]'));
  const lifelinePlayheads = Array.from(document.querySelectorAll<HTMLElement>('[data-lifeline-playhead]'));
  const lifelineTooltipEl = document.getElementById('lifeline-tooltip');

  // Scanner Lens Refs
  const gridContainer = document.getElementById('artifact-grid');
  const lensEl = document.getElementById('scanner-lens');
  const scanToggleBtn = document.getElementById('scan-mode-toggle') as HTMLButtonElement | null;
  const scanStatusLabel = document.getElementById('scan-mode-label');

  // Plaque Dialog & HoldToLink Refs
  const dialog = document.getElementById('plaque-dialog') as HTMLDialogElement | null;
  const plaqueCloseBtn = document.getElementById('plaque-close') as HTMLButtonElement | null;
  const plaqueCopyBtn = document.getElementById('plaque-copy-link') as HTMLButtonElement | null;
  const plaquePrevBtn = document.getElementById('plaque-prev') as HTMLButtonElement | null;
  const plaqueNextBtn = document.getElementById('plaque-next') as HTMLButtonElement | null;
  const plaquePositionLabel = document.getElementById('plaque-position-label');
  const plaqueVerifBadge = document.getElementById('plaque-verification-badge');
  const plaqueVerifNote = document.getElementById('plaque-verification-note');
  const plaqueMetaTop = document.getElementById('plaque-meta-top');
  const plaqueTitle = document.getElementById('plaque-title');
  const plaqueYears = document.getElementById('plaque-years');
  const plaqueLaunch = document.getElementById('plaque-launch');
  const plaqueSilence = document.getElementById('plaque-silence');
  const plaqueSite = document.getElementById('plaque-site');
  const plaqueCoords = document.getElementById('plaque-coords');
  const plaqueEndCause = document.getElementById('plaque-end-cause');
  const plaqueModePill = document.getElementById('plaque-mode-pill');
  const plaqueSizeFact = document.getElementById('plaque-size-fact');
  const plaqueScience = document.getElementById('plaque-science');
  const plaqueSiteDesc = document.getElementById('plaque-site-desc');
  const plaqueSourcesList = document.getElementById('plaque-sources-list');
  const plaqueMediaSlots = Array.from(document.querySelectorAll<HTMLElement>('[data-plaque-media]'));

  const holdPanel = document.getElementById('hold-to-link-panel');
  const holdBtn = document.getElementById('hold-link-btn') as HTMLButtonElement | null;
  const holdProgress = document.getElementById('hold-link-progress') as SVGCircleElement | null;
  const holdGlyph = document.getElementById('hold-link-glyph');
  const holdStatus = document.getElementById('hold-link-status');
  const legacyContainer = document.getElementById('plaque-legacy-container');
  const legacyList = document.getElementById('plaque-legacy-list');

  let filteredArtifacts: Artifact[] = [...artifacts];
  let lastSrSilenceKey = '';
  let lastTriggerEl: (HTMLElement | SVGElement) | null = null;
  let openPlaqueArtifact: Artifact | null = null;
  let scanModeEnabled = false;

  // Bind progressive image error fallbacks without inline HTML event attributes
  for (const img of document.querySelectorAll<HTMLImageElement>('[data-plaque-img]')) {
    img.addEventListener('error', () => {
      img.hidden = true;
      const fallback = img.nextElementSibling as HTMLElement | null;
      if (fallback) fallback.hidden = false;
    });
  }

  const syncUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    if (activeBody === 'all') params.delete('body');
    else params.set('body', activeBody);

    if (activeType === 'all') params.delete('type');
    else params.set('type', activeType);

    if (readingMode === 'explorer') params.delete('mode');
    else params.set('mode', readingMode);

    if (!activeArtifactId) params.delete('artifact');
    else params.set('artifact', activeArtifactId);

    const qs = params.toString();
    const nextUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  };

  const getArtifactScienceText = (artifact: Artifact): string => {
    if (readingMode === 'explorer' && artifact.kidSummary) {
      return artifact.kidSummary;
    }
    return artifact.scientificValue;
  };

  const applyReadingMode = () => {
    for (const btn of readingModeButtons) {
      btn.setAttribute(
        'aria-pressed',
        btn.dataset.readingMode === readingMode ? 'true' : 'false',
      );
    }

    if (readingHintEl) {
      readingHintEl.textContent =
        readingMode === 'explorer'
          ? 'EXPLORER MODE · PLAIN-ENGLISH SUMMARIES & REAL-WORLD SIZE COMPARISONS'
          : 'MISSION LOG · FULL TECHNICAL SCIENTIFIC & ARCHIVAL TELEMETRY';
    }

    for (const el of cardSummaryEls) {
      const nextText =
        readingMode === 'explorer'
          ? el.dataset.kidText || el.dataset.techText || ''
          : el.dataset.techText || '';
      el.textContent = nextText;
    }

    if (plaqueModePill) {
      plaqueModePill.textContent =
        readingMode === 'explorer' ? 'EXPLORER SUMMARY' : 'MISSION LOG';
    }

    if (openPlaqueArtifact && plaqueScience) {
      plaqueScience.textContent = getArtifactScienceText(openPlaqueArtifact);
    }
  };

  const updateDiscoveryUI = () => {
    const latest = readDiscoveryState(artifactById.keys());
    inspectedIds.clear();
    for (const id of latest.inspectedIds) inspectedIds.add(id);
    recoveredIds.clear();
    for (const id of latest.recoveredIds) recoveredIds.add(id);

    const total = Math.max(1, artifacts.length);
    const inspectedCount = inspectedIds.size;
    const recoveredCount = recoveredIds.size;

    if (discoveryInspectedEl) discoveryInspectedEl.textContent = String(inspectedCount);
    if (discoveryRecoveredEl) discoveryRecoveredEl.textContent = String(recoveredCount);
    if (discoveryInspectedBar) {
      discoveryInspectedBar.style.width = `${((inspectedCount / total) * 100).toFixed(1)}%`;
    }
    if (discoveryRecoveredBar) {
      discoveryRecoveredBar.style.width = `${((recoveredCount / total) * 100).toFixed(1)}%`;
    }

    for (const card of cardEls) {
      const id = card.dataset.artifactCard || '';
      const state = recoveredIds.has(id)
        ? 'recovered'
        : inspectedIds.has(id)
          ? 'inspected'
          : 'dormant';
      card.dataset.discoveryState = state;
    }

    for (const pill of discoveryPills) {
      const id = pill.dataset.discoveryPill || '';
      const state = recoveredIds.has(id)
        ? 'recovered'
        : inspectedIds.has(id)
          ? 'inspected'
          : 'dormant';
      pill.dataset.discoveryState = state;
      pill.textContent =
        state === 'recovered' ? 'RECOVERED' : state === 'inspected' ? 'INSPECTED' : 'DORMANT';
    }
  };

  const updateLiveClocks = (nowMs: number) => {
    // 1. Filtered KPI combined silence
    const combined = computeCombinedSilence(
      filteredArtifacts.map((a) => a.lastContactDate),
      nowMs,
    );
    if (kpiCombinedEl) {
      kpiCombinedEl.textContent = filteredArtifacts.length > 0 ? combined.formattedMono : '0000Y : 000D : 00:00:00';
    }
    const srKey = `${filteredArtifacts.length}:${combined.years}:${combined.days}:${combined.hours}`;
    if (kpiCombinedSrEl && srKey !== lastSrSilenceKey) {
      lastSrSilenceKey = srKey;
      kpiCombinedSrEl.textContent = combined.formattedAccessible;
    }

    // 2. Individual artifact cards
    for (const el of cardSilenceEls) {
      const iso = el.dataset.lastContact;
      if (iso) el.textContent = formatSilenceLine(iso, nowMs);
    }

    // 3. Currently open plaque live counter
    if (dialog?.open && openPlaqueArtifact && plaqueSilence) {
      plaqueSilence.textContent = formatSilenceLine(openPlaqueArtifact.lastContactDate, nowMs);
    }
  };

  const updateTimelineState = () => {
    const span = Math.max(1, maxYear - minYear);
    const playheadPct = Math.min(100, Math.max(0, ((scrubYear - minYear) / span) * 100));

    if (scrubberYearEl) scrubberYearEl.textContent = String(scrubYear);
    if (scrubberResetBtn) scrubberResetBtn.disabled = scrubYear >= maxYear;
    for (const head of lifelinePlayheads) {
      head.style.left = `${playheadPct.toFixed(2)}%`;
    }

    let operatingCount = 0;
    let silentCount = 0;
    let preLaunchCount = 0;

    const filteredIds = new Set(filteredArtifacts.map((a) => a.id));

    for (const artifact of artifacts) {
      const state = getArtifactTimelineState(
        artifact.launchDate,
        artifact.lastContactDate,
        scrubYear,
        maxYear,
      );
      if (filteredIds.has(artifact.id)) {
        if (state === 'operating') operatingCount += 1;
        else if (state === 'silent') silentCount += 1;
        else preLaunchCount += 1;
      }

      const row = lifelineRows.find((r) => r.dataset.lifelineRow === artifact.id);
      if (row) {
        row.dataset.timelineState = state;
        const badge = row.querySelector<HTMLElement>('[data-lifeline-badge]');
        if (badge) {
          badge.textContent =
            state === 'operating' ? 'OPERATING' : state === 'pre-launch' ? 'PRE-LAUNCH' : 'SILENT';
        }
      }

      const pin = atlasPins.find((p) => p.dataset.atlasPin === artifact.id);
      if (pin) {
        pin.dataset.timelineState = state;
      }
    }

    if (scrubberSummaryEl) {
      scrubberSummaryEl.textContent = `${operatingCount} OPERATING · ${silentCount} SILENT · ${preLaunchCount} NOT YET LAUNCHED`;
    }
  };

  const applyFilters = () => {
    filteredArtifacts = artifacts.filter((a) => {
      const matchBody = activeBody === 'all' || a.body === activeBody;
      const matchType = activeType === 'all' || a.type === activeType;
      return matchBody && matchType;
    });

    const visibleIds = new Set(filteredArtifacts.map((a) => a.id));
    const isFiltered = activeBody !== 'all' || activeType !== 'all';

    // Filter button aria-pressed states
    for (const btn of bodyButtons) {
      btn.setAttribute('aria-pressed', btn.dataset.filterBody === activeBody ? 'true' : 'false');
    }
    for (const btn of typeButtons) {
      btn.setAttribute('aria-pressed', btn.dataset.filterType === activeType ? 'true' : 'false');
    }

    if (resetInlineBtn) {
      resetInlineBtn.classList.toggle('hidden', !isFiltered);
    }

    // Live announcement & empty state
    if (liveStatusEl) {
      liveStatusEl.textContent =
        filteredArtifacts.length === 0
          ? 'NO SIGNAL IN THIS FILTER'
          : `SHOWING ${filteredArtifacts.length} OF ${artifacts.length} SCIENTIFIC MONUMENTS`;
    }
    if (emptyStateEl) {
      emptyStateEl.hidden = filteredArtifacts.length > 0;
    }

    // KPI strip updates
    const marsCount = filteredArtifacts.filter((a) => a.body === 'mars').length;
    const moonCount = filteredArtifacts.filter((a) => a.body === 'moon').length;
    const verifiedCount = filteredArtifacts.filter((a) => a.verification === 'verified').length;
    const pendingCount = filteredArtifacts.length - verifiedCount;
    const latest = [...filteredArtifacts].sort((a, b) =>
      b.lastContactDate.localeCompare(a.lastContactDate),
    )[0];

    if (kpiCountEl) kpiCountEl.textContent = String(filteredArtifacts.length);
    if (kpiVerifiedEl) {
      kpiVerifiedEl.textContent = `${verifiedCount} VERIFIED · ${pendingCount} TO VERIFY`;
    }
    if (kpiBodySplitEl) kpiBodySplitEl.textContent = `MARS ${marsCount} / MOON ${moonCount}`;
    if (kpiLatestDateEl) {
      kpiLatestDateEl.textContent = latest ? latest.lastContactDate : 'NONE';
    }
    if (kpiLatestNameEl) {
      kpiLatestNameEl.textContent = latest
        ? `${latest.name.toUpperCase()} · UTC`
        : 'NO MATCHING SIGNAL';
    }

    // Cards
    for (const card of cardEls) {
      const id = card.dataset.artifactCard || '';
      card.hidden = !visibleIds.has(id);
    }

    // Lifeline rows
    for (const row of lifelineRows) {
      const id = row.dataset.lifelineRow || '';
      row.hidden = !visibleIds.has(id);
    }

    // Surface Atlas pins & chips
    for (const pin of atlasPins) {
      const id = pin.dataset.atlasPin || '';
      const active = visibleIds.has(id);
      pin.dataset.filtered = active ? 'true' : 'false';
      pin.setAttribute('tabindex', active ? '0' : '-1');
    }
    for (const chip of atlasChips) {
      const id = chip.dataset.atlasChip || '';
      chip.hidden = !visibleIds.has(id);
    }
    if (atlasCountMars) atlasCountMars.textContent = `${marsCount} SITES`;
    if (atlasCountMoon) atlasCountMoon.textContent = `${moonCount} SITES`;

    updateTimelineState();
    updateLiveClocks(Date.now());
    syncUrlParams();
  };

  // Filter & Reading Mode Event Listeners
  for (const btn of bodyButtons) {
    btn.addEventListener('click', () => {
      activeBody = btn.dataset.filterBody || 'all';
      applyFilters();
      playSonarTone('tick');
    });
  }
  for (const btn of typeButtons) {
    btn.addEventListener('click', () => {
      activeType = btn.dataset.filterType || 'all';
      applyFilters();
      playSonarTone('tick');
    });
  }
  for (const btn of readingModeButtons) {
    btn.addEventListener('click', () => {
      readingMode = btn.dataset.readingMode === 'technical' ? 'technical' : 'explorer';
      setReadingMode(readingMode);
      applyReadingMode();
      syncUrlParams();
      playSonarTone('tick');
    });
  }
  const resetAllFilters = () => {
    activeBody = 'all';
    activeType = 'all';
    applyFilters();
    playSonarTone('tick');
  };
  resetInlineBtn?.addEventListener('click', resetAllFilters);
  emptyResetBtn?.addEventListener('click', resetAllFilters);

  // Scrubber Event Listeners
  let lastTickToneMs = 0;
  scrubberInput?.addEventListener('input', () => {
    scrubYear = Number.parseInt(scrubberInput.value, 10) || maxYear;
    updateTimelineState();
    const now = performance.now();
    if (now - lastTickToneMs > 95) {
      lastTickToneMs = now;
      playSonarTone('tick');
    }
  });
  scrubberResetBtn?.addEventListener('click', () => {
    scrubYear = maxYear;
    if (scrubberInput) scrubberInput.value = String(maxYear);
    updateTimelineState();
    playSonarTone('tick');
  });

  // Lifeline Tooltip Hover / Focus
  const showLifelineTooltip = (row: HTMLButtonElement) => {
    if (!lifelineTooltipEl) return;
    const id = row.dataset.lifelineRow || '';
    const art = artifactById.get(id);
    if (!art) return;
    const op = formatOperationalDuration(art.launchDate, art.lastContactDate);
    const silent = formatSilenceCompact(art.lastContactDate, Date.now());
    lifelineTooltipEl.textContent = `${art.name.toUpperCase()} · ${art.launchDate} -> ${art.lastContactDate} · ACTIVE ${op} · SILENT ${silent}`;
  };
  for (const row of lifelineRows) {
    row.addEventListener('mouseenter', () => showLifelineTooltip(row));
    row.addEventListener('focus', () => showLifelineTooltip(row));
  }

  // Surface Atlas Pin Hover / Focus / Activation
  const inspectPin = (pin: SVGGElement) => {
    const id = pin.dataset.atlasPin || '';
    const body = pin.dataset.body as 'mars' | 'moon' | undefined;
    const art = artifactById.get(id);
    if (!art || !body) return;

    for (const p of atlasPins) {
      if (p.dataset.body === body) {
        p.dataset.active = p === pin ? 'true' : 'false';
      }
    }

    const state = getArtifactTimelineState(
      art.launchDate,
      art.lastContactDate,
      scrubYear,
      maxYear,
    ).toUpperCase();
    const coords = formatCoordinates(art.site.lat, art.site.lon);
    const tooltip = body === 'mars' ? atlasTooltipMars : atlasTooltipMoon;
    if (tooltip) {
      tooltip.textContent = `${art.name.toUpperCase()} · ${art.site.name} · ${coords} · [${scrubYear}: ${state}]`;
    }
  };

  for (const pin of atlasPins) {
    pin.addEventListener('mouseenter', () => inspectPin(pin));
    pin.addEventListener('focus', () => inspectPin(pin));
    pin.addEventListener('click', () => {
      const id = pin.dataset.atlasPin;
      if (id && pin.dataset.filtered !== 'false') openPlaque(id, pin);
    });
    pin.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const id = pin.dataset.atlasPin;
        if (id && pin.dataset.filtered !== 'false') openPlaque(id, pin);
      }
    });
  }

  // Scanner Lens Progressive Enhancement (mouse hover + touch drag when Scan Mode is ON)
  let lastScanToneMs = 0;
  let lastScannedCardId = '';

  const updateLensHits = (clientX: number, clientY: number) => {
    if (!gridContainer || !lensEl) return;
    const rect = gridContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    lensEl.style.left = `${x}px`;
    lensEl.style.top = `${y}px`;
    lensEl.hidden = false;

    let closestCardId = '';
    let closestDist = 9999;

    for (const card of cardEls) {
      if (card.hidden) continue;
      const cRect = card.getBoundingClientRect();
      const nearestX = Math.max(cRect.left, Math.min(clientX, cRect.right));
      const nearestY = Math.max(cRect.top, Math.min(clientY, cRect.bottom));
      const dist = Math.hypot(clientX - nearestX, clientY - nearestY);
      const isHit = dist <= 85;
      card.dataset.lensHit = isHit ? 'true' : 'false';
      if (isHit && dist < closestDist) {
        closestDist = dist;
        closestCardId = card.dataset.artifactCard || '';
      }
    }

    if (scanModeEnabled && closestCardId && closestCardId !== lastScannedCardId) {
      lastScannedCardId = closestCardId;
      const now = performance.now();
      if (now - lastScanToneMs > 160) {
        lastScanToneMs = now;
        playSonarTone('scan');
      }
    }
  };

  const clearLensHits = () => {
    if (lensEl) lensEl.hidden = true;
    lastScannedCardId = '';
    for (const card of cardEls) {
      card.dataset.lensHit = scanModeEnabled ? 'true' : 'false';
    }
  };

  gridContainer?.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && scanModeEnabled) {
      updateLensHits(e.clientX, e.clientY);
    }
  });
  gridContainer?.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && !scanModeEnabled) return;
    updateLensHits(e.clientX, e.clientY);
  });
  gridContainer?.addEventListener('pointerleave', clearLensHits);
  gridContainer?.addEventListener('pointercancel', clearLensHits);

  scanToggleBtn?.addEventListener('click', () => {
    scanModeEnabled = !scanModeEnabled;
    scanToggleBtn.setAttribute('aria-pressed', scanModeEnabled ? 'true' : 'false');
    if (gridContainer) {
      gridContainer.dataset.scanMode = scanModeEnabled ? 'true' : 'false';
    }
    if (scanStatusLabel) {
      scanStatusLabel.textContent = scanModeEnabled ? 'SCAN MODE: ON' : 'SCAN MODE: OFF';
    }
    for (const card of cardEls) {
      card.dataset.lensHit = scanModeEnabled ? 'true' : 'false';
    }
    if (!scanModeEnabled && lensEl) {
      lensEl.hidden = true;
    }
    playSonarTone(scanModeEnabled ? 'scan' : 'tick');
  });

  // HoldToLink Symbolic Reactivation Logic
  let holdRafId = 0;
  let holdStartMs = 0;
  let holdActive = false;
  let isRecovered = false;

  const setLinkVisualState = (state: 'dormant' | 'scanning' | 'recovered', progress = 0) => {
    if (holdPanel) holdPanel.dataset.linkState = state;
    if (dialog) dialog.dataset.linkState = state;

    if (holdProgress) {
      const clamped = Math.min(1, Math.max(0, progress));
      holdProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - clamped));
      holdProgress.style.stroke = state === 'recovered' ? '#FF9F1C' : '#2EC4B6';
    }

    if (state === 'dormant') {
      if (holdGlyph) holdGlyph.textContent = 'HOLD';
      if (holdStatus) holdStatus.textContent = 'SYMBOLIC LINK // DORMANT ARCHIVE STATE';
      if (legacyContainer) legacyContainer.hidden = true;
    } else if (state === 'scanning') {
      if (holdGlyph) holdGlyph.textContent = `${Math.round(progress * 100)}%`;
      if (holdStatus) holdStatus.textContent = 'SCANNING TELEMETRY // RE-ESTABLISHING SYMBOLIC LINK';
    } else {
      isRecovered = true;
      if (holdGlyph) holdGlyph.textContent = 'LINKED';
      if (holdStatus) holdStatus.textContent = 'DATA RECOVERED // SYMBOLIC ARCHIVAL REACTIVATION';
      if (legacyContainer) legacyContainer.hidden = false;
    }
  };

  const completeLinkRecovery = () => {
    holdActive = false;
    window.cancelAnimationFrame(holdRafId);
    setLinkVisualState('recovered', 1);
    if (openPlaqueArtifact) {
      markArtifactRecovered(openPlaqueArtifact.id);
      updateDiscoveryUI();
    }
    playSonarTone('recover');
  };

  const resetHoldLink = () => {
    holdActive = false;
    isRecovered = false;
    window.cancelAnimationFrame(holdRafId);
    setLinkVisualState('dormant', 0);
  };

  const stepHold = () => {
    if (!holdActive || isRecovered) return;
    const elapsed = performance.now() - holdStartMs;
    const progress = Math.min(1, elapsed / HOLD_DURATION_MS);
    setLinkVisualState('scanning', progress);
    if (progress >= 1) {
      completeLinkRecovery();
      return;
    }
    holdRafId = window.requestAnimationFrame(stepHold);
  };

  const beginHold = () => {
    if (isRecovered || holdActive) return;
    if (reducedMotion) {
      completeLinkRecovery();
      return;
    }
    holdActive = true;
    holdStartMs = performance.now();
    holdRafId = window.requestAnimationFrame(stepHold);
  };

  const cancelOrTapHold = () => {
    if (!holdActive || isRecovered) return;
    const elapsed = performance.now() - holdStartMs;
    holdActive = false;
    window.cancelAnimationFrame(holdRafId);
    if (elapsed < QUICK_TAP_THRESHOLD_MS) {
      completeLinkRecovery();
    } else {
      setLinkVisualState('dormant', 0);
    }
  };

  holdBtn?.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    beginHold();
  });
  holdBtn?.addEventListener('pointerup', cancelOrTapHold);
  holdBtn?.addEventListener('pointerleave', () => {
    if (holdActive && !isRecovered) {
      holdActive = false;
      window.cancelAnimationFrame(holdRafId);
      setLinkVisualState('dormant', 0);
    }
  });
  holdBtn?.addEventListener('pointercancel', () => {
    if (holdActive && !isRecovered) {
      holdActive = false;
      window.cancelAnimationFrame(holdRafId);
      setLinkVisualState('dormant', 0);
    }
  });
  holdBtn?.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
      e.preventDefault();
      beginHold();
    }
  });
  holdBtn?.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cancelOrTapHold();
    }
  });

  // Plaque Dialog Rendering, Focus Trap & Deep-Linking
  function openPlaque(id: string, trigger?: (HTMLElement | SVGElement) | null): void {
    const artifact = artifactById.get(id);
    if (!artifact || !dialog) return;

    const wasOpen = dialog.open;
    openPlaqueArtifact = artifact;
    activeArtifactId = id;
    if (!wasOpen) {
      const activeDocEl = document.activeElement;
      lastTriggerEl =
        trigger ??
        (activeDocEl instanceof HTMLElement || activeDocEl instanceof SVGElement
          ? activeDocEl
          : null);
    }

    markArtifactInspected(id);
    updateDiscoveryUI();

    resetHoldLink();
    if (recoveredIds.has(id)) {
      isRecovered = true;
      setLinkVisualState('recovered', 1);
    }

    if (plaqueVerifBadge) {
      plaqueVerifBadge.textContent =
        artifact.verification === 'verified' ? 'VERIFIED NASA TELEMETRY' : 'DATA TO VERIFY';
      plaqueVerifBadge.className =
        artifact.verification === 'verified'
          ? 'border border-[var(--color-turquoise-border)] bg-[var(--color-turquoise-dim)] px-2 py-0.5 font-bold tracking-[0.12em] text-[var(--color-turquoise)]'
          : 'border border-[var(--color-alert-border)] bg-[var(--color-alert-dim)] px-2 py-0.5 font-bold tracking-[0.12em] text-[var(--color-text-primary)]';
    }
    if (plaqueVerifNote) {
      plaqueVerifNote.textContent =
        artifact.verificationNote ||
        (artifact.verification === 'verified'
          ? 'Cross-checked against NSSDCA Master Catalog and NASA Science documentation.'
          : 'Awaiting primary tabular verification.');
    }

    if (plaqueMetaTop) {
      plaqueMetaTop.textContent = `${artifact.body.toUpperCase()} · ${artifact.type.toUpperCase()} · ${artifact.agency} · ${artifact.nssdcId}`;
    }
    if (plaqueTitle) plaqueTitle.textContent = artifact.name;
    if (plaqueYears) {
      plaqueYears.textContent = `OPERATIONAL SPAN: ${artifact.launchDate} TO ${artifact.lastContactDate} UTC`;
    }
    if (plaqueLaunch) plaqueLaunch.textContent = `${artifact.launchDate} UTC`;
    if (plaqueSilence) plaqueSilence.textContent = formatSilenceLine(artifact.lastContactDate, Date.now());
    if (plaqueSite) plaqueSite.textContent = artifact.site.name;
    if (plaqueCoords) plaqueCoords.textContent = formatCoordinates(artifact.site.lat, artifact.site.lon);
    if (plaqueEndCause) plaqueEndCause.textContent = artifact.endCause;
    if (plaqueModePill) {
      plaqueModePill.textContent =
        readingMode === 'explorer' ? 'EXPLORER SUMMARY' : 'MISSION LOG';
    }
    if (plaqueSizeFact) {
      if (artifact.sizeFact) {
        plaqueSizeFact.textContent = `SCALE · ${artifact.sizeFact}`;
        plaqueSizeFact.hidden = false;
      } else {
        plaqueSizeFact.hidden = true;
      }
    }
    if (plaqueScience) plaqueScience.textContent = getArtifactScienceText(artifact);
    if (plaqueSiteDesc) plaqueSiteDesc.textContent = artifact.site.description;

    const navPool = filteredArtifacts.some((a) => a.id === id) ? filteredArtifacts : artifacts;
    const navIndex = Math.max(
      0,
      navPool.findIndex((a) => a.id === id),
    );
    if (plaquePositionLabel) {
      plaquePositionLabel.textContent = `${navIndex + 1} / ${navPool.length}`;
    }
    if (plaquePrevBtn) plaquePrevBtn.disabled = navPool.length <= 1;
    if (plaqueNextBtn) plaqueNextBtn.disabled = navPool.length <= 1;

    // Show pre-rendered astro:assets media figure
    for (const slot of plaqueMediaSlots) {
      slot.hidden = slot.dataset.plaqueMedia !== artifact.id;
    }

    // Populate legacy list (stays hidden until HoldToLink completes)
    if (legacyList) {
      legacyList.replaceChildren(
        ...artifact.legacy.map((item) => {
          const li = document.createElement('li');
          li.className = 'border border-[var(--color-border)] bg-[var(--color-slate)] p-3 text-sm leading-relaxed text-[var(--color-text-primary)]';

          const p = document.createElement('p');
          p.textContent = item.finding;

          const a = document.createElement('a');
          a.href = item.sourceUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'mt-1.5 inline-block font-mono-telemetry text-[10px] tracking-[0.08em] text-[var(--color-amber)] underline underline-offset-2';
          a.textContent = `SOURCE: ${item.sourceTitle}`;

          li.append(p, a);
          return li;
        }),
      );
    }

    // Populate official sources list
    if (plaqueSourcesList) {
      plaqueSourcesList.replaceChildren(
        ...artifact.sources.map((src) => {
          const li = document.createElement('li');
          li.className = 'flex flex-wrap items-center justify-between gap-2 border border-[var(--color-border)] bg-[var(--color-void)] px-3 py-2';

          const a = document.createElement('a');
          a.href = src.url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = 'text-[var(--color-turquoise)] underline underline-offset-2';
          a.textContent = src.title;

          const dateSpan = document.createElement('span');
          dateSpan.className = 'text-[10px] text-[var(--color-text-secondary)]';
          dateSpan.textContent = `ACCESSED ${src.accessedDate}`;

          li.append(a, dateSpan);
          return li;
        }),
      );
    }

    if (plaqueCopyBtn) plaqueCopyBtn.textContent = 'Copy link';
    syncUrlParams();
    playSonarTone('ping');

    if (!dialog.open) {
      dialog.showModal();
      plaqueCloseBtn?.focus();
    } else {
      dialog.scrollTop = 0;
    }
  }

  const stepPlaque = (delta: number) => {
    if (!openPlaqueArtifact) return;
    const navPool = filteredArtifacts.some((a) => a.id === openPlaqueArtifact?.id)
      ? filteredArtifacts
      : artifacts;
    if (navPool.length <= 1) return;
    const currentIndex = navPool.findIndex((a) => a.id === openPlaqueArtifact?.id);
    const nextIndex = (currentIndex + delta + navPool.length) % navPool.length;
    openPlaque(navPool[nextIndex].id, null);
  };

  const closePlaque = () => {
    if (!dialog?.open) return;
    dialog.close();
  };

  dialog?.addEventListener('close', () => {
    resetHoldLink();
    openPlaqueArtifact = null;
    activeArtifactId = null;
    syncUrlParams();
    lastTriggerEl?.focus();
    lastTriggerEl = null;
  });

  dialog?.addEventListener('click', (e) => {
    if (e.target === dialog) closePlaque();
  });

  // Explicit keyboard focus trap inside native <dialog>
  dialog?.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !dialog.open) return;
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hidden && el.offsetParent !== null);

    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  plaqueCloseBtn?.addEventListener('click', closePlaque);
  plaquePrevBtn?.addEventListener('click', () => stepPlaque(-1));
  plaqueNextBtn?.addEventListener('click', () => stepPlaque(1));

  plaqueCopyBtn?.addEventListener('click', async () => {
    if (!plaqueCopyBtn) return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      plaqueCopyBtn.textContent = 'Link copied';
    } catch {
      plaqueCopyBtn.textContent = 'URL in address bar';
    }
    window.setTimeout(() => {
      if (plaqueCopyBtn) plaqueCopyBtn.textContent = 'Copy link';
    }, 1800);
  });

  // Delegate open-plaque triggers on cards & chips
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-open-plaque]');
    if (!target) return;
    const id = target.dataset.openPlaque;
    if (id) openPlaque(id, target);
  });

  // Delegate cross-section links (e.g. from Surface Expedition) to open the monument plaque in Archive
  document.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('[data-open-archive-plaque]');
    if (!link) return;
    const id = link.dataset.openArchivePlaque;
    if (!id || !artifactById.has(id)) return;
    e.preventDefault();
    document.getElementById('archive')?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
    openPlaque(id, link);
  });

  subscribeDiscoveryChange(() => {
    updateDiscoveryUI();
    if (dialog?.open && openPlaqueArtifact && recoveredIds.has(openPlaqueArtifact.id) && !isRecovered) {
      isRecovered = true;
      setLinkVisualState('recovered', 1);
    }
  });

  subscribeReadingModeChange((nextMode) => {
    if (readingMode !== nextMode) {
      readingMode = nextMode;
      applyReadingMode();
    }
  });

  // Start shared ticker & apply initial state
  applyFilters();
  applyReadingMode();
  updateDiscoveryUI();
  subscribeMissionClock(updateLiveClocks);

  if (activeArtifactId) {
    openPlaque(activeArtifactId, null);
  }
}
