import {
  DISCOVERY_EVENT,
  getArtifactDiscoveryState,
  getReadingMode,
  readDiscoveryState,
  setReadingMode,
  subscribeDiscoveryChange,
  subscribeReadingModeChange,
  type DiscoveryStatus,
  type ReadingMode,
} from '../discovery';
import { formatCoordinates } from '../format';
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

function discoveryLabel(status: DiscoveryStatus): string {
  if (status === 'recovered') return 'RECOVERED';
  if (status === 'inspected') return 'INSPECTED';
  return 'DORMANT';
}

export function initExpeditionSection(): void {
  const catalog = readCatalogFromDom();
  if (catalog.length === 0) return;

  const byId = new Map<string, ExpeditionArtifact>(catalog.map((item) => [item.id, item]));
  let selectedId = catalog[0].id;
  let currentMode: ReadingMode = getReadingMode();
  let activeController: ExpeditionController | null = null;
  let launching = false;

  const stageEl = document.getElementById('expedition-stage');
  const standbyEl = document.getElementById('expedition-standby');
  const canvasEl = document.getElementById('expedition-canvas') as HTMLCanvasElement | null;
  const hudEl = document.getElementById('expedition-hud');
  const fallbackEl = document.getElementById('expedition-webgl-fallback');
  const liveRegionEl = document.getElementById('expedition-live-region');
  const launchPanelEl = document.getElementById('expedition-launch-panel');
  const briefingEl = document.getElementById('expedition-selected-briefing');
  const standbyTitleEl = document.getElementById('expedition-standby-title');
  const standbySummaryEl = document.getElementById('expedition-standby-summary');
  const launchBtn = document.getElementById('expedition-launch-btn') as HTMLButtonElement | null;
  const fullscreenCheckbox = document.getElementById(
    'expedition-fullscreen-toggle',
  ) as HTMLInputElement | null;

  const cardButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-expedition-select]'),
  );
  const modeButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-expedition-reading-mode]'),
  );
  const discoveryPills = Array.from(
    document.querySelectorAll<HTMLElement>('[data-expedition-discovery]'),
  );

  if (!stageEl || !standbyEl || !canvasEl || !hudEl || !fallbackEl || !launchBtn) {
    return;
  }

  const stage = stageEl;
  const standby = standbyEl;
  const canvas = canvasEl;
  const hud = hudEl;
  const fallback = fallbackEl;
  const launchButton = launchBtn;

  function updateReadingModeUi(mode: ReadingMode): void {
    currentMode = mode;
    for (const btn of modeButtons) {
      const pressed = btn.dataset.expeditionReadingMode === mode;
      btn.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    }
    updateSelectionUi();
    activeController?.setReadingMode(mode);
  }

  function updateDiscoveryPills(): void {
    const snapshot = readDiscoveryState(byId.keys());
    for (const pill of discoveryPills) {
      const id = pill.dataset.expeditionDiscovery ?? '';
      const status = getArtifactDiscoveryState(id, snapshot);
      pill.dataset.discoveryState = status;
      pill.textContent = discoveryLabel(status);
    }
  }

  function updateSelectionUi(): void {
    const artifact = byId.get(selectedId) ?? catalog[0];
    selectedId = artifact.id;

    for (const btn of cardButtons) {
      const isSelected = btn.dataset.expeditionSelect === selectedId;
      btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    }

    const coords = formatCoordinates(artifact.site.lat, artifact.site.lon);
    if (briefingEl) {
      briefingEl.textContent = `${artifact.name} · ${artifact.site.name} (${coords})`;
    }
    if (standbyTitleEl) {
      standbyTitleEl.textContent = `Ready for Launch: ${artifact.name}`;
    }
    if (standbySummaryEl) {
      standbySummaryEl.textContent =
        currentMode === 'explorer'
          ? (artifact.kidSummary ?? artifact.scientificValue)
          : artifact.scientificValue;
    }
  }

  function restoreStandbyUi(scrollToSelector: boolean): void {
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

    launchButton.disabled = false;
    launchButton.textContent = 'Launch Expedition ->';

    if (scrollToSelector) {
      launchPanelEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleLaunch(): Promise<void> {
    if (launching) return;
    const artifact = byId.get(selectedId) ?? catalog[0];

    launching = true;
    launchButton.disabled = true;
    launchButton.textContent = 'Initializing 3D...';

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
        canvas,
        hudRoot: hud,
        stageEl: stage,
        webglFallbackEl: fallback,
        standbyEl: standby,
        liveRegionEl,
        initialMode: currentMode,
        reducedMotion,
        onExit: () => restoreStandbyUi(false),
        onSelectAnother: () => restoreStandbyUi(true),
      });

      stage.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'nearest' });
      launchButton.disabled = false;
      launchButton.textContent = 'Relaunch Selected ->';
    } catch {
      standby.hidden = true;
      canvas.hidden = true;
      hud.hidden = true;
      fallback.hidden = false;
      launchButton.disabled = false;
      launchButton.textContent = 'Retry Launch ->';
    } finally {
      launching = false;
    }
  }

  for (const btn of cardButtons) {
    btn.addEventListener('click', () => {
      const id = btn.dataset.expeditionSelect;
      if (id && byId.has(id)) {
        selectedId = id;
        updateSelectionUi();
        if (isSonarEnabled()) {
          playSonarTone('tick');
        }
      }
    });
  }

  for (const btn of modeButtons) {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.expeditionReadingMode === 'technical' ? 'technical' : 'explorer';
      setReadingMode(mode);
    });
  }

  launchBtn.addEventListener('click', () => {
    void handleLaunch();
  });

  subscribeReadingModeChange(updateReadingModeUi);
  subscribeDiscoveryChange(updateDiscoveryPills);
  window.addEventListener(DISCOVERY_EVENT, updateDiscoveryPills);

  updateReadingModeUi(currentMode);
  updateDiscoveryPills();
  updateSelectionUi();
}
