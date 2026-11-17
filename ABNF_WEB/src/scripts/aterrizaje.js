import * as THREE from 'three';
import { withAssetUrl } from '../lib/base-path';
import { buildDistantEarth, launchLandingMission } from './landing-core';

function crearTexturaMarte() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#b5441c';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 4500; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = Math.random() * 4 + 1;
    ctx.fillStyle =
      Math.random() > 0.5 ? 'rgba(130, 40, 15, 0.25)' : 'rgba(220, 110, 60, 0.2)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

launchLandingMission({
  skyColor: 0xc8643b,
  fogColor: 0xc8643b,
  fogDensity: 0.0085,
  cameraPos: [0, 8, 22],
  cameraLookAt: [0, 6, 0],
  padDefaultColor: 0x00ffcc,
  flameColor: 0xff8800,
  orbitReturnRoute: '/vuelo?from=mars',
  exploreRoute: '/?explore=mars#expedition',
  ascentFlashGradient: 'radial-gradient(circle, rgba(255, 159, 28, 0.48), #090d16 78%)',
  physics: {
    gravity: -3.72,
    thrust: 9.6,
    lateralThrust: 3.2,
    safeVerticalSpeed: 2.5,
    safeLateralSpeed: 2.2,
    fuelMax: 100,
    fuelBurn: 22,
    lateralFuelBurn: 9,
    startY: 16,
    ceiling: 25,
    limitX: 22,
    tiltFactor: 0.06,
  },
  copy: {
    gravityTitle: 'Martian gravity: 3.72 m/s&sup2;',
    landedTitle: 'SOFT LANDING ON MARS',
    landedBody:
      'Touchdown confirmed on the pad. Press <b>[ L ]</b> to blast off to orbit (fly to Moon), or <b>[ R ]</b> to land again.',
    offPadTitle: 'OFF THE LANDING PAD',
    offPadBody:
      'You touched down outside the platform. Press <b>[ L ]</b> for orbit or <b>[ R ]</b> to retry.',
    crashTitle: 'HARD IMPACT',
  },
  buildEnvironment({ scene, loader }) {
    scene.add(new THREE.HemisphereLight(0xffb88c, 0x5c2410, 1.35));
    const sol = new THREE.DirectionalLight(0xfff0dd, 2.5);
    sol.position.set(18, 35, 22);
    sol.castShadow = true;
    scene.add(sol);

    const distantEarth = buildDistantEarth(scene, loader, {
      pos: [-140, 110, -650],
      fallbackRadius: 5.5,
      scaleDiameter: 11,
      haloRadius: 7.2,
    });

    const sueloBase = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({
        map: crearTexturaMarte(),
        roughness: 0.95,
        metalness: 0.0,
      })
    );
    sueloBase.rotation.x = -Math.PI / 2;
    sueloBase.position.y = -0.05;
    sueloBase.receiveShadow = true;
    scene.add(sueloBase);

    const grupoEscenario = new THREE.Group();
    scene.add(grupoEscenario);

    loader.load(
      withAssetUrl('/assets/games/perseverance_rover_on_mars.glb'),
      (gltf) => {
        const modeloSuelo = gltf.scene;
        const caja = new THREE.Box3();
        modeloSuelo.traverse((hijo) => {
          if (!hijo.isMesh) return;
          hijo.receiveShadow = true;
          hijo.castShadow = true;
          const mats = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
          mats.forEach((mat) => {
            mat.side = THREE.DoubleSide;
            if (mat.metalness !== undefined) {
              mat.metalness = 0.05;
              mat.roughness = 0.9;
            }
            if (mat.map) {
              mat.map.colorSpace = THREE.SRGBColorSpace;
              mat.map.needsUpdate = true;
            }
            mat.needsUpdate = true;
          });
          caja.expandByObject(hijo);
        });

        const tamano = caja.getSize(new THREE.Vector3());
        const anchoActual = Math.max(tamano.x, tamano.z);
        const escala = anchoActual > 0 ? 95 / anchoActual : 1;
        modeloSuelo.scale.setScalar(escala);

        const cajaEscalada = new THREE.Box3().setFromObject(modeloSuelo);
        const centro = cajaEscalada.getCenter(new THREE.Vector3());
        modeloSuelo.position.x -= centro.x;
        modeloSuelo.position.z -= centro.z;
        modeloSuelo.position.y -= cajaEscalada.max.y - 1.5;
        grupoEscenario.add(modeloSuelo);
      },
      undefined,
      (err) => console.error('Failed to load perseverance_rover_on_mars.glb:', err)
    );

    return {
      update({ dt }) {
        distantEarth.rotation.y += 0.08 * dt;
      },
    };
  },
});
