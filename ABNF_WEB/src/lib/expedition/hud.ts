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
}

export interface ExpeditionHud {
  setPhase: (phase: ExpeditionPhase) => void;
  setReadingMode: (mode: ReadingMode) => void;
  setDiscoveryStatus: (status: DiscoveryStatus) => void;
  setDistanceReadout: (text: string) => void;
  setPaused: (paused: boolean) => void;
  setApproachEngaged: (engaged: boolean) => void;
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
  const legacy2 = artifact.legacy[2];

  const finding1Explorer = legacy0
    ? legacy0.finding
    : artifact.kidSummary ?? artifact.scientificValue;
  const finding1Tech = legacy0 ? `${legacy0.finding} (Logged ${artifact.lastContactDate})` : artifact.scientificValue;

  const finding2Text = [legacy1?.finding, legacy2?.finding].filter(Boolean).join(' ');

  return [
    {
      id: `${artifact.id}-hp-1`,
      key: 1,
      label: names[0],
      eyebrow: 'EXTERIOR POINT 01 // END OF MISSION',
      title: names[0].split(' · ')[0],
      explorerBody: endNote,
      technicalBody: `${endNote} NSSDCA ID: ${artifact.nssdcId}.`,
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
  let currentMode: ReadingMode = initialMode;
  let currentPhase: ExpeditionPhase = 'transit';
  let activePlaque: HotspotData | null = null;
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
  const skipBtn = byId<HTMLButtonElement>('hud-skip-btn');
  const pauseBtn = byId<HTMLButtonElement>('hud-pause-btn');
  const fullscreenBtn = byId<HTMLButtonElement>('hud-fullscreen-btn');
  const exitBtn = byId<HTMLButtonElement>('hud-exit-btn');

  const siteNameEl = byId('hud-site-name');
  const siteCoordsEl = byId('hud-site-coords');
  const distanceEl = byId('hud-distance-readout');
  const stateBadgeEl = byId('hud-state-badge');

  const hotspotsLayerEl = byId('hud-hotspots-layer');
  const plaqueCardEl = byId('hud-plaque-card');
  const plaqueEyebrowEl = byId('hud-plaque-eyebrow');
  const plaqueModePillEl = byId('hud-plaque-mode-pill');
  const plaqueTitleEl = byId('hud-plaque-title');
  const plaqueBodyEl = byId('hud-plaque-body');
  const plaqueSourceEl = byId<HTMLAnchorElement>('hud-plaque-source');
  const plaqueCloseBtn = byId<HTMLButtonElement>('hud-plaque-close-btn');
  const plaqueNextBtn = byId<HTMLButtonElement>('hud-plaque-next-btn');

  const driveControlsEl = byId('hud-drive-controls');
  const pulseBtn = byId<HTMLButtonElement>('hud-pulse-btn');
  const approachBtn = byId<HTMLButtonElement>('hud-approach-btn');

  const inspectControlsEl = byId('hud-inspect-controls');
  const hotspotProgressEl = byId('hud-hotspot-progress');
  const prevHotspotBtn = byId<HTMLButtonElement>('hud-prev-hotspot');
  const scanBtn = byId<HTMLButtonElement>('hud-scan-btn');
  const nextHotspotBtn = byId<HTMLButtonElement>('hud-next-hotspot');
  const returnDriveBtn = byId<HTMLButtonElement>('hud-return-drive-btn');

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
  const completeSimulatorLink = byId<HTMLAnchorElement>('hud-complete-simulator-link');

  const hotspotButtons = new Map<string, HTMLButtonElement>();

  // Initialize header identity strictly from real catalog values
  if (targetNameEl) targetNameEl.textContent = artifact.name;
  if (nssdcEl) nssdcEl.textContent = `NSSDCA ${artifact.nssdcId}`;
  if (siteNameEl) siteNameEl.textContent = artifact.site.name;
  if (siteCoordsEl) {
    siteCoordsEl.textContent = formatCoordinates(artifact.site.lat, artifact.site.lon);
  }
  if (verifyBadgeEl) {
    const needsVerify =
      artifact.verification === 'pending' ||
      artifact.site.lat === 'pending' ||
      artifact.site.lon === 'pending';
    verifyBadgeEl.hidden = !needsVerify;
  }

  function renderPlaqueContent(): void {
    if (!plaqueCardEl || !activePlaque) return;
    plaqueCardEl.hidden = false;
    if (plaqueEyebrowEl) plaqueEyebrowEl.textContent = activePlaque.eyebrow;
    if (plaqueModePillEl) {
      plaqueModePillEl.textContent = currentMode === 'explorer' ? 'EXPLORER MODE' : 'MISSION LOG';
    }
    if (plaqueTitleEl) plaqueTitleEl.textContent = activePlaque.title;
    if (plaqueBodyEl) {
      plaqueBodyEl.textContent =
        currentMode === 'explorer' ? activePlaque.explorerBody : activePlaque.technicalBody;
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
  const onCompleteAnotherClick = (): void => actions.onAbortToSelector();
  const onCompleteLinkClick = (): void => {
    // Close fullscreen before Archive script scrolls to #archive
    if (document.fullscreenElement === stageEl) {
      document.exitFullscreen().catch(() => {});
    }
    if (completeCardEl) completeCardEl.hidden = true;
    actions.onExit();
  };

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

      if (skipBtn) skipBtn.hidden = !(phase === 'transit' || phase === 'descent');
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

    setHotspots(hotspots: HotspotData[]) {
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
      for (const item of projected) {
        const btn = hotspotButtons.get(item.data.id);
        if (!btn) continue;
        if (!item.visible) {
          btn.hidden = true;
          continue;
        }
        btn.hidden = false;
        btn.style.left = `${item.x.toFixed(1)}px`;
        btn.style.top = `${item.y.toFixed(1)}px`;

        if (item.scanned) {
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
        completeScaleEl.textContent = artifact.sizeFact ?? `NSSDCA ${artifact.nssdcId}`;
      }
      if (completeTitleEl) {
        completeTitleEl.textContent = `${artifact.name} · Archive Link Recovered`;
      }
      if (completeArchiveLinkEl) {
        completeArchiveLinkEl.dataset.openArchivePlaque = artifact.id;
      }
      if (completeLegacyListEl) {
        completeLegacyListEl.innerHTML = '';
        for (const entry of artifact.legacy) {
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
      this.announce(`${artifact.name} archive link recovered.`);
    },

    resetRun() {
      activePlaque = null;
      holdUnlocked = false;
      holdCompleted = false;
      resetHoldRing();
      if (plaqueCardEl) plaqueCardEl.hidden = true;
      if (completeCardEl) completeCardEl.hidden = true;
      if (approachBtn) approachBtn.textContent = 'Auto-Approach [G]';
    },

    announce(message: string) {
      if (liveRegionEl) {
        liveRegionEl.textContent = message;
      }
    },

    destroy() {
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
      completeAnotherBtn?.removeEventListener('click', onCompleteAnotherClick);
      completeArchiveLinkEl?.removeEventListener('click', onCompleteLinkClick);
      completeSimulatorLink?.removeEventListener('click', onCompleteLinkClick);

      holdBtn?.removeEventListener('pointerdown', onHoldPointerDown);
      holdBtn?.removeEventListener('pointerup', onHoldPointerUp);
      holdBtn?.removeEventListener('pointerleave', onHoldPointerUp);
      holdBtn?.removeEventListener('pointercancel', onHoldPointerUp);
      holdBtn?.removeEventListener('click', onHoldKeyClick);

      if (hotspotsLayerEl) hotspotsLayerEl.innerHTML = '';
      if (plaqueCardEl) plaqueCardEl.hidden = true;
      if (pauseOverlayEl) pauseOverlayEl.hidden = true;
      if (completeCardEl) completeCardEl.hidden = true;
    },
  };
}
