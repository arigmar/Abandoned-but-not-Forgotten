/**
 * Shared planetary positions and orbital rules for the unified Earth-Moon-Mars
 * transit scene (`/vuelo` and `/vuelo-luna`). Both targets remain landable in
 * the same flight so players can fly between worlds freely.
 */
export function createTransitConfig(initialTarget = 'mars') {
  return {
    initialTarget,
    cruiseFlameColor: 0x2ec4b6,
    bodies: [
      {
        id: 'moon',
        label: 'Moon',
        pos: [-115, 22, -255],
        radius: 10.5,
        fallbackColor: 0x8a92a0,
        urlGLB: '/assets/games/Lune.glb',
        rotSpeed: 0.09,
        role: 'target',
        showCaptureRing: false,
        ringColor: 0x2ec4b6,
        triggerDistance: 14,
        transitionRadius: 12,
        captureFlameColor: 0x9be7ff,
        captureFlashGradient: 'radial-gradient(circle, rgba(46, 196, 182, 0.55), #090d16 78%)',
        captureStatusTitle: 'ENTERING LUNAR ORBIT',
        captureStatusBody: 'Aligning trajectory for powered lunar descent&hellip;',
        nextRoute: '/aterrizaje-luna',
      },
      {
        id: 'mars',
        label: 'Mars',
        pos: [130, -16, -340],
        radius: 44,
        fallbackColor: 0xc1440e,
        atmosphereColor: 0xff6622,
        urlGLB: '/assets/games/mars.glb',
        rotSpeed: 0.12,
        role: 'target',
        showCaptureRing: false,
        ringColor: 0xff9f1c,
        triggerDistance: 36,
        transitionRadius: 45,
        captureFlameColor: 0xffaa44,
        captureFlashGradient: 'radial-gradient(circle, #ffaa44, #d9381e)',
        captureStatusTitle: 'ENTERING MARS ORBIT',
        captureStatusBody: 'Starting powered Martian descent&hellip;',
        nextRoute: '/aterrizaje',
      },
      {
        id: 'earth',
        label: 'Earth',
        pos: [-35, -28, 125],
        radius: 52,
        fallbackColor: 0x2266cc,
        atmosphereColor: 0x44aaff,
        urlGLB: '/assets/games/earth.glb',
        rotSpeed: 0.06,
        role: 'origin',
        abortDistance: 8,
        failTitle: 'MISSION ABORTED',
        failBody: "You re-entered Earth's atmosphere.",
      },
    ],
  };
}
