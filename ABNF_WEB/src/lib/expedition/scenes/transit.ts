import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
} from 'three';
import { getBodyEnvironmentPalette, type TokenPalette } from '../palette';
import type { ExpeditionArtifact } from '../types';
import { buildProceduralCelestialSphere, clampNumber, createPrng, disposeObjectTree, hashStringSeed } from '../utils';

export interface SceneController {
  scene: Scene;
  update: (dt: number, camera: PerspectiveCamera, orbitYaw: number, orbitPitch: number) => boolean;
  getHudStatus: () => string;
  dispose: () => void;
}

export function createTransitScene(
  artifact: ExpeditionArtifact,
  tokens: TokenPalette,
  reducedMotion: boolean,
): SceneController {
  const env = getBodyEnvironmentPalette(artifact.body, tokens);
  const scene = new Scene();
  scene.background = tokens.voidBg.clone();

  const duration = reducedMotion ? 2.5 : 10.5;
  let elapsed = 0;

  const ambient = new AmbientLight(tokens.slateRaised, 0.72);
  scene.add(ambient);

  const sun = new DirectionalLight(env.sunColor, 0.85);
  sun.position.set(18, 12, 14);
  scene.add(sun);

  // Target celestial body ahead (Mars or Moon only)
  const targetPlanet = buildProceduralCelestialSphere(artifact.body, env, 15, 4);
  targetPlanet.position.set(0, 1.5, -96);
  scene.add(targetPlanet);

  // Static distant star points
  const rand = createPrng(hashStringSeed(`${artifact.id}-stars`));
  const starCount = 260;
  const starCoords = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = 135 + rand() * 30;
    starCoords[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    starCoords[i * 3 + 1] = Math.cos(phi) * r;
    starCoords[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }
  const starGeom = new BufferGeometry();
  starGeom.setAttribute('position', new BufferAttribute(starCoords, 3));
  const starMat = new PointsMaterial({ color: tokens.starSecondary, size: 0.42 });
  scene.add(new Points(starGeom, starMat));

  // Speed-line starfield streaks (disabled under prefers-reduced-motion)
  let streakMesh: LineSegments | null = null;
  let streakPositions: Float32Array | null = null;
  const streakCount = 120;
  if (!reducedMotion) {
    streakPositions = new Float32Array(streakCount * 6);
    for (let i = 0; i < streakCount; i++) {
      const rx = (rand() - 0.5) * 44;
      const ry = (rand() - 0.5) * 28;
      // Keep direct central ship corridor clean
      const adjustedX = Math.abs(rx) < 3.2 ? Math.sign(rx || 1) * 4.2 : rx;
      const rz = -90 + rand() * 98;
      streakPositions[i * 6] = adjustedX;
      streakPositions[i * 6 + 1] = ry;
      streakPositions[i * 6 + 2] = rz;
      streakPositions[i * 6 + 3] = adjustedX;
      streakPositions[i * 6 + 4] = ry;
      streakPositions[i * 6 + 5] = rz + 3.2;
    }
    const streakGeom = new BufferGeometry();
    streakGeom.setAttribute('position', new BufferAttribute(streakPositions, 3));
    const streakMat = new LineBasicMaterial({
      color: tokens.starPrimary,
      transparent: true,
      opacity: 0.42,
    });
    streakMesh = new LineSegments(streakGeom, streakMat);
    scene.add(streakMesh);
  }

  // Unbranded third-person transfer spacecraft
  const ship = new Group();
  const hullMat = new MeshStandardMaterial({
    color: tokens.metalLight,
    roughness: 0.45,
    metalness: 0.55,
  });
  const darkMat = new MeshStandardMaterial({
    color: tokens.metalDark,
    roughness: 0.7,
    metalness: 0.35,
  });
  const wingMat = new MeshStandardMaterial({
    color: tokens.solarCell,
    roughness: 0.35,
    metalness: 0.55,
  });
  const plumeMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0.72,
  });

  const bus = new Mesh(new CylinderGeometry(0.55, 0.68, 2.2, 8), hullMat);
  bus.rotation.x = Math.PI / 2;
  ship.add(bus);

  const forwardNose = new Mesh(new ConeGeometry(0.55, 0.95, 8), darkMat);
  forwardNose.rotation.x = -Math.PI / 2;
  forwardNose.position.z = -1.55;
  ship.add(forwardNose);

  const dish = new Mesh(new ConeGeometry(0.5, 0.22, 10), hullMat);
  dish.rotation.x = Math.PI / 2;
  dish.position.set(0, 0.65, 0.35);
  ship.add(dish);

  const leftWing = new Mesh(new BoxGeometry(3.2, 0.05, 0.9), wingMat);
  leftWing.position.set(-2.25, 0, 0.15);
  ship.add(leftWing);

  const rightWing = new Mesh(new BoxGeometry(3.2, 0.05, 0.9), wingMat);
  rightWing.position.set(2.25, 0, 0.15);
  ship.add(rightWing);

  const plumeLeft = new Mesh(new ConeGeometry(0.24, 1.35, 8), plumeMat);
  plumeLeft.rotation.x = Math.PI / 2;
  plumeLeft.position.set(-0.28, -0.08, 1.75);
  ship.add(plumeLeft);

  const plumeRight = new Mesh(new ConeGeometry(0.24, 1.35, 8), plumeMat);
  plumeRight.rotation.x = Math.PI / 2;
  plumeRight.position.set(0.28, -0.08, 1.75);
  ship.add(plumeRight);

  scene.add(ship);

  return {
    scene,
    update(dt: number, camera: PerspectiveCamera, orbitYaw: number, orbitPitch: number): boolean {
      elapsed += dt;
      const t = clampNumber(elapsed / duration, 0, 1);

      // Smoothly grow real target planet ahead during transit
      targetPlanet.position.z = -96 + t * 58;
      targetPlanet.rotation.y += dt * 0.14;

      if (!reducedMotion) {
        ship.position.y = Math.sin(elapsed * 2.1) * 0.09;
        ship.rotation.z = Math.sin(elapsed * 1.4) * 0.04;
        const pulseScale = 0.88 + Math.sin(elapsed * 16) * 0.14;
        plumeLeft.scale.set(1, pulseScale, 1);
        plumeRight.scale.set(1, pulseScale, 1);

        if (streakMesh && streakPositions) {
          const speed = 46;
          for (let i = 0; i < streakCount; i++) {
            streakPositions[i * 6 + 2] += speed * dt;
            streakPositions[i * 6 + 5] += speed * dt;
            if (streakPositions[i * 6 + 2] > 12) {
              streakPositions[i * 6 + 2] = -90;
              streakPositions[i * 6 + 5] = -86.8;
            }
          }
          streakMesh.geometry.attributes.position.needsUpdate = true;
        }
      }

      const yawOffset = clampNumber(orbitYaw, -0.45, 0.45);
      const pitchOffset = clampNumber(orbitPitch, -0.25, 0.35);
      camera.position.set(Math.sin(yawOffset) * 5.8, 1.85 + pitchOffset * 2.4, 6.2);
      camera.lookAt(0, 0.35, -14);

      return elapsed >= duration;
    },
    getHudStatus(): string {
      const remaining = Math.max(0, duration - elapsed);
      return `APPROACH // ${artifact.body.toUpperCase()} IN ${remaining.toFixed(1)}S`;
    },
    dispose() {
      disposeObjectTree(scene);
    },
  };
}
