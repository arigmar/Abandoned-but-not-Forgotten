import type { DiscoveryStatus, ReadingMode } from '../discovery';
import { formatCoordinates } from '../format';
import type { ExpeditionArtifact, ExpeditionPhase, HotspotData, ProjectedHotspot } from './types';

export interface HudActions {
  onSkip: () => void;
  onPauseToggle: () => void;
  onFullscreenToggle: () => void;
  onExit: () => void;
  onResume: () => void;
  onRestart: () => void;
  onAbortToSelector: () => void;
  onPulse: () => void;
  onAutoApproach: () => void;
  onPrevHotspot: () => void;
  onNextHotspot: () => void;
  onScanActive: () => void;
  onReturnDrive: () => void;
  onSelectHotspot: (index: number) => void;
  onRecoverComplete: () => void;
  onSelectNavTarget?: (body: 'moon' | 'mars') => void;
  onFlightAssist?: () => void;
  onRetryDescent?: () => void;
  onLaunchOrbit?: () => void;
  onExploreSurface?: () => void;
  onContinueSurface?: () => void;
  onDiagnosticTest?: () => void;
  onSimModeChange?: (nominal: boolean) => void;
}

export interface ExpeditionHud {
  setPhase: (phase: ExpeditionPhase) => void;
  setActiveArtifact: (
    artifact: ExpeditionArtifact,
    hotspots: HotspotData[],
    status: DiscoveryStatus,
  ) => void;
  setDiagnosticTested: (testedIds: Set<string>) => void;
  setReadingMode: (mode: ReadingMode) => void;
  setDiscoveryStatus: (status: DiscoveryStatus) => void;
  setDistanceReadout: (text: string) => void;
  setPaused: (paused: boolean) => void;
  setApproachEngaged: (engaged: boolean) => void;
  setFlightAssistEngaged: (phase: 'transit' | 'descent', engaged: boolean) => void;
  setNavTargetBody: (body: 'moon' | 'mars') => void;
  setDescentRetryVisible: (visible: boolean) => void;
  setTouchdownState: (
    state: 'flying' | 'landed' | 'offpad' | 'crashed',
    impactReason?: string,
  ) => void;
  setHotspots: (hotspots: HotspotData[]) => void;
  updateHotspotProjection: (projected: ProjectedHotspot[]) => void;
  setInspectionProgress: (scannedCount: number, total: number, unlocked: boolean) => void;
  showPlaque: (hotspot: HotspotData | null) => void;
  startKeyboardHold: () => void;
  stopKeyboardHold: () => void;
  tickHold: (nowMs: number) => void;
  showCompleteCard: () => void;
  resetRun: () => void;
  announce: (message: string) => void;
  destroy: () => void;
}

const HOLD_RING_CIRCUMFERENCE = 138.23;
const HOLD_DURATION_MS = 1200;
const QUICK_TAP_THRESHOLD_MS = 220;

const PHASE_LABELS: Record<ExpeditionPhase, string> = {
  transit: 'PHASE 01 // TRANSIT',
  descent: 'PHASE 02 // DESCENT',
  drive: 'PHASE 03 // SURFACE DRIVE',
  inspect: 'PHASE 04 // EXTERIOR INSPECT',
  complete: 'MISSION COMPLETE // RECORDED',
  ascent: 'ASCENT // LIFTOFF TO ORBIT',
};

const HOTSPOT_SUBSYSTEMS: Record<string, string[]> = {
  opportunity: [
    'Solar Arrays · Power Loss',
    'Pancam Mast · Dimensions & Dates',
    'Rocker-Bogie Deck · Mission Goal',
    'IDD Spectrometer Arm · Finding 01',
    'High-Gain Antenna · Finding 02',
  ],
  insight: [
    'Twin Solar Wings · Dust Power Loss',
    '3-Legged Deck · Dimensions & Dates',
    'SEIS Seismometer Dome · Mission Goal',
    'Interior Marsquakes · Finding 01',
    'Seasonal Dust Physics · Finding 02',
  ],
  ingenuity: [
    'Coaxial Rotors · Flight 72 Strike',
    'Top Solar Array · Dimensions & Dates',
    'Avionics Box · Mission Goal',
    'Carbon Landing Legs · Finding 01',
    'Flight Record · Finding 02',
  ],
  'surveyor-3': [
    'TV Camera Turret · Lunar Night',
    'Soil Sampler Scoop · Dimensions & Dates',
    'Spaceframe & Mast · Mission Goal',
    'Camera Material Study · Finding 01',
    'Apollo 12 Beacon · Finding 02',
  ],
  'apollo-11-easep': [
    'PSEP Telemetry Whip · Shutdown',
    'Dual Unit Scale · Dimensions & Dates',
    'PSEP Core & Wings · Mission Goal',
    'LRRR Prism Array · Finding 01',
    'Seismic & Dust Monitor · Finding 02',
  ],
  'apollo-15-alsep': [
    'S-Band Mast & Station · Shutdown',
    '3-Unit Layout · Dimensions & Dates',
    'SNAP-27 RTG & PSE · Mission Goal',
    'Heat Flow Probes · Finding 01',
    'Orbital Correlation · Finding 02',
  ],
};

