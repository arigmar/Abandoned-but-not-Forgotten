/**
 * Shared runtime helpers for the Three.js mission pages (/vuelo, /aterrizaje, /vuelo-luna, /aterrizaje-luna).
 *
 * They assume the markup provided by `src/layouts/MissionGame.astro`.
 * Plain JavaScript on purpose: the mission scripts are plain JS too.
 */

/** Container that receives the WebGL canvas. */
export const viewport = document.getElementById('juego');

export const viewportWidth = () => viewport?.clientWidth || window.innerWidth;
export const viewportHeight = () => viewport?.clientHeight || window.innerHeight;

/**
 * HUD writer that only touches the DOM when the content actually changes.
 * Telemetry updates every frame; rewriting identical innerHTML 60 times per
 * second would be wasted work, and the live region must stay quiet.
 */
export function createHud() {
  const telemetryEl = document.getElementById('hud-telemetry');
  const statusEl = document.getElementById('hud-status');
  let lastTelemetry = '';
  let lastStatus = '';

  return {
    setTelemetry(html) {
      if (html === lastTelemetry) return;
      lastTelemetry = html;
      if (telemetryEl) telemetryEl.innerHTML = html;
    },
    setStatus(html) {
      if (html === lastStatus) return;
      lastStatus = html;
      if (statusEl) statusEl.innerHTML = html;
    },
  };
}

/** Wire the shell's Restart button (and any `mission:restart` dispatcher). */
export function onMissionRestart(restart) {
  window.addEventListener('mission:restart', () => restart());
}

/** Wire the shell's Launch-to-Orbit action (`mission:launch-orbit`). */
export function onLaunchOrbit(launch) {
  window.addEventListener('mission:launch-orbit', () => launch());
}

/** Wire the shell's Explore-Surface action (`mission:explore-surface`). */
export function onExploreSurface(explore) {
  window.addEventListener('mission:explore-surface', () => explore());
}

/** Wire destination switch events from the top bar (`mission:select-target`). */
export function onSelectTarget(select) {
  window.addEventListener('mission:select-target', (e) => {
    const target = e.detail?.target;
    if (target) select(target);
  });
}

/** Notify shell chrome which celestial target is currently highlighted. */
export function emitTargetChanged(target) {
  window.dispatchEvent(new CustomEvent('mission:target-changed', { detail: { target } }));
}

/**
 * Gates rendering on real visibility: the tab must be visible and the viewport
 * must be on screen. requestAnimationFrame already stops in hidden tabs, but an
 * iframe scrolled out of view keeps rendering without this.
 */
export function createRenderGate(element = viewport) {
  let onScreen = true;

  if (element && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        onScreen = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    observer.observe(element);
  }

  return {
    get active() {
      return onScreen && !document.hidden;
    },
  };
}

/**
 * Keeps renderer and camera in sync with the container size. Uses a
 * ResizeObserver instead of `window.resize` so it also reacts to layout changes
 * and to being embedded.
 */
export function observeViewportSize(renderer, camera, element = viewport) {
  const apply = () => {
    const width = viewportWidth();
    const height = viewportHeight();
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  apply();

  if (element && 'ResizeObserver' in window) {
    new ResizeObserver(apply).observe(element);
  }
  window.addEventListener('resize', apply);

  return apply;
}
