import {
  getReadingMode,
  setReadingMode,
  subscribeReadingModeChange,
  type ReadingMode,
} from '../discovery';
import { isSonarEnabled, playSonarTone } from '../sonar';
import type { ExpeditionArtifact, ExpeditionController } from './types';

function readCatalogFromDom(): ExpeditionArtifact[] {
  const scriptEl = document.getElementById('expedition-catalog-data');
  if (!scriptEl?.textContent) return [];
  try {
    const parsed = JSON.parse(scriptEl.textContent) as ExpeditionArtifact[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function initExpeditionSection(): void {
  const catalog = readCatalogFromDom();
  if (catalog.length === 0) return;

  const byId = new Map<string, ExpeditionArtifact>(catalog.map((item) => [item.id, item]));
  let selectedId = catalog[0].id;
  let currentMode: ReadingMode = getReadingMode();
  let activeController: ExpeditionController | null = null;
  let launching = false;
  let pendingDescentBody: 'mars' | 'moon' | null = null;

  const stageEl = document.getElementById('expedition-stage');
  const standbyEl = document.getElementById('expedition-standby');
  const canvasEl = document.getElementById('expedition-canvas') as HTMLCanvasElement | null;
  const hudEl = document.getElementById('expedition-hud');
  const fallbackEl = document.getElementById('expedition-webgl-fallback');
  const liveRegionEl = document.getElementById('expedition-live-region');
  const standbyTitleEl = document.getElementById('expedition-standby-title');
  const standbySummaryEl = document.getElementById('expedition-standby-summary');
  const standbyLaunchBtn = document.getElementById(
    'expedition-standby-launch-btn',
  ) as HTMLButtonElement | null;
  const fullscreenCheckbox = document.getElementById(
    'expedition-fullscreen-toggle',
  ) as HTMLInputElement | null;

  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-expedition-reading-mode]'),
  );

  if (!stageEl || !standbyEl || !canvasEl || !hudEl || !fallbackEl) {
    return;
  }

  const stage = stageEl;
  const standby = standbyEl;
  const canvas = canvasEl;
  const hud = hudEl;
  const fallback = fallbackEl;

  function updateReadingModeUi(mode: ReadingMode): void {
    currentMode = mode;
    for (const btn of modeButtons) {
      const pressed = btn.dataset.expeditionReadingMode === mode;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }
    updateSelectionUi();
    activeController?.setReadingMode(mode);
  }

  function updateSelectionUi(): void {
    const artifact = byId.get(selectedId) ?? catalog[0];
    selectedId = artifact.id;

    if (standbyTitleEl) {
      standbyTitleEl.textContent = 'Interplanetary Space & Surface Simulator';
    }
    if (standbySummaryEl) {
      standbySummaryEl.textContent =
        currentMode === 'explorer'
          ? 'Fly from Earth orbit to the Moon or Mars, land on the pad, then drive your miniature rover to all historical monuments placed in their real coordinates.'
          : 'Unified 3D orbital mechanics, powered descent (Mars 3.72 m/s², Moon 1.62 m/s²), and multi-site planetary surface exploration across real landing zones.';
    }
  }

  function restoreStandbyUi(): void {
    if (activeController) {
      activeController.destroy();
      activeController = null;
    }

    if (document.fullscreenElement === stage) {
      document.exitFullscreen().catch(() => {
        // Ignore fullscreen exit rejection
      });
    }

    stage.dataset.phase = 'standby';
    canvas.hidden = true;
    hud.hidden = true;
    fallback.hidden = true;
    standby.hidden = false;

    if (standbyLaunchBtn) {
      standbyLaunchBtn.disabled = false;
      standbyLaunchBtn.textContent = 'Launch Space Simulator ->';
    }
  }

  function findArtifactForBody(body: 'mars' | 'moon'): ExpeditionArtifact {
    return (
      catalog.find((a) => a.body === body && a.featured) ??
      catalog.find((a) => a.body === body) ??
      catalog[0]
    );
  }

  async function handleLaunch(
    initialPhase: 'transit' | 'descent' | 'drive' = 'transit',
  ): Promise<void> {
    if (launching) return;
    const artifact = byId.get(selectedId) ?? catalog[0];

    launching = true;
    if (standbyLaunchBtn) {
      standbyLaunchBtn.disabled = true;
      standbyLaunchBtn.textContent = 'Initializing 3D...';
    }

    // Initialize Web Audio inside user gesture only when sonar audio is enabled
    if (isSonarEnabled()) {
      playSonarTone('ping');
    }

    if (fullscreenCheckbox?.checked && document.fullscreenEnabled && !document.fullscreenElement) {
      stage.requestFullscreen().catch(() => {
        // Ignore fullscreen denial on restricted browsers
      });
    }

    if (activeController) {
      activeController.destroy();
      activeController = null;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      const { launchExpedition } = await import('./engine');

      standby.hidden = true;
      fallback.hidden = true;
      canvas.hidden = false;
      hud.hidden = false;

      activeController = launchExpedition({
        artifact,
        planetArtifacts: catalog.filter((item) => item.body === artifact.body),
        canvas,
        hudRoot: hud,
        stageEl: stage,
        webglFallbackEl: fallback,
        standbyEl: standby,
        liveRegionEl,
        initialMode: currentMode,
        initialPhase,
        reducedMotion,
        onExit: () => restoreStandbyUi(),
        onSelectAnother: () => restoreStandbyUi(),
        onCaptureOtherBody: (capturedBody) => {
          const nextArtifact = findArtifactForBody(capturedBody);
          selectedId = nextArtifact.id;
          updateSelectionUi();
          queueMicrotask(() => {
            launching = false;
            void handleLaunch('descent');
          });
        },
      });

      stage.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      if (stage.dataset.vueloActive === 'true' && initialPhase === 'transit') {
        const pauseOverlay = document.getElementById('expedition-pause-overlay');
        const pauseBtn = document.getElementById('hud-pause-btn') as HTMLButtonElement | null;
        if (pauseOverlay && pauseOverlay.hidden) {
          pauseBtn?.click();
          pauseOverlay.style.visibility = 'hidden';
        }
      }
      if (standbyLaunchBtn) {
        standbyLaunchBtn.disabled = false;
        standbyLaunchBtn.textContent = 'Launch Space Simulator ->';
      }
    } catch {
      standby.hidden = true;
      canvas.hidden = true;
      hud.hidden = true;
      fallback.hidden = false;
      if (standbyLaunchBtn) {
        standbyLaunchBtn.disabled = false;
        standbyLaunchBtn.textContent = 'Retry Launch ->';
      }
    } finally {
      launching = false;
      if (pendingDescentBody) {
        const nextBody = pendingDescentBody;
        pendingDescentBody = null;
        selectedId = findArtifactForBody(nextBody).id;
        updateSelectionUi();
        void handleLaunch('descent');
      }
    }
  }

  const deployBodyButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-expedition-deploy-body]'),
  );
  for (const btn of deployBodyButtons) {
    btn.addEventListener('click', () => {
      const bodyAttr = btn.dataset.expeditionDeployBody;
      if (bodyAttr === 'mars' || bodyAttr === 'moon') {
        selectedId = findArtifactForBody(bodyAttr).id;
        updateSelectionUi();
        void handleLaunch('drive');
      }
    });
  }

  for (const btn of modeButtons) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.expeditionReadingMode === 'technical' ? 'technical' : 'explorer';
      setReadingMode(mode);
    });
  }

  standbyLaunchBtn?.addEventListener('click', () => {
    void handleLaunch('transit');
  });

  window.addEventListener('expedition:start-descent', ((e: CustomEvent<{ body?: 'moon' | 'mars' }>) => {
    const body = e.detail?.body;
    if (body !== 'mars' && body !== 'moon') return;
    selectedId = findArtifactForBody(body).id;
    updateSelectionUi();
    if (launching) {
      pendingDescentBody = body;
      return;
    }
    void handleLaunch('descent');
  }) as EventListener);

  subscribeReadingModeChange(updateReadingModeUi);
  updateReadingModeUi(currentMode);

  // Direct handoff from Game 3 landing pages (`/?explore=mars#expedition` or `/?explore=moon#expedition`)
  const searchParams = new URLSearchParams(window.location.search);
  const exploreBody = searchParams.get('explore');
  if (exploreBody === 'mars' || exploreBody === 'moon') {
    const landingTarget = findArtifactForBody(exploreBody);
    selectedId = landingTarget.id;
    updateSelectionUi();
    window.history.replaceState(null, '', `${window.location.pathname}#expedition`);
    void handleLaunch('drive');
  } else {
    updateSelectionUi();
  }
}