export function buildArtifactHotspots(artifact: ExpeditionArtifact): HotspotData[] {
  const names = HOTSPOT_SUBSYSTEMS[artifact.id] ?? [
    'Exterior Array · End of Contact',
    'Frame Geometry · Scale & UTC Dates',
    'Main Assembly · Primary Purpose',
    'Instrument Feed · Legacy Finding 01',
    'Relay System · Legacy Finding 02',
  ];

  const endNote = artifact.verificationNote
    ? `${artifact.endCause} (${artifact.verificationNote})`
    : artifact.endCause;

  const sizeText = artifact.sizeFact ? `${artifact.sizeFact}. ` : '';
  const opsDates = `Launched ${artifact.launchDate} · Last contact ${artifact.lastContactDate} · Agency: ${artifact.agency} · Site: ${artifact.site.description}`;

  const legacy0 = artifact.legacy[0];
  const legacy1 = artifact.legacy[1];
  const endSummary = artifact.endCause.split('.')[0] || artifact.endCause;
  const legacy2 = artifact.legacy[2];

  const finding1Explorer = legacy0
    ? legacy0.finding
    : artifact.kidSummary ?? artifact.scientificValue;
  const finding1Tech = legacy0 ? `${legacy0.finding} (Logged ${artifact.lastContactDate})` : artifact.scientificValue;

  const finding2Text = [legacy1?.finding, legacy2?.finding].filter(Boolean).join(' ');

  const shortNominalPower =
    artifact.id === 'apollo-15-alsep'
      ? 'SNAP-27 RTG · Continuous 75W+'
      : artifact.body === 'mars'
        ? 'Solar Array Nominal · Peak Daylight'
        : 'Lunar Day Power · Full Battery';

  return [
    {
      id: `${artifact.id}-hp-1`,
      key: 1,
      label: names[0],
      eyebrow: 'EXTERIOR POINT 01 // END OF MISSION',
      title: names[0].split(' · ')[0],
      explorerBody: endNote,
      technicalBody: `${endNote} NSSDCA ID: ${artifact.nssdcId}.`,
      telemetry: {
        subsystemTag: 'POWER & SHUTDOWN',
        nominalMetric: 'Peak Operations',
        nominalValue: shortNominalPower,
        finalMetric: `Shutdown (${artifact.lastContactDate})`,
        finalValue: endSummary,
        waveform: 'power',
        testLabel: 'Run Power Bus Replay [F]',
        testResult: `Power trace replayed on ${artifact.name}: peak output recorded between ${artifact.launchDate} and ${artifact.lastContactDate}.`,
      },
      sourceTitle: artifact.sources[0]?.title,
      sourceUrl: artifact.sources[0]?.url,
    },
    {
      id: `${artifact.id}-hp-2`,
      key: 2,
      label: names[1],
      eyebrow: 'EXTERIOR POINT 02 // SCALE & LOG',
      title: names[1].split(' · ')[0],
      explorerBody: `${sizeText}${opsDates}`,
      technicalBody: `${sizeText}Launch UTC: ${artifact.launchDate} | Final contact UTC: ${artifact.lastContactDate} | Coordinates: ${formatCoordinates(artifact.site.lat, artifact.site.lon)} | ${artifact.site.description}`,
      telemetry: {
        subsystemTag: 'CHASSIS & EPOCH',
        nominalMetric: 'Scale Envelope',
        nominalValue: artifact.sizeFact ?? `${artifact.type.toUpperCase()} · ${artifact.nssdcId}`,
        finalMetric: 'Mission Timeline',
        finalValue: `${artifact.launchDate} -> ${artifact.lastContactDate}`,
        waveform: 'scale',
        testLabel: 'Run Laser Ranging Sweep [F]',
        testResult: `LIDAR sweep complete at ${artifact.site.name}: monument bounding profile & coordinate anchor verified against mini-rover.`,
      },
      sourceTitle: artifact.sources[0]?.title,
      sourceUrl: artifact.sources[0]?.url,
    },
    {
      id: `${artifact.id}-hp-3`,
      key: 3,
      label: names[2],
      eyebrow: 'EXTERIOR POINT 03 // SCIENTIFIC ROLE',
      title: names[2].split(' · ')[0],
      explorerBody: artifact.kidSummary ?? artifact.scientificValue,
      technicalBody: artifact.scientificValue,
      telemetry: {
        subsystemTag: 'CORE INSTRUMENT',
        nominalMetric: 'Primary Payload',
        nominalValue: names[2].split(' · ')[0],
        finalMetric: 'Lead Agency',
        finalValue: artifact.agency,
        waveform: 'seismic',
        testLabel: 'Simulate Instrument Pulse [F]',
        testResult: `Harmonic test carrier injected into ${names[2].split(' · ')[0]}: active response logged across ${artifact.body.toUpperCase()} surface node [3].`,
      },
      sourceTitle: artifact.sources[1]?.title ?? artifact.sources[0]?.title,
      sourceUrl: artifact.sources[1]?.url ?? artifact.sources[0]?.url,
    },
    {
      id: `${artifact.id}-hp-4`,
      key: 4,
      label: names[3],
      eyebrow: 'EXTERIOR POINT 04 // LEGACY FINDING I',
      title: names[3].split(' · ')[0],
      explorerBody: finding1Explorer,
      technicalBody: finding1Tech,
      telemetry: {
        subsystemTag: 'SCIENCE CHANNEL 01',
        nominalMetric: 'Data Channel',
        nominalValue: 'Calibrated Telemetry Frame',
        finalMetric: 'Verified Source',
        finalValue: legacy0?.sourceTitle ?? artifact.agency,
        waveform: 'sensor',
        testLabel: 'Decode Sensor Packet [F]',
        testResult: `Packet 04 decoded: "${legacy0?.finding ?? artifact.scientificValue}"`,
      },
      sourceTitle: legacy0?.sourceTitle,
      sourceUrl: legacy0?.sourceUrl,
    },
    {
      id: `${artifact.id}-hp-5`,
      key: 5,
      label: names[4],
      eyebrow: 'EXTERIOR POINT 05 // LEGACY FINDING II',
      title: names[4].split(' · ')[0],
      explorerBody: finding2Text || artifact.scientificValue,
      technicalBody: finding2Text || artifact.scientificValue,
      telemetry: {
        subsystemTag: 'HIGH-GAIN RELAY',
        nominalMetric: 'Relay Link',
        nominalValue: 'X/S-Band Lock',
        finalMetric: 'Archive Record',
        finalValue: legacy1?.sourceTitle ?? legacy2?.sourceTitle ?? 'Deep Space Network',
        waveform: 'relay',
        testLabel: 'Fire Orbital Relay Ping [F]',
        testResult: `Orbital relay ping echoed from node [5] on ${artifact.name}: carrier frame synced with surface telemetry.`,
      },
      sourceTitle: legacy1?.sourceTitle ?? legacy2?.sourceTitle,
      sourceUrl: legacy1?.sourceUrl ?? legacy2?.sourceUrl,
    },
  ];
}

