import { NoToneMapping, PerspectiveCamera, SRGBColorSpace, WebGLRenderer } from 'three';
import { subscribeDiscoveryChange, subscribeReadingModeChange } from '../discovery';
import { buildArtifactHotspots, createExpeditionHud } from './hud';
import { createExpeditionInput } from './input';
import { createTokenPalette } from './palette';
import { createAscentScene, createDescentScene } from './scenes/descent';
import { createSurfaceScene, type SurfaceSceneController } from './scenes/surface';
import { createTransitScene, type SceneController, type TransitSceneOptions } from './scenes/transit';
import type { ExpeditionController, ExpeditionLaunchOptions, ExpeditionPhase } from './types';

export function launchExpedition(options: ExpeditionLaunchOptions): ExpeditionController {
  const {
    artifact,
    planetArtifacts,
    canvas,
    hudRoot,
    stageEl,
    webglFallbackEl,
    standbyEl,
    liveRegionEl,
    initialMode,
    initialPhase = 'transit',
    reducedMotion,
    onExit,
    onSelectAnother,
    onCaptureOtherBody,
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

  const camera = new PerspectiveCamera(56, 16 / 9, 0.2, 1200);

  let phase: ExpeditionPhase = initialPhase;
  let paused = false;
  let destroyed = false;
  let rafId = 0;
  let lastFrameMs = performance.now();

  let transitCtrl: SceneController | null = null;
  let descentCtrl: SceneController | null = null;
  let ascentCtrl: SceneController | null = null;
  let surfaceCtrl: SurfaceSceneController | null = null;

  let transitYaw = 0;
  let transitPitch = 0;
  let lastLandingState: 'flying' | 'landed' | 'offpad' | 'crashed' = 'flying';

  const toggleAssistOrApproach = (): void => {
    if (paused) return;
    if (phase === 'transit' && transitCtrl?.toggleAutoPilot) {
      const engaged = transitCtrl.toggleAutoPilot();
      hud.setFlightAssistEngaged('transit', engaged);
      hud.announce(engaged ? 'Auto-cruise engaged.' : 'Auto-cruise disengaged.');
    } else if (phase === 'descent' && descentCtrl?.toggleAutoPilot) {
      const engaged = descentCtrl.toggleAutoPilot();
      hud.setFlightAssistEngaged('descent', engaged);
      hud.announce(engaged ? 'Auto-land engaged.' : 'Manual descent control.');
    } else if (surfaceCtrl) {
      surfaceCtrl.toggleAutoApproach();
    }
  };

  const selectNavTarget = (body: 'moon' | 'mars'): void => {
    if (phase !== 'transit' || !transitCtrl?.setNavTarget) return;
    transitCtrl.setNavTarget(body);
    hud.setNavTargetBody(body);
    hud.announce(`Navigation target locked: ${body === 'moon' ? 'Moon' : 'Mars'}.`);
  };

  const triggerRetryDescent = (): void => {
    if (paused || phase !== 'descent' || !descentCtrl?.retry) return;
    descentCtrl.retry();
    lastLandingState = 'flying';
    hud.setTouchdownState('flying');
    hud.setDescentRetryVisible(false);
    hud.setFlightAssistEngaged('descent', Boolean(descentCtrl.isAutoPilotEngaged?.()));
    hud.announce('Retrying powered descent.');
  };

  const triggerLaunchOrbit = (): void => {
    if (paused || destroyed || phase === 'transit' || phase === 'ascent') return;
    enterPhase('ascent');
  };

  const triggerExploreSurface = (): void => {
    if (paused || destroyed || phase !== 'descent') return;
    enterPhase('drive');
  };

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
      onAutoApproach: () => toggleAssistOrApproach(),
      onPrevHotspot: () => surfaceCtrl?.stepHotspot(-1),
      onNextHotspot: () => surfaceCtrl?.stepHotspot(1),
      onScanActive: () => surfaceCtrl?.interactInInspect(),
      onReturnDrive: () => surfaceCtrl?.returnToDriveMode(),
      onSelectHotspot: (idx) => surfaceCtrl?.selectHotspot(idx, false),
      onDiagnosticTest: () => surfaceCtrl?.triggerDiagnosticTest(),
      onSimModeChange: (nominal) => surfaceCtrl?.setSimMode(nominal),
      onRecoverComplete: () => {
        phase = 'complete';
        surfaceCtrl?.markRecovered();
      },
      onSelectNavTarget: (body) => selectNavTarget(body),
      onFlightAssist: () => toggleAssistOrApproach(),
      onRetryDescent: () => triggerRetryDescent(),
      onLaunchOrbit: () => triggerLaunchOrbit(),
      onExploreSurface: () => triggerExploreSurface(),
      onContinueSurface: () => {
        phase = 'drive';
        surfaceCtrl?.continueExploring();
      },
    },
  );

  const joystickEl = document.getElementById('expedition-joystick');
  const joystickThumbEl = document.getElementById('expedition-joystick-thumb');

  const input = createExpeditionInput(canvas, joystickEl, joystickThumbEl, {
    onSkip: () => skipCurrentSequence(),
    onPulse: () => surfaceCtrl?.triggerSonarPulse(),
    onInteract: () => {
      if (phase === 'descent' && descentCtrl?.getLandingState?.() !== 'flying') {
        triggerExploreSurface();
        return;
      }
      surfaceCtrl?.interactInInspect();
    },
    onAutoApproach: () => toggleAssistOrApproach(),
    onPauseToggle: () => setPaused(!paused),
    onPrevHotspot: () => surfaceCtrl?.stepHotspot(-1),
    onNextHotspot: () => surfaceCtrl?.stepHotspot(1),
    onSelectHotspotIndex: (idx) => {
      if (phase === 'transit') {
        if (idx === 0) selectNavTarget('moon');
        else if (idx === 1) selectNavTarget('mars');
        return;
      }
      surfaceCtrl?.selectHotspot(idx, true);
    },
    onDiagnosticTest: () => surfaceCtrl?.triggerDiagnosticTest(),
    onHoldStart: () => hud.startKeyboardHold(),
    onHoldEnd: () => hud.stopKeyboardHold(),
    onRetry: () => triggerRetryDescent(),
    onLaunchOrbit: () => triggerLaunchOrbit(),
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
    ascentCtrl?.dispose();
    ascentCtrl = null;
    surfaceCtrl?.dispose();
    surfaceCtrl = null;
  }

  function enterPhase(next: ExpeditionPhase, transitOptions?: TransitSceneOptions): void {
    clearAllScenes();
    phase = next;
    transitYaw = 0;
    transitPitch = 0;
    lastLandingState = 'flying';
    hud.setTouchdownState('flying');

    if (next === 'transit') {
      transitCtrl = createTransitScene(artifact, tokens, reducedMotion, transitOptions);
      hud.setPhase('transit');
      hud.setNavTargetBody(transitCtrl.getNavTarget?.() ?? artifact.body);
      hud.setFlightAssistEngaged('transit', Boolean(transitCtrl.isAutoPilotEngaged?.()));
      hud.announce(
        `Phase 1 Transit: Use W or Space to thrust, WASD or Arrows to steer, G for Auto-Cruise, or Enter to skip.`,
      );
    } else if (next === 'descent') {
      descentCtrl = createDescentScene(artifact, tokens, reducedMotion);
      hud.setPhase('descent');
      hud.setFlightAssistEngaged('descent', Boolean(descentCtrl.isAutoPilotEngaged?.()));
      hud.setDescentRetryVisible(false);
      hud.announce(
        `Phase 2 Descent over ${artifact.site.name}: Space or W for retro-thrust, A/D lateral, G for Auto-Land, or Enter to deploy rover.`,
      );
    } else if (next === 'ascent') {
      ascentCtrl = createAscentScene(artifact, tokens, reducedMotion);
      hud.setPhase('ascent');
      hud.announce(`Launching from ${artifact.body} back into interplanetary space.`);
    } else if (next === 'drive') {
      surfaceCtrl = createSurfaceScene(artifact, hotspots, tokens, hud, reducedMotion, planetArtifacts);
      hud.setPhase('drive');
      hud.announce(
        `Phase 3 Surface Exploration on ${artifact.body.toUpperCase()}. All monuments active in their real coordinates. Press Space for sonar pulse or L to launch back to orbit.`,
      );
    }
  }

  function skipCurrentSequence(): void {
    if (paused) return;
    if (phase === 'transit') {
      const target = transitCtrl?.getNavTarget?.() ?? artifact.body;
      if (target !== artifact.body && onCaptureOtherBody) {
        onCaptureOtherBody(target);
        return;
      }
      enterPhase('descent');
    } else if (phase === 'descent') {
      enterPhase('drive');
    } else if (phase === 'ascent') {
      enterPhase('transit', { departedFrom: artifact.body });
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
      const done = transitCtrl.update(dt, camera, transitYaw, transitPitch, input);
      hud.setDistanceReadout(transitCtrl.getHudStatus());
      renderer.render(transitCtrl.scene, camera);
      if (done) {
        const captured = transitCtrl.getCapturedBody?.() ?? artifact.body;
        if (captured !== artifact.body && onCaptureOtherBody) {
          onCaptureOtherBody(captured);
          return;
        }
        enterPhase('descent');
      }
    } else if (phase === 'descent' && descentCtrl) {
      const orbit = input.consumeOrbitDelta();
      input.consumeWheelZoom();
      transitYaw += orbit.yaw;
      transitPitch += orbit.pitch;
      const done = descentCtrl.update(dt, camera, transitYaw, transitPitch, input);
      const landingState = descentCtrl.getLandingState?.() ?? 'flying';
      if (landingState !== lastLandingState) {
        lastLandingState = landingState;
        hud.setDescentRetryVisible(landingState !== 'flying');
        hud.setTouchdownState(landingState, descentCtrl.getImpactInfo?.());
      }
      hud.setDistanceReadout(descentCtrl.getHudStatus());
      renderer.render(descentCtrl.scene, camera);
      if (done) enterPhase('drive');
    } else if (phase === 'ascent' && ascentCtrl) {
      const orbit = input.consumeOrbitDelta();
      input.consumeWheelZoom();
      transitYaw += orbit.yaw;
      transitPitch += orbit.pitch;
      const done = ascentCtrl.update(dt, camera, transitYaw, transitPitch, input);
      hud.setDistanceReadout(ascentCtrl.getHudStatus());
      renderer.render(ascentCtrl.scene, camera);
      if (done) enterPhase('transit', { departedFrom: artifact.body });
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
  enterPhase(initialPhase);
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
