import {
  AmbientLight,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
} from 'three';
import { getBodyEnvironmentPalette, type TokenPalette } from '../palette';
import type { ExpeditionArtifact } from '../types';
import { buildProceduralCelestialSphere, clampNumber, disposeObjectTree } from '../utils';
import type { SceneController } from './transit';

export function createDescentScene(
  artifact: ExpeditionArtifact,
  tokens: TokenPalette,
  reducedMotion: boolean,
): SceneController {
  const env = getBodyEnvironmentPalette(artifact.body, tokens);
  const scene = new Scene();
  scene.background = env.skyColor.clone();
  scene.fog = new FogExp2(env.fogColor.getHex(), env.fogDensity * 1.45);

  const duration = reducedMotion ? 2.5 : 9.0;
  let elapsed = 0;

  const ambient = new AmbientLight(env.ambientColor, env.ambientIntensity + 0.1);
  scene.add(ambient);

  const sun = new DirectionalLight(env.sunColor, env.sunIntensity);
  sun.position.set(22, 26, 18);
  scene.add(sun);

  // Curving planetary horizon beneath lander
  const horizonSphere = buildProceduralCelestialSphere(artifact.body, env, 118, 5);
  horizonSphere.position.set(0, -124, -14);
  scene.add(horizonSphere);

  // Surface dust landing halo on the upper horizon crest
  const haloMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0.45,
  });
  const landingBeaconRing = new Mesh(new RingGeometry(1.1, 1.35, 32), haloMat);
  landingBeaconRing.rotation.x = -Math.PI / 2;
  landingBeaconRing.position.set(0, -5.75, 0);
  scene.add(landingBeaconRing);

  // Unbranded descent carrier stage with four retro-thruster cones
  const lander = new Group();
  const shellMat = new MeshStandardMaterial({
    color: tokens.metalLight,
    roughness: 0.55,
    metalness: 0.4,
  });
  const heatMat = new MeshStandardMaterial({
    color: env.rockColor,
    roughness: 0.9,
    metalness: 0.08,
  });
  const plumeMat = new MeshBasicMaterial({
    color: env.plumeColor,
    transparent: true,
    opacity: 0.74,
  });

  const bodyCore = new Mesh(new CylinderGeometry(0.95, 1.28, 1.05, 8), shellMat);
  lander.add(bodyCore);

  const lowerShield = new Mesh(new ConeGeometry(1.42, 0.55, 8), heatMat);
  lowerShield.rotation.x = Math.PI;
  lowerShield.position.y = -0.75;
  lander.add(lowerShield);

  const plumes: Mesh[] = [];
  const offsets = [
    [-0.78, -0.58, -0.78],
    [0.78, -0.58, -0.78],
    [-0.78, -0.58, 0.78],
    [0.78, -0.58, 0.78],
  ];
  for (const [px, py, pz] of offsets) {
    const pod = new Mesh(new CylinderGeometry(0.14, 0.18, 0.35, 6), heatMat);
    pod.position.set(px, 0, pz);
    lander.add(pod);

    const flame = new Mesh(new ConeGeometry(0.22, 1.45, 8), plumeMat);
    flame.rotation.x = Math.PI;
    flame.position.set(px, py - 0.55, pz);
    lander.add(flame);
    plumes.push(flame);
  }

  scene.add(lander);

  return {
    scene,
    update(dt: number, camera: PerspectiveCamera, orbitYaw: number, orbitPitch: number): boolean {
      elapsed += dt;
      const t = clampNumber(elapsed / duration, 0, 1);
      // Ease out cleanly toward touchdown crest
      const eased = 1 - Math.pow(1 - t, 2.2);

      lander.position.y = 14 - eased * 18.2;
      horizonSphere.rotation.x = -0.02 + eased * 0.02;

      if (!reducedMotion) {
        lander.rotation.z = Math.sin(elapsed * 2.4) * 0.03 * (1 - eased);
        const flicker = 0.85 + Math.sin(elapsed * 24) * 0.16;
        for (const flame of plumes) {
          flame.scale.set(1, flicker * (0.45 + 0.55 * (1 - eased)), 1);
        }
        landingBeaconRing.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.08);
      }

      const yaw = clampNumber(orbitYaw, -0.55, 0.55);
      const pitch = clampNumber(orbitPitch, -0.15, 0.4);
      camera.position.set(
        Math.sin(yaw) * 8.2,
        lander.position.y + 3.2 + pitch * 3.0,
        7.8,
      );
      camera.lookAt(0, lander.position.y - 1.2, 0);

      return elapsed >= duration;
    },
    getHudStatus(): string {
      const t = clampNumber(elapsed / duration, 0, 1);
      const altMeters = Math.round((1 - t) * 1400);
      return `DESCENT ALT ${altMeters} M (COMPRESSED)`;
    },
    dispose() {
      disposeObjectTree(scene);
    },
  };
}