export function createExpeditionHud(
  artifact: ExpeditionArtifact,
  stageEl: HTMLElement,
  liveRegionEl: HTMLElement | null,
  initialMode: ReadingMode,
  reducedMotion: boolean,
  actions: HudActions,
): ExpeditionHud {
  let currentArtifact: ExpeditionArtifact = artifact;
  let currentMode: ReadingMode = initialMode;
  let currentPhase: ExpeditionPhase = 'transit';
  let activePlaque: HotspotData | null = null;
  let currentHotspotList: HotspotData[] = [];
  let testedHotspotIds = new Set<string>();
  let simNominal = true;
  let holdUnlocked = false;
  let holdCompleted = false;
  let holdActive = false;
  let holdStartedAt = 0;

  const byId = <T extends HTMLElement>(id: string): T | null =>
    document.getElementById(id) as T | null;

  const phaseLabelEl = byId('hud-phase-label');
  const targetNameEl = byId('hud-target-name');
  const nssdcEl = byId('hud-nssdc');
  const verifyBadgeEl = byId('hud-verification-badge');
  const scalePillEl = byId('hud-scale-pill');
  const targetSwitchEl = byId('hud-target-switch');
  const targetMoonBtn = byId<HTMLButtonElement>('hud-target-moon');
  const targetMarsBtn = byId<HTMLButtonElement>('hud-target-mars');
  const assistBtn = byId<HTMLButtonElement>('hud-assist-btn');
  const retryBtn = byId<HTMLButtonElement>('hud-retry-btn');
  const orbitBtn = byId<HTMLButtonElement>('hud-orbit-btn');
  const skipBtn = byId<HTMLButtonElement>('hud-skip-btn');
  const pauseBtn = byId<HTMLButtonElement>('hud-pause-btn');
  const fullscreenBtn = byId<HTMLButtonElement>('hud-fullscreen-btn');
  const exitBtn = byId<HTMLButtonElement>('hud-exit-btn');

  const siteNameEl = byId('hud-site-name');
  const siteCoordsEl = byId('hud-site-coords');
  const distanceEl = byId('hud-distance-readout');
  const stateBadgeEl = byId('hud-state-badge');

  const hotspotsLayerEl = byId('hud-hotspots-layer');
  const touchdownCardEl = byId('hud-touchdown-card');
  const touchdownEyebrowEl = byId('hud-touchdown-eyebrow');
  const touchdownTitleEl = byId('hud-touchdown-title');
  const touchdownBodyEl = byId('hud-touchdown-body');
  const touchdownExploreBtn = byId<HTMLButtonElement>('hud-touchdown-explore-btn');
  const touchdownOrbitBtn = byId<HTMLButtonElement>('hud-touchdown-orbit-btn');
  const touchdownRetryBtn = byId<HTMLButtonElement>('hud-touchdown-retry-btn');

  const plaqueCardEl = byId('hud-plaque-card');
  const plaqueEyebrowEl = byId('hud-plaque-eyebrow');
  const plaqueTabsEl = byId('hud-plaque-tabs');
  const plaqueModePillEl = byId('hud-plaque-mode-pill');
  const plaqueTitleEl = byId('hud-plaque-title');
  const plaqueBodyEl = byId('hud-plaque-body');
  const plaqueMetricLabelEl = byId('hud-plaque-metric-label');
  const plaqueMetricValueEl = byId('hud-plaque-metric-value');
  const plaqueSimToggleBtn = byId<HTMLButtonElement>('hud-plaque-sim-toggle');
  const plaqueWaveEl = byId('hud-plaque-wave');
  const plaqueTestBtn = byId<HTMLButtonElement>('hud-plaque-test-btn');
  const plaqueTestResultEl = byId('hud-plaque-test-result');
  const plaqueSourceEl = byId<HTMLAnchorElement>('hud-plaque-source');
  const plaqueCloseBtn = byId<HTMLButtonElement>('hud-plaque-close-btn');
  const plaqueNextBtn = byId<HTMLButtonElement>('hud-plaque-next-btn');

  const driveControlsEl = byId('hud-drive-controls');
  const pulseBtn = byId<HTMLButtonElement>('hud-pulse-btn');
  const approachBtn = byId<HTMLButtonElement>('hud-approach-btn');
  const driveOrbitBtn = byId<HTMLButtonElement>('hud-drive-orbit-btn');

  const inspectControlsEl = byId('hud-inspect-controls');
  const hotspotProgressEl = byId('hud-hotspot-progress');
  const prevHotspotBtn = byId<HTMLButtonElement>('hud-prev-hotspot');
  const scanBtn = byId<HTMLButtonElement>('hud-scan-btn');
  const nextHotspotBtn = byId<HTMLButtonElement>('hud-next-hotspot');
  const returnDriveBtn = byId<HTMLButtonElement>('hud-return-drive-btn');
  const inspectOrbitBtn = byId<HTMLButtonElement>('hud-inspect-orbit-btn');

  const holdBtn = byId<HTMLButtonElement>('hud-hold-btn');
  const holdProgressCircle = document.getElementById('hud-hold-progress') as SVGCircleElement | null;
  const holdStatusEl = byId('hud-hold-status');

  const pauseOverlayEl = byId('expedition-pause-overlay');
  const resumeBtn = byId<HTMLButtonElement>('hud-resume-btn');
  const restartBtn = byId<HTMLButtonElement>('hud-restart-btn');
  const abortBtn = byId<HTMLButtonElement>('hud-abort-btn');

  const completeCardEl = byId('expedition-complete-card');
  const completeScaleEl = byId('hud-complete-scale');
  const completeTitleEl = byId('hud-complete-title');
  const completeLegacyListEl = byId('hud-complete-legacy-list');
  const completeArchiveLinkEl = byId<HTMLAnchorElement>('hud-complete-archive-link');
  const completeAnotherBtn = byId<HTMLButtonElement>('hud-complete-another-btn');
  const completeOrbitBtn = byId<HTMLButtonElement>('hud-complete-orbit-btn');
  const completeSimulatorLink = byId<HTMLAnchorElement>('hud-complete-simulator-link');

  const hotspotButtons = new Map<string, HTMLButtonElement>();

  function syncArtifactHeader(target: ExpeditionArtifact): void {
    if (targetNameEl) targetNameEl.textContent = target.name;
    if (nssdcEl) nssdcEl.textContent = `NSSDCA ${target.nssdcId}`;
    if (siteNameEl) siteNameEl.textContent = target.site.name;
    if (siteCoordsEl) {
      siteCoordsEl.textContent = formatCoordinates(target.site.lat, target.site.lon);
    }
    if (verifyBadgeEl) {
      const needsVerify =
        target.verification === 'pending' ||
        target.site.lat === 'pending' ||
        target.site.lon === 'pending';
      verifyBadgeEl.hidden = !needsVerify;
    }
  }

  // Initialize header identity strictly from real catalog values
  syncArtifactHeader(currentArtifact);

  function buildWaveSvg(waveform: HotspotData['telemetry']['waveform'], nominal: boolean, tested: boolean): string {
    const stroke = nominal ? '#2EC4B6' : '#FF9F1C';
    const glow = tested ? '#FF9F1C' : stroke;
    let pts = '';
    if (waveform === 'power') {
      pts = nominal
        ? '4,10 38,8 74,9 112,8 148,10 176,9'
        : '4,8 46,9 88,12 122,26 150,33 176,34';
    } else if (waveform === 'scale') {
      const shipBar = 148;
      const monBar = nominal ? 46 : 36;
      const roverBar = 14;
      return `<svg viewBox="0 0 180 38" class="h-full w-full" aria-hidden="true">
        <rect x="4" y="6" width="${shipBar}" height="6" fill="#7A89A6" fill-opacity="0.55" />
        <rect x="4" y="16" width="${monBar}" height="6" fill="${glow}" />
        <rect x="4" y="26" width="${roverBar}" height="6" fill="#2EC4B6" />
      </svg>`;
    } else if (waveform === 'seismic') {
      pts = nominal
        ? '4,19 28,19 36,6 44,32 52,11 60,27 70,18 98,19 106,8 114,31 124,14 134,20 176,19'
        : '4,22 44,21 62,23 94,19 124,22 176,22';
    } else if (waveform === 'sensor') {
      pts = nominal
        ? '4,28 24,28 24,12 52,12 52,22 86,22 86,8 122,8 122,20 152,20 152,10 176,10'
        : '4,29 50,29 70,18 92,30 130,30 176,28';
    } else {
      pts = tested
        ? '4,30 34,30 42,6 50,30 88,30 96,6 104,30 142,30 150,6 158,30 176,30'
        : '4,26 48,26 56,14 64,26 116,26 124,14 132,26 176,26';
    }

    return `<svg viewBox="0 0 180 38" class="h-full w-full" aria-hidden="true">
      <line x1="0" y1="19" x2="180" y2="19" stroke="#7A89A6" stroke-opacity="0.22" stroke-width="1" />
      <polyline fill="none" stroke="${glow}" stroke-width="${tested ? 2.2 : 1.7}" points="${pts}" />
    </svg>`;
  }

  function renderPlaqueTabs(): void {
    if (!plaqueTabsEl) return;
    plaqueTabsEl.innerHTML = '';
    currentHotspotList.forEach((hp, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isCurrent = activePlaque?.id === hp.id;
      const isTested = testedHotspotIds.has(hp.id);
      btn.textContent = isTested ? `${hp.key}*` : String(hp.key);
      btn.title = hp.label;
      btn.className =
        'cursor-pointer border px-1.5 py-0.5 font-mono-telemetry text-[9px] font-bold transition-colors';
      btn.style.borderColor = isCurrent
        ? 'var(--color-amber)'
        : isTested
          ? 'var(--color-turquoise)'
          : 'var(--color-border-strong)';
      btn.style.backgroundColor = isCurrent
        ? 'var(--color-amber-dim)'
        : isTested
          ? 'var(--color-turquoise-dim)'
          : 'var(--color-slate)';
      btn.style.color = isCurrent
        ? 'var(--color-amber)'
        : isTested
          ? 'var(--color-turquoise)'
          : 'var(--color-text-secondary)';
      btn.addEventListener('click', () => {
        actions.onSelectHotspot(index);
        actions.onScanActive();
      });
      plaqueTabsEl.appendChild(btn);
    });
  }

  function renderPlaqueContent(): void {
    if (!plaqueCardEl || !activePlaque) return;
    plaqueCardEl.hidden = false;
    renderPlaqueTabs();
    const isTested = testedHotspotIds.has(activePlaque.id);

    if (plaqueEyebrowEl) {
      plaqueEyebrowEl.textContent = `${activePlaque.eyebrow} · ${activePlaque.telemetry.subsystemTag}`;
    }
    if (plaqueModePillEl) {
      plaqueModePillEl.textContent = currentMode === 'explorer' ? 'EXPLORER MODE' : 'MISSION LOG';
    }
    if (plaqueTitleEl) plaqueTitleEl.textContent = activePlaque.title;
    if (plaqueBodyEl) {
      plaqueBodyEl.textContent =
        currentMode === 'explorer' ? activePlaque.explorerBody : activePlaque.technicalBody;
    }
    if (plaqueSimToggleBtn) {
      plaqueSimToggleBtn.textContent = simNominal ? 'NOMINAL OPS' : 'FINAL STATE';
      plaqueSimToggleBtn.style.color = simNominal ? 'var(--color-turquoise)' : 'var(--color-amber)';
      plaqueSimToggleBtn.style.borderColor = simNominal
        ? 'var(--color-turquoise-border)'
        : 'var(--color-amber-border)';
    }
    if (plaqueMetricLabelEl) {
      plaqueMetricLabelEl.textContent = simNominal
        ? activePlaque.telemetry.nominalMetric
        : activePlaque.telemetry.finalMetric;
    }
    if (plaqueMetricValueEl) {
      plaqueMetricValueEl.textContent = simNominal
        ? activePlaque.telemetry.nominalValue
        : activePlaque.telemetry.finalValue;
      plaqueMetricValueEl.style.color = simNominal
        ? 'var(--color-turquoise)'
        : 'var(--color-amber)';
    }
    if (plaqueWaveEl) {
      plaqueWaveEl.innerHTML = buildWaveSvg(activePlaque.telemetry.waveform, simNominal, isTested);
    }
    if (plaqueTestBtn) {
      plaqueTestBtn.textContent = isTested
        ? `RE-PING TEST [F] (CALIBRATED)`
        : activePlaque.telemetry.testLabel;
    }
    if (plaqueTestResultEl) {
      if (isTested) {
        plaqueTestResultEl.hidden = false;
        plaqueTestResultEl.textContent = `HARDWARE TEST LOG // ${activePlaque.telemetry.testResult}`;
      } else {
        plaqueTestResultEl.hidden = true;
      }
    }
    if (plaqueSourceEl) {
      if (activePlaque.sourceUrl && activePlaque.sourceTitle) {
        plaqueSourceEl.hidden = false;
        plaqueSourceEl.href = activePlaque.sourceUrl;
        plaqueSourceEl.textContent = `Source: ${activePlaque.sourceTitle}`;
      } else {
        plaqueSourceEl.hidden = true;
      }
    }
  }

  function resetHoldRing(): void {
    holdActive = false;
    if (holdProgressCircle) {
      holdProgressCircle.style.strokeDashoffset = holdCompleted
        ? '0'
        : String(HOLD_RING_CIRCUMFERENCE);
    }
  }

  function finishHoldRecovery(): void {
    if (holdCompleted || !holdUnlocked) return;
    holdCompleted = true;
    holdActive = false;
    if (holdProgressCircle) holdProgressCircle.style.strokeDashoffset = '0';
    if (holdStatusEl) holdStatusEl.textContent = 'DATA RECOVERED // RECORDED';
    actions.onRecoverComplete();
  }

  function beginHold(nowMs: number): void {
    if (!holdUnlocked || holdCompleted) return;
    if (reducedMotion) {
      finishHoldRecovery();
      return;
    }
    holdActive = true;
    holdStartedAt = nowMs;
  }

  function endHold(nowMs: number, allowQuickTap: boolean): void {
    if (!holdActive || holdCompleted || !holdUnlocked) return;
    const elapsed = nowMs - holdStartedAt;
    if (elapsed >= HOLD_DURATION_MS || (allowQuickTap && elapsed < QUICK_TAP_THRESHOLD_MS)) {
      finishHoldRecovery();
      return;
    }
    resetHoldRing();
  }

  const onHoldPointerDown = (e: PointerEvent): void => {
    if (!holdUnlocked || holdCompleted) return;
    e.preventDefault();
    beginHold(performance.now());
  };

  const onHoldPointerUp = (): void => {
    endHold(performance.now(), true);
  };

  const onHoldKeyClick = (e: MouseEvent): void => {
    // Allow keyboard Enter/Space button activation (detail === 0)
    if (e.detail === 0 && holdUnlocked && !holdCompleted) {
      finishHoldRecovery();
    }
  };

  const onSkipClick = (): void => actions.onSkip();
  const onPauseClick = (): void => actions.onPauseToggle();
  const onFsClick = (): void => actions.onFullscreenToggle();
  const onExitClick = (): void => actions.onExit();
  const onResumeClick = (): void => actions.onResume();
  const onRestartClick = (): void => actions.onRestart();
  const onAbortClick = (): void => actions.onAbortToSelector();
  const onPulseClick = (): void => actions.onPulse();
  const onApproachClick = (): void => actions.onAutoApproach();
  const onPrevClick = (): void => actions.onPrevHotspot();
  const onNextClick = (): void => actions.onNextHotspot();
  const onScanClick = (): void => actions.onScanActive();
  const onReturnDriveClick = (): void => actions.onReturnDrive();
  const onPlaqueCloseClick = (): void => {
    activePlaque = null;
    if (plaqueCardEl) plaqueCardEl.hidden = true;
  };
  const onPlaqueNextClick = (): void => {
    actions.onNextHotspot();
    actions.onScanActive();
  };
  const onPlaqueSimToggleClick = (): void => {
    simNominal = !simNominal;
    actions.onSimModeChange?.(simNominal);
    renderPlaqueContent();
  };
  const onPlaqueTestClick = (): void => {
    actions.onDiagnosticTest?.();
  };
  const onCompleteAnotherClick = (): void => {
    if (actions.onContinueSurface) {
      actions.onContinueSurface();
      return;
    }
    actions.onAbortToSelector();
  };
  const onTargetMoonClick = (): void => actions.onSelectNavTarget?.('moon');
  const onTargetMarsClick = (): void => actions.onSelectNavTarget?.('mars');
  const onAssistClick = (): void => actions.onFlightAssist?.();
  const onRetryClick = (): void => actions.onRetryDescent?.();
  const onExploreClick = (): void => actions.onExploreSurface?.();
  const onOrbitClick = (): void => {
    if (completeCardEl) completeCardEl.hidden = true;
    if (touchdownCardEl) touchdownCardEl.hidden = true;
    actions.onLaunchOrbit?.();
  };
  const onCompleteLinkClick = (): void => {
    // Close fullscreen before Archive script scrolls to #archive
    if (document.fullscreenElement === stageEl) {
      document.exitFullscreen().catch(() => {});
    }
    if (completeCardEl) completeCardEl.hidden = true;
    actions.onExit();
  };

  targetMoonBtn?.addEventListener('click', onTargetMoonClick);
  targetMarsBtn?.addEventListener('click', onTargetMarsClick);
  assistBtn?.addEventListener('click', onAssistClick);
  retryBtn?.addEventListener('click', onRetryClick);
  orbitBtn?.addEventListener('click', onOrbitClick);
  driveOrbitBtn?.addEventListener('click', onOrbitClick);
  inspectOrbitBtn?.addEventListener('click', onOrbitClick);
  completeOrbitBtn?.addEventListener('click', onOrbitClick);
  touchdownExploreBtn?.addEventListener('click', onExploreClick);
  touchdownOrbitBtn?.addEventListener('click', onOrbitClick);
  touchdownRetryBtn?.addEventListener('click', onRetryClick);
  skipBtn?.addEventListener('click', onSkipClick);
  pauseBtn?.addEventListener('click', onPauseClick);
  fullscreenBtn?.addEventListener('click', onFsClick);
  exitBtn?.addEventListener('click', onExitClick);
  resumeBtn?.addEventListener('click', onResumeClick);
  restartBtn?.addEventListener('click', onRestartClick);
  abortBtn?.addEventListener('click', onAbortClick);
  pulseBtn?.addEventListener('click', onPulseClick);
  approachBtn?.addEventListener('click', onApproachClick);
  prevHotspotBtn?.addEventListener('click', onPrevClick);
  nextHotspotBtn?.addEventListener('click', onNextClick);
  scanBtn?.addEventListener('click', onScanClick);
  returnDriveBtn?.addEventListener('click', onReturnDriveClick);
  plaqueCloseBtn?.addEventListener('click', onPlaqueCloseClick);
  plaqueNextBtn?.addEventListener('click', onPlaqueNextClick);
  plaqueSimToggleBtn?.addEventListener('click', onPlaqueSimToggleClick);
  plaqueTestBtn?.addEventListener('click', onPlaqueTestClick);
  completeAnotherBtn?.addEventListener('click', onCompleteAnotherClick);
  completeArchiveLinkEl?.addEventListener('click', onCompleteLinkClick);
  completeSimulatorLink?.addEventListener('click', onCompleteLinkClick);

  holdBtn?.addEventListener('pointerdown', onHoldPointerDown);
  holdBtn?.addEventListener('pointerup', onHoldPointerUp);
  holdBtn?.addEventListener('pointerleave', onHoldPointerUp);
  holdBtn?.addEventListener('pointercancel', onHoldPointerUp);
  holdBtn?.addEventListener('click', onHoldKeyClick);

  return {
    setPhase(phase: ExpeditionPhase) {
      currentPhase = phase;
      stageEl.dataset.phase = phase;
      if (phaseLabelEl) phaseLabelEl.textContent = PHASE_LABELS[phase];

      if (skipBtn) skipBtn.hidden = !(phase === 'transit' || phase === 'descent' || phase === 'ascent');
      if (targetSwitchEl) targetSwitchEl.hidden = phase !== 'transit';
      if (assistBtn) assistBtn.hidden = !(phase === 'transit' || phase === 'descent');
      if (orbitBtn) {
        orbitBtn.hidden = !(
          phase === 'descent' ||
          phase === 'drive' ||
          phase === 'inspect' ||
          phase === 'complete'
        );
      }
      if (retryBtn && phase !== 'descent') retryBtn.hidden = true;
      if (touchdownCardEl && phase !== 'descent') touchdownCardEl.hidden = true;
      if (driveControlsEl) driveControlsEl.hidden = phase !== 'drive';
      if (inspectControlsEl) inspectControlsEl.hidden = phase !== 'inspect';
      if (completeCardEl) completeCardEl.hidden = phase !== 'complete';
      if (hotspotsLayerEl) hotspotsLayerEl.hidden = phase !== 'inspect';
      if (scalePillEl) {
        // Show "Distances compressed - not to scale" visibly across all viewports while driving
        if (phase === 'drive') {
          scalePillEl.classList.remove('hidden', 'lg:inline-block');
          scalePillEl.classList.add('inline-block');
        } else {
          scalePillEl.classList.remove('inline-block');
          scalePillEl.classList.add('hidden', 'lg:inline-block');
        }
      }
      if (phase !== 'inspect' && plaqueCardEl) {
        plaqueCardEl.hidden = true;
      }
    },

    setActiveArtifact(
      nextArtifact: ExpeditionArtifact,
      hotspots: HotspotData[],
      status: DiscoveryStatus,
    ) {
      currentArtifact = nextArtifact;
      activePlaque = null;
      if (plaqueCardEl) plaqueCardEl.hidden = true;
      holdCompleted = status === 'recovered';
      holdUnlocked = false;
      holdActive = false;
      if (holdStatusEl) {
        holdStatusEl.textContent = holdCompleted
          ? 'DATA RECOVERED // RECORDED'
          : 'SCAN ALL 5 POINTS TO UNLOCK';
      }
      testedHotspotIds.clear();
      simNominal = true;
      resetHoldRing();
      testedHotspotIds.clear();
      simNominal = true;
      syncArtifactHeader(nextArtifact);
      this.setDiscoveryStatus(status);
      this.setHotspots(hotspots);
    },

    setDiagnosticTested(testedIds: Set<string>) {
      testedHotspotIds = new Set(testedIds);
      renderPlaqueContent();
    },

    setReadingMode(mode: ReadingMode) {
      currentMode = mode;
      renderPlaqueContent();
    },

    setDiscoveryStatus(status: DiscoveryStatus) {
      if (!stateBadgeEl) return;
      stateBadgeEl.dataset.discoveryState = status;
      stateBadgeEl.textContent =
        status === 'recovered' ? 'RECOVERED' : status === 'inspected' ? 'INSPECTED' : 'DORMANT';
    },

    setDistanceReadout(text: string) {
      if (distanceEl) distanceEl.textContent = text;
    },

    setPaused(paused: boolean) {
      if (pauseOverlayEl) pauseOverlayEl.hidden = !paused;
      if (paused) resetHoldRing();
    },

    setApproachEngaged(engaged: boolean) {
      if (!approachBtn) return;
      approachBtn.textContent = engaged ? 'Autopilot Active [G]' : 'Auto-Approach [G]';
    },

    setFlightAssistEngaged(phase: 'transit' | 'descent', engaged: boolean) {
      if (!assistBtn) return;
      if (phase === 'transit') {
        assistBtn.textContent = engaged ? 'Auto-Cruise Active [G]' : 'Auto-Cruise [G]';
      } else {
        assistBtn.textContent = engaged ? 'Auto-Land Active [G]' : 'Auto-Land [G]';
      }
    },

    setNavTargetBody(body: 'moon' | 'mars') {
      if (targetMoonBtn) {
        const active = body === 'moon';
        targetMoonBtn.setAttribute('aria-pressed', String(active));
        targetMoonBtn.style.backgroundColor = active
          ? 'var(--color-turquoise-dim)'
          : 'var(--color-slate)';
        targetMoonBtn.style.borderColor = active
          ? 'var(--color-turquoise)'
          : 'var(--color-border-strong)';
      }
      if (targetMarsBtn) {
        const active = body === 'mars';
        targetMarsBtn.setAttribute('aria-pressed', String(active));
        targetMarsBtn.style.backgroundColor = active
          ? 'var(--color-amber-dim)'
          : 'var(--color-slate)';
        targetMarsBtn.style.borderColor = active
          ? 'var(--color-amber)'
          : 'var(--color-border-strong)';
      }
    },

    setDescentRetryVisible(visible: boolean) {
      if (retryBtn) retryBtn.hidden = !visible;
    },

    setTouchdownState(
      state: 'flying' | 'landed' | 'offpad' | 'crashed',
      impactReason?: string,
    ) {
      if (!touchdownCardEl) return;
      if (currentPhase !== 'descent' || state === 'flying') {
        touchdownCardEl.hidden = true;
        return;
      }
      touchdownCardEl.hidden = false;
      const bodyLabel = currentArtifact.body === 'mars' ? 'Mars' : 'Moon';
      if (state === 'landed') {
        if (touchdownEyebrowEl) {
          touchdownEyebrowEl.textContent = 'SOFT LANDING CONFIRMED';
          touchdownEyebrowEl.style.color = 'var(--color-turquoise)';
        }
        if (touchdownTitleEl) {
          touchdownTitleEl.textContent = `${bodyLabel} Surface · All ${bodyLabel} Sites Active`;
        }
        if (touchdownBodyEl) {
          touchdownBodyEl.textContent = `Landed safely on ${bodyLabel}. Deploy the miniature rover to locate all historical ${bodyLabel} monuments in their real landing zones, or launch back to open orbit.`;
        }
      } else if (state === 'offpad') {
        if (touchdownEyebrowEl) {
          touchdownEyebrowEl.textContent = 'TOUCHDOWN OFF-PAD (SAFE)';
          touchdownEyebrowEl.style.color = 'var(--color-amber)';
        }
        if (touchdownTitleEl) {
          touchdownTitleEl.textContent = `${bodyLabel} Surface · All ${bodyLabel} Sites Active`;
        }
        if (touchdownBodyEl) {
          touchdownBodyEl.textContent = `Safe touchdown outside the beacon pad. Deploy the miniature rover to locate all historical ${bodyLabel} monuments in their real landing zones, retry the landing, or return to orbit.`;
        }
      } else {
        if (touchdownEyebrowEl) {
          touchdownEyebrowEl.textContent = 'HARD IMPACT RECOVERY';
          touchdownEyebrowEl.style.color = 'var(--color-alert)';
        }
        if (touchdownTitleEl) {
          touchdownTitleEl.textContent = impactReason
            ? `Hard Touchdown (${impactReason})`
            : `Hard Touchdown on ${bodyLabel}`;
        }
        if (touchdownBodyEl) {
          touchdownBodyEl.textContent =
            'Retry your powered descent, fire orbital boost back to spaceflight, or deploy the surface rover anyway.';
        }
      }
    },

    setHotspots(hotspots: HotspotData[]) {
      currentHotspotList = hotspots;
      if (!hotspotsLayerEl) return;
      hotspotsLayerEl.innerHTML = '';
      hotspotButtons.clear();

      hotspots.forEach((hp, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.hotspotBtn = hp.id;
        btn.className =
          'pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer border px-2 py-1 font-mono-telemetry text-[10px] font-bold tracking-[0.08em] uppercase transition-colors';
        btn.innerHTML = `<span>[${hp.key}] ${hp.title}</span>`;
        btn.addEventListener('click', () => {
          actions.onSelectHotspot(index);
          actions.onScanActive();
        });
        hotspotsLayerEl.appendChild(btn);
        hotspotButtons.set(hp.id, btn);
      });
    },

    updateHotspotProjection(projected: ProjectedHotspot[]) {
      if (currentPhase !== 'inspect') return;

      const stageRect = hotspotsLayerEl?.getBoundingClientRect() ?? null;
      const stageW = stageRect?.width ?? 0;
      const stageH = stageRect?.height ?? 0;

      // Measure the open diagnostic plaque card in hotspotsLayerEl coordinates
      let blockedCardRect: { left: number; top: number; right: number; bottom: number } | null =
        null;
      if (stageRect && plaqueCardEl && !plaqueCardEl.hidden) {
        const cardRect = plaqueCardEl.getBoundingClientRect();
        if (cardRect.width > 0 && cardRect.height > 0) {
          blockedCardRect = {
            left: cardRect.left - stageRect.left - 78,
            top: cardRect.top - stageRect.top - 22,
            right: cardRect.right - stageRect.left + 78,
            bottom: cardRect.bottom - stageRect.top + 22,
          };
        }
      }

      const layoutCoords = projected.map((item) => ({
        x: item.x,
        y: item.y,
        visible: item.visible,
      }));

      // Pairwise 2D screen-space separation pass so floating numeric tags never stack
      const visibleIndices = layoutCoords
        .map((pos, idx) => (pos.visible ? idx : -1))
        .filter((idx) => idx >= 0);

      for (let pass = 0; pass < 3; pass++) {
        for (let aIdx = 0; aIdx < visibleIndices.length; aIdx++) {
          for (let bIdx = aIdx + 1; bIdx < visibleIndices.length; bIdx++) {
            const a = layoutCoords[visibleIndices[aIdx]];
            const b = layoutCoords[visibleIndices[bIdx]];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) < 132 && Math.abs(dy) < 30) {
              const pushY = (30 - Math.abs(dy)) * 0.55;
              const dirY = dy >= 0 ? 1 : -1;
              a.y -= dirY * pushY;
              b.y += dirY * pushY;
              if (Math.abs(dx) < 24) {
                const dirX = dx >= 0 ? 1 : -1;
                a.x -= dirX * 8;
                b.x += dirX * 8;
              }
            }
          }
        }
      }

      for (let i = 0; i < projected.length; i++) {
        const item = projected[i];
        const pos = layoutCoords[i];
        const btn = hotspotButtons.get(item.data.id);
        if (!btn) continue;

        let shouldHide = !pos.visible;
        if (!shouldHide && stageW > 0 && stageH > 0) {
          if (pos.y < 84 || pos.y > stageH - 66) {
            shouldHide = true;
          }
          if (
            !shouldHide &&
            blockedCardRect &&
            pos.x >= blockedCardRect.left &&
            pos.x <= blockedCardRect.right &&
            pos.y >= blockedCardRect.top &&
            pos.y <= blockedCardRect.bottom
          ) {
            shouldHide = true;
          }
        }

        if (shouldHide) {
          btn.hidden = true;
          continue;
        }

        const clampedX = stageW > 0 ? Math.max(76, Math.min(stageW - 76, pos.x)) : pos.x;
        const clampedY = stageH > 0 ? Math.max(84, Math.min(stageH - 68, pos.y)) : pos.y;

        btn.hidden = false;
        btn.style.left = `${clampedX.toFixed(1)}px`;
        btn.style.top = `${clampedY.toFixed(1)}px`;

        const isTested = testedHotspotIds.has(item.data.id);
        btn.textContent = isTested
          ? `[${item.data.key}] ${item.data.title} · TESTED`
          : `[${item.data.key}] ${item.data.title}`;

        if (isTested) {
          btn.style.borderColor = 'var(--color-amber)';
          btn.style.backgroundColor = 'rgba(25, 19, 10, 0.92)';
          btn.style.color = 'var(--color-amber)';
        } else if (item.scanned) {
          btn.style.borderColor = 'var(--color-turquoise)';
          btn.style.backgroundColor = 'rgba(9, 13, 22, 0.9)';
          btn.style.color = 'var(--color-turquoise)';
        } else if (item.active) {
          btn.style.borderColor = 'var(--color-amber)';
          btn.style.backgroundColor = 'rgba(24, 34, 56, 0.92)';
          btn.style.color = 'var(--color-text-primary)';
        } else {
          btn.style.borderColor = 'var(--color-border-strong)';
          btn.style.backgroundColor = 'rgba(9, 13, 22, 0.8)';
          btn.style.color = 'var(--color-text-secondary)';
        }
      }
    },

    setInspectionProgress(scannedCount: number, total: number, unlocked: boolean) {
      holdUnlocked = unlocked;
      if (hotspotProgressEl) {
        hotspotProgressEl.textContent = `SCANNED ${scannedCount} / ${total} EXTERIOR POINTS`;
      }
      if (holdBtn) holdBtn.disabled = !unlocked || holdCompleted;
      if (holdStatusEl && !holdCompleted) {
        holdStatusEl.textContent = unlocked
          ? reducedMotion
            ? 'Ready: Press or Click HOLD to recover link'
            : 'Hold 1.2s (or tap) to recover monument link'
          : `Scan all ${total} points to unlock link`;
      }
    },

    showPlaque(hotspot: HotspotData | null) {
      activePlaque = hotspot;
      if (!hotspot) {
        if (plaqueCardEl) plaqueCardEl.hidden = true;
        return;
      }
      renderPlaqueContent();
    },

    startKeyboardHold() {
      if (currentPhase === 'inspect' && holdUnlocked && !holdCompleted) {
        beginHold(performance.now());
      }
    },

    stopKeyboardHold() {
      if (currentPhase === 'inspect' && holdUnlocked && !holdCompleted) {
        endHold(performance.now(), false);
      }
    },

    tickHold(nowMs: number) {
      if (!holdActive || !holdUnlocked || holdCompleted) return;
      const elapsed = nowMs - holdStartedAt;
      const ratio = Math.min(1, elapsed / HOLD_DURATION_MS);
      if (holdProgressCircle) {
        const offset = HOLD_RING_CIRCUMFERENCE * (1 - ratio);
        holdProgressCircle.style.strokeDashoffset = offset.toFixed(2);
      }
      if (ratio >= 1) {
        finishHoldRecovery();
      }
    },

    showCompleteCard() {
      this.setPhase('complete');
      if (completeScaleEl) {
        completeScaleEl.textContent = currentArtifact.sizeFact ?? `NSSDCA ${currentArtifact.nssdcId}`;
      }
      if (completeTitleEl) {
        completeTitleEl.textContent = `${currentArtifact.name} · Archive Link Recovered`;
      }
      if (completeArchiveLinkEl) {
        completeArchiveLinkEl.dataset.openArchivePlaque = currentArtifact.id;
      }
      if (completeLegacyListEl) {
        completeLegacyListEl.innerHTML = '';
        for (const entry of currentArtifact.legacy) {
          const li = document.createElement('li');
          li.className =
            'border border-[var(--color-border)] bg-[var(--color-slate)] p-3 text-xs leading-relaxed text-[var(--color-text-primary)]';

          const findingP = document.createElement('p');
          findingP.textContent = entry.finding;
          li.appendChild(findingP);

          const sourceLink = document.createElement('a');
          sourceLink.href = entry.sourceUrl;
          sourceLink.target = '_blank';
          sourceLink.rel = 'noopener noreferrer';
          sourceLink.className =
            'mt-1.5 inline-block font-mono-telemetry text-[10px] text-[var(--color-turquoise)] underline underline-offset-2';
          sourceLink.textContent = `Source: ${entry.sourceTitle} ->`;
          li.appendChild(sourceLink);

          completeLegacyListEl.appendChild(li);
        }
      }
      this.announce(`${currentArtifact.name} archive link recovered.`);
    },

    resetRun() {
      activePlaque = null;
      holdUnlocked = false;
      holdCompleted = false;
      testedHotspotIds.clear();
      simNominal = true;
      resetHoldRing();
      if (plaqueCardEl) plaqueCardEl.hidden = true;
      if (touchdownCardEl) touchdownCardEl.hidden = true;
      if (completeCardEl) completeCardEl.hidden = true;
      if (approachBtn) approachBtn.textContent = 'Auto-Approach [G]';
    },

    announce(message: string) {
      if (liveRegionEl) {
        liveRegionEl.textContent = message;
      }
    },

    destroy() {
      targetMoonBtn?.removeEventListener('click', onTargetMoonClick);
      targetMarsBtn?.removeEventListener('click', onTargetMarsClick);
      assistBtn?.removeEventListener('click', onAssistClick);
      retryBtn?.removeEventListener('click', onRetryClick);
      orbitBtn?.removeEventListener('click', onOrbitClick);
      driveOrbitBtn?.removeEventListener('click', onOrbitClick);
      inspectOrbitBtn?.removeEventListener('click', onOrbitClick);
      completeOrbitBtn?.removeEventListener('click', onOrbitClick);
      touchdownExploreBtn?.removeEventListener('click', onExploreClick);
      touchdownOrbitBtn?.removeEventListener('click', onOrbitClick);
      touchdownRetryBtn?.removeEventListener('click', onRetryClick);
      skipBtn?.removeEventListener('click', onSkipClick);
      pauseBtn?.removeEventListener('click', onPauseClick);
      fullscreenBtn?.removeEventListener('click', onFsClick);
      exitBtn?.removeEventListener('click', onExitClick);
      resumeBtn?.removeEventListener('click', onResumeClick);
      restartBtn?.removeEventListener('click', onRestartClick);
      abortBtn?.removeEventListener('click', onAbortClick);
      pulseBtn?.removeEventListener('click', onPulseClick);
      approachBtn?.removeEventListener('click', onApproachClick);
      prevHotspotBtn?.removeEventListener('click', onPrevClick);
      nextHotspotBtn?.removeEventListener('click', onNextClick);
      scanBtn?.removeEventListener('click', onScanClick);
      returnDriveBtn?.removeEventListener('click', onReturnDriveClick);
      plaqueCloseBtn?.removeEventListener('click', onPlaqueCloseClick);
      plaqueNextBtn?.removeEventListener('click', onPlaqueNextClick);
      plaqueSimToggleBtn?.removeEventListener('click', onPlaqueSimToggleClick);
      plaqueTestBtn?.removeEventListener('click', onPlaqueTestClick);
      completeAnotherBtn?.removeEventListener('click', onCompleteAnotherClick);
      completeArchiveLinkEl?.removeEventListener('click', onCompleteLinkClick);
      completeSimulatorLink?.removeEventListener('click', onCompleteLinkClick);

      holdBtn?.removeEventListener('pointerdown', onHoldPointerDown);
      holdBtn?.removeEventListener('pointerup', onHoldPointerUp);
      holdBtn?.removeEventListener('pointerleave', onHoldPointerUp);
      holdBtn?.removeEventListener('pointercancel', onHoldPointerUp);
      holdBtn?.removeEventListener('click', onHoldKeyClick);

      if (hotspotsLayerEl) hotspotsLayerEl.innerHTML = '';
      if (touchdownCardEl) touchdownCardEl.hidden = true;
      if (plaqueCardEl) plaqueCardEl.hidden = true;
      if (pauseOverlayEl) pauseOverlayEl.hidden = true;
      if (completeCardEl) completeCardEl.hidden = true;
    },
  };
}
