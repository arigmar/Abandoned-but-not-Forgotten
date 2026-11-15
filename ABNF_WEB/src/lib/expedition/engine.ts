import { NoToneMapping, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { subscribeDiscoveryChange, subscribeReadingModeChange } from '../discovery';
import { buildArtifactHotspots, createExpeditionHud } from './hud';
import { createExpeditionInput } from './input';
import { createTokenPalette } from './palette';
import { createDescentScene } from './scenes/descent';
import { createSurfaceScene, type SurfaceSceneController } from './scenes/surface';
import { createTransitScene, type SceneController } from './scenes/transit';
import type { ExpeditionController, ExpeditionLaunchOptions, ExpeditionPhase } from './types';

export function launchExpedition(options: ExpeditionLaunchOptions): ExpeditionController {
  const {
    artifact,
    canvas,
    hudRoot,
    stageEl,
    webglFallbackEl,
    standbyEl,
    liveRegionEl,
    initialMode,
    reducedMotion,
    onExit,
    onSelectAnother,
  } = options;

  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
  } catch (err) {
    standbyEl.hidden = true;
    canvas.hidden = true;
    hudRoot.hidden = true;
    webglFallbackEl.hidden = false;
    throw err;
  }

  // Clamp tone mapping and pixel ratio so colors strictly respect CSS design ceilings
  renderer.toneMapping = NoToneMapping;
  renderer.outputColorSpace = SRGBColorSpace;
  const maxDpr = window.innerWidth < 768 ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));

  const tokens = createTokenPalette();
  const hotspots = buildArtifactHotspots(artifact);

  const camera = new PerspectiveCamera(56, 16 / 9, 0.2, 320);

  let phase: ExpeditionPhase = 'transit';
  let paused = false;
  let destroyed = false;
  let rafId = 0;
  let lastFrameMs = performance.now();

  let transitCtrl: SceneController | null = null;
  let descentCtrl: SceneController | null = null;
  let surfaceCtrl: SurfaceSceneController | null = null;

  let transitYaw = 0;
  let transitPitch = 0;

  const hud = createExpeditionHud(
    artifact,
    stageEl,
    liveRegionEl,
    initialMode,
    reducedMotion,
    {
      onSkip: () => skipCurrentSequence(),
      onPauseToggle: () => setPaused(!paused),
      onFullscreenToggle: () => toggleFullscreen(),
      onExit: () => onExit(),
      onResume: () => setPaused(false),
      onRestart: () => restartMission(),
      onAbortToSelector: () => onSelectAnother(),
      onPulse: () => surfaceCtrl?.triggerSonarPulse(),
      onAutoApproach: () => surfaceCtrl?.toggleAutoApproach(),
      onPrevHotspot: () => surfaceCtrl?.stepHotspot(-1),
      onNextHotspot: () => surfaceCtrl?.stepHotspot(1),
      onScanActive: () => surfaceCtrl?.interactInInspect(),
      onReturnDrive: () => surfaceCtrl?.returnToDriveMode(),
      onSelectHotspot: (idx) => surfaceCtrl?.selectHotspot(idx),
      onRecoverComplete: () => {
        phase = 'complete';
        surfaceCtrl?.markRecovered();
      },
    },
  );

  const joystickEl = document.getElementById('expedition-joystick');
  const joystickThumbEl = document.getElementById('expedition-joystick-thumb');

  const input = createExpeditionInput(canvas, joystickEl, joystickThumbEl, {
    onSkip: () => skipCurrentSequence(),
    onPulse: () => surfaceCtrl?.triggerSonarPulse(),
    onInteract: () => surfaceCtrl?.interactInInspect(),
    onAutoApproach: () => surfaceCtrl?.toggleAutoApproach(),
    onPauseToggle: () => setPaused(!paused),
    onPrevHotspot: () => surfaceCtrl?.stepHotspot(-1),
    onNextHotspot: () => surfaceCtrl?.stepHotspot(1),
    onSelectHotspotIndex: (idx) => surfaceCtrl?.selectHotspot(idx),
    onHoldStart: () => hud.startKeyboardHold(),
    onHoldEnd: () => hud.stopKeyboardHold(),
  });

  function updateViewportSize(): void {
    const rect = stageEl.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width));
    const h = Math.max(240, Math.round(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function clearAllScenes(): void {
    transitCtrl?.dispose();
    transitCtrl = null;
    descentCtrl?.dispose();
    descentCtrl = null;
    surfaceCtrl?.dispose();
    surfaceCtrl = null;
  }

  function enterPhase(next: ExpeditionPhase): void {
    clearAllScenes();
    phase = next;
    transitYaw = 0;
    transitPitch = 0;

    if (next === 'transit') {
      transitCtrl = createTransitScene(artifact, tokens, reducedMotion);
      hud.setPhase('transit');
      hud.announce(`Phase 1 Transit: Approaching ${artifact.body}. Press Enter or Skip to advance.`);
    } else if (next === 'descent') {
      descentCtrl = createDescentScene(artifact, tokens, reducedMotion);
      hud.setPhase('descent');
      hud.announce(`Phase 2 Descent: Entering approach over ${artifact.site.name}.`);
    } else if (next === 'drive') {
      surfaceCtrl = createSurfaceScene(artifact, hotspots, tokens, hud, reducedMotion);
      hud.announce(`Phase 3 Surface Exploration near ${artifact.site.name}. Press Space for sonar pulse.`);
    }
  }

  function skipCurrentSequence(): void {
    if (paused) return;
    if (phase === 'transit') {
      enterPhase('descent');
    } else if (phase === 'descent') {
      enterPhase('drive');
    }
  }

  function setPaused(value: boolean): void {
    if (destroyed) return;
    paused = value;
    input.setActive(!paused);
    hud.setPaused(paused);
    if (!paused) {
      lastFrameMs = performance.now();
    }
  }

  function toggleFullscreen(): void {
    if (document.fullscreenElement === stageEl) {
      document.exitFullscreen().catch(() => {});
    } else if (document.fullscreenEnabled) {
      stageEl.requestFullscreen().catch(() => {});
    }
  }

  function restartMission(): void {
    setPaused(false);
    hud.resetRun();
    enterPhase('transit');
  }

  const onVisibilityChange = (): void => {
    if (document.hidden && !paused) {
      setPaused(true);
    }
  };

  const onContextLost = (event: Event): void => {
    event.preventDefault();
    paused = true;
    canvas.hidden = true;
    hudRoot.hidden = true;
    webglFallbackEl.hidden = false;
  };

  const onContextRestored = (): void => {
    webglFallbackEl.hidden = true;
    canvas.hidden = false;
    hudRoot.hidden = false;
    updateViewportSize();
    setPaused(false);
  };

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateViewportSize())
      : null;
  resizeObserver?.observe(stageEl);

  window.addEventListener('resize', updateViewportSize);
  document.addEventListener('visibilitychange', onVisibilityChange);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const unsubDiscovery = subscribeDiscoveryChange(() => {
    surfaceCtrl?.applyDiscoverySync();
  });
  const unsubReading = subscribeReadingModeChange((mode) => {
    hud.setReadingMode(mode);
  });

  function loop(nowMs: number): void {
    if (destroyed) return;
    rafId = window.requestAnimationFrame(loop);

    const rawDt = (nowMs - lastFrameMs) / 1000;
    lastFrameMs = nowMs;
    const dt = Math.min(0.05, Math.max(0.001, rawDt));

    if (paused) return;

    if (phase === 'transit' && transitCtrl) {
      const orbit = input.consumeOrbitDelta();
      input.consumeWheelZoom();
      transitYaw += orbit.yaw;
      transitPitch += orbit.pitch;
      const done = transitCtrl.update(dt, camera, transitYaw, transitPitch);
      hud.setDistanceReadout(transitCtrl.getHudStatus());
      renderer.render(transitCtrl.scene, camera);
      if (done) enterPhase('descent');
    } else if (phase === 'descent' && descentCtrl) {
      const orbit = input.consumeOrbitDelta();
      input.consumeWheelZoom();
      transitYaw += orbit.yaw;
      transitPitch += orbit.pitch;
      const done = descentCtrl.update(dt, camera, transitYaw, transitPitch);
      hud.setDistanceReadout(descentCtrl.getHudStatus());
      renderer.render(descentCtrl.scene, camera);
      if (done) enterPhase('drive');
    } else if (surfaceCtrl) {
      surfaceCtrl.update(dt, nowMs, camera, input);
      const nextSub = surfaceCtrl.getSubMode();
      if (nextSub === 'inspect' || nextSub === 'drive' || nextSub === 'complete') {
        phase = nextSub;
      }
      renderer.render(surfaceCtrl.scene, camera);
    }
  }

  updateViewportSize();
  enterPhase('transit');
  rafId = window.requestAnimationFrame(loop);

  return {
    setReadingMode(mode) {
      hud.setReadingMode(mode);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      window.cancelAnimationFrame(rafId);

      unsubDiscovery();
      unsubReading();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateViewportSize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      clearAllScenes();
      input.destroy();
      hud.destroy();
      renderer.dispose();
    },
  };
}
