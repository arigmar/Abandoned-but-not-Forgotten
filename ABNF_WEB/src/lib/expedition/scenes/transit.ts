import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { createDracoGltfLoader, loadNormalizedGlbIntoGroup } from '../glb-assets';
import type { ExpeditionInput } from '../input';
import { getBodyEnvironmentPalette, type TokenPalette } from '../palette';
import type { ExpeditionArtifact } from '../types';
import {
  buildProceduralCelestialSphere,
  clampNumber,
  createPrng,
  disposeObjectTree,
  hashStringSeed,
} from '../utils';

export interface TransitSceneOptions {
  departedFrom?: 'mars' | 'moon' | null;
}

export interface SceneController {
  scene: Scene;
  update: (
    dt: number,
    camera: PerspectiveCamera,
    orbitYaw: number,
    orbitPitch: number,
    input: ExpeditionInput,
  ) => boolean;
  getHudStatus: () => string;
  toggleAutoPilot?: () => boolean;
  isAutoPilotEngaged?: () => boolean;
  setNavTarget?: (body: 'mars' | 'moon') => void;
  getNavTarget?: () => 'mars' | 'moon';
  getCapturedBody?: () => 'mars' | 'moon' | null;
  retry?: () => void;
  isCrashed?: () => boolean;
  getLandingState?: () => 'flying' | 'landed' | 'offpad' | 'crashed';
  getImpactInfo?: () => string;
  dispose: () => void;
}

interface CelestialBodyNode {
  id: 'earth' | 'moon' | 'mars';
  label: string;
  posVec: Vector3;
  radius: number;
  rotSpeed: number;
  group: Group;
  triggerDistance: number;
  captureColorHex: number;
}

function buildFallbackShip(tokens: TokenPalette): { root: Group; plumeLeft: Mesh; plumeRight: Mesh } {
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

  const plumeMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0.75,
  });
  const plumeLeft = new Mesh(new ConeGeometry(0.24, 1.35, 8), plumeMat);
  plumeLeft.rotation.x = Math.PI / 2;
  plumeLeft.position.set(-0.28, -0.08, 1.75);

  const plumeRight = new Mesh(new ConeGeometry(0.24, 1.35, 8), plumeMat);
  plumeRight.rotation.x = Math.PI / 2;
  plumeRight.position.set(0.28, -0.08, 1.75);

  ship.scale.setScalar(1.2);
  return { root: ship, plumeLeft, plumeRight };
}

function getRelativeCue(ship: Group, targetPos: Vector3): string {
  const localDir = targetPos
    .clone()
    .sub(ship.position)
    .normalize()
    .applyQuaternion(ship.quaternion.clone().invert());

  if (localDir.z < -0.92) return 'ON COURSE';
  const parts: string[] = [];
  if (localDir.x < -0.15) parts.push('LEFT');
  else if (localDir.x > 0.15) parts.push('RIGHT');
  if (localDir.y > 0.15) parts.push('UP');
  else if (localDir.y < -0.15) parts.push('DOWN');
  if (parts.length === 0 && localDir.z > 0) parts.push('BEHIND');
  return parts.join(' + ') || 'ALIGN';
}

export function createTransitScene(
  artifact: ExpeditionArtifact,
  tokens: TokenPalette,
  reducedMotion: boolean,
  options?: TransitSceneOptions,
): SceneController {
  const scene = new Scene();
  scene.background = tokens.voidBg.clone();

  let disposed = false;
  const glbHandle = createDracoGltfLoader();

  const ambient = new AmbientLight(tokens.textPrimary, 0.85);
  scene.add(ambient);

  const sun = new DirectionalLight(new Color('#E6ECF5'), 1.85);
  sun.position.set(240, 130, 210);
  scene.add(sun);

  const fill = new DirectionalLight(tokens.slateRaised, 0.45);
  fill.position.set(-160, -90, -140);
  scene.add(fill);

  // Deep-space star layers seeded deterministically
  const rand = createPrng(hashStringSeed(`${artifact.id}-deep-space`));
  const addStarLayer = (count: number, spread: number, size: number, color: Color) => {
    const coords = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      coords[i * 3] = (rand() - 0.5) * spread;
      coords[i * 3 + 1] = (rand() - 0.5) * spread;
      coords[i * 3 + 2] = (rand() - 0.5) * spread;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(coords, 3));
    const mat = new PointsMaterial({ color, size, sizeAttenuation: true });
    scene.add(new Points(geo, mat));
  };
  addStarLayer(1400, 1400, 1.35, tokens.starPrimary);
  addStarLayer(480, 1100, 2.2, tokens.starSecondary);

  // Build Earth + Moon + Mars so the player can fly freely between worlds
  const marsEnv = getBodyEnvironmentPalette('mars', tokens);
  const moonEnv = getBodyEnvironmentPalette('moon', tokens);

  const makePlanetNode = (spec: {
    id: 'earth' | 'moon' | 'mars';
    label: string;
    pos: [number, number, number];
    radius: number;
    url: string;
    rotSpeed: number;
    haloColor?: number;
    filterNonMapped?: boolean;
  }): CelestialBodyNode => {
    const group = new Group();
    const posVec = new Vector3(...spec.pos);
    group.position.copy(posVec);
    scene.add(group);

    let fallback: Object3D;
    if (spec.id === 'mars') {
      fallback = buildProceduralCelestialSphere('mars', marsEnv, spec.radius, 4);
    } else if (spec.id === 'moon') {
      fallback = buildProceduralCelestialSphere('moon', moonEnv, spec.radius, 4);
    } else {
      fallback = new Mesh(
        new SphereGeometry(spec.radius, 28, 28),
        new MeshStandardMaterial({
          color: new Color('#245FB8'),
          roughness: 0.72,
          metalness: 0.08,
        }),
      );
    }
    group.add(fallback);

    if (spec.haloColor !== undefined) {
      const halo = new Mesh(
        new SphereGeometry(spec.radius * 1.12, 24, 24),
        new MeshBasicMaterial({
          color: spec.haloColor,
          transparent: true,
          opacity: 0.16,
          side: BackSide,
        }),
      );
      group.add(halo);
    }

    loadNormalizedGlbIntoGroup(glbHandle.loader, spec.url, group, {
      targetSize: spec.radius * 2,
      fallbackToRemove: fallback,
      filterNonMappedMeshes: spec.filterNonMapped ?? false,
      isDisposed: () => disposed,
    });

    return {
      id: spec.id,
      label: spec.label,
      posVec,
      radius: spec.radius,
      rotSpeed: spec.rotSpeed,
      group,
      triggerDistance: spec.id === 'moon' ? 12 : 30,
      captureColorHex: spec.id === 'moon' ? 0x2ec4b6 : 0xff9f1c,
    };
  };

  const moonNode = makePlanetNode({
    id: 'moon',
    label: 'MOON',
    pos: [-96, 16, -210],
    radius: 8.4,
    url: '/assets/games/Lune.glb',
    rotSpeed: 0.09,
  });

  const marsNode = makePlanetNode({
    id: 'mars',
    label: 'MARS',
    pos: [110, -14, -280],
    radius: 34,
    url: '/assets/games/mars.glb',
    rotSpeed: 0.12,
    haloColor: 0xc8643b,
  });

  const earthNode = makePlanetNode({
    id: 'earth',
    label: 'EARTH',
    pos: [-32, -22, 110],
    radius: 36,
    url: '/assets/games/earth.glb',
    rotSpeed: 0.06,
    haloColor: 0x4ea8ff,
    filterNonMapped: true,
  });

  const targetNodes: Record<'moon' | 'mars', CelestialBodyNode> = {
    moon: moonNode,
    mars: marsNode,
  };

  // Controllable transfer spacecraft (procedural fallback upgraded asynchronously to spaceship.glb)
  const ship = new Group();
  const visualGroup = new Group();
  ship.add(visualGroup);
  scene.add(ship);

  const fallbackBuild = buildFallbackShip(tokens);
  visualGroup.add(fallbackBuild.root);

  const flameMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0.85,
  });
  const mainFlame = new Mesh(new ConeGeometry(0.42, 1.9, 10).rotateX(Math.PI / 2), flameMat);
  mainFlame.position.z = 2.8;
  mainFlame.visible = false;
  visualGroup.add(mainFlame);

  loadNormalizedGlbIntoGroup(glbHandle.loader, '/assets/games/spaceship.glb', visualGroup, {
    targetSize: 5.4,
    fallbackToRemove: fallbackBuild.root,
    doubleSide: true,
    rotateY: Math.PI,
    isDisposed: () => disposed,
  });

  // Dynamic local-space speed streaks
  const streakCount = 120;
  let streakLines: LineSegments | null = null;
  let streakPositions: Float32Array | null = null;
  let streakMat: LineBasicMaterial | null = null;
  const streakSeeds: Array<{ x: number; y: number; z: number }> = [];

  if (!reducedMotion) {
    streakPositions = new Float32Array(streakCount * 6);
    for (let i = 0; i < streakCount; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 5.5 + rand() * 26;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      const z = -rand() * 100;
      streakSeeds.push({ x, y, z });
      streakPositions[i * 6 + 0] = x;
      streakPositions[i * 6 + 1] = y;
      streakPositions[i * 6 + 2] = z;
      streakPositions[i * 6 + 3] = x;
      streakPositions[i * 6 + 4] = y;
      streakPositions[i * 6 + 5] = z + 0.8;
    }
    const streakGeo = new BufferGeometry();
    streakGeo.setAttribute('position', new BufferAttribute(streakPositions, 3));
    streakMat = new LineBasicMaterial({
      color: tokens.starPrimary,
      transparent: true,
      opacity: 0,
    });
    streakLines = new LineSegments(streakGeo, streakMat);
    ship.add(streakLines);
  }

  // Initial spawn state
  const departedFrom = options?.departedFrom ?? null;
  let navTarget: 'moon' | 'mars' =
    departedFrom === 'moon' ? 'mars' : departedFrom === 'mars' ? 'moon' : artifact.body;
  let speed = 0;
  let autopilot = false;
  let elapsed = 0;
  let capturingBody: CelestialBodyNode | null = null;
  let captureElapsed = 0;
  let capturedResult: 'mars' | 'moon' | null = null;
  let boundaryNoteTimer = 0;
  let departureBannerTimer = 0;

  if (departedFrom) {
    const originNode = targetNodes[departedFrom];
    const destNode = targetNodes[navTarget];
    const dir = destNode.posVec.clone().sub(originNode.posVec).normalize();
    const spawnOffset = originNode.radius + originNode.triggerDistance + 30;
    ship.position.copy(originNode.posVec).addScaledVector(dir, spawnOffset);
    ship.lookAt(destNode.posVec);
    ship.rotateY(Math.PI);
    speed = 44;
    departureBannerTimer = 3.2;
  } else {
    ship.position.set(0, 0, 0);
    ship.rotation.set(0, 0, 0);
    speed = 16;
  }

  const steerDummy = new Object3D();

  return {
    scene,

    toggleAutoPilot(): boolean {
      if (capturingBody) return autopilot;
      autopilot = !autopilot;
      return autopilot;
    },

    isAutoPilotEngaged(): boolean {
      return autopilot;
    },

    setNavTarget(body: 'mars' | 'moon'): void {
      navTarget = body;
    },

    getNavTarget(): 'mars' | 'moon' {
      return navTarget;
    },

    getCapturedBody(): 'mars' | 'moon' | null {
      return capturedResult;
    },

    update(
      dt: number,
      camera: PerspectiveCamera,
      orbitYaw: number,
      orbitPitch: number,
      input: ExpeditionInput,
    ): boolean {
      elapsed += dt;
      if (boundaryNoteTimer > 0) boundaryNoteTimer = Math.max(0, boundaryNoteTimer - dt);
      if (departureBannerTimer > 0) departureBannerTimer = Math.max(0, departureBannerTimer - dt);

      moonNode.group.rotation.y += moonNode.rotSpeed * dt;
      marsNode.group.rotation.y += marsNode.rotSpeed * dt;
      earthNode.group.rotation.y += earthNode.rotSpeed * dt;

      const targetNode = targetNodes[navTarget];

      if (capturingBody) {
        captureElapsed += dt;
        const captureDur = reducedMotion ? 0.25 : 0.95;

        const dir = capturingBody.posVec.clone().sub(ship.position).normalize();
        ship.position.addScaledVector(dir, 58 * dt);
        steerDummy.position.copy(ship.position);
        steerDummy.lookAt(capturingBody.posVec);
        steerDummy.rotateY(Math.PI);
        ship.quaternion.slerp(steerDummy.quaternion, Math.min(1, 6 * dt));

        mainFlame.visible = true;
        flameMat.color.setHex(capturingBody.captureColorHex);
        mainFlame.scale.set(1.2, 1.2, 2.6 + Math.sin(elapsed * 22) * 0.4);
        visualGroup.rotation.z += 2.2 * dt;

        const camBack = dir.clone().multiplyScalar(-10);
        camera.position.lerp(
          ship.position.clone().add(camBack).add(new Vector3(0, 2.2, 0)),
          Math.min(1, 7 * dt),
        );
        camera.lookAt(ship.position);

        if (captureElapsed >= captureDur) {
          capturedResult = capturingBody.id as 'mars' | 'moon';
          return true;
        }
        return false;
      }

      // Free spaceflight physics & steering
      let thrusting = false;
      const forwardThrust =
        input.isKeyDown('KeyW') || input.isKeyDown('Space') || input.throttle > 0.35;
      const brakeThrust = input.isKeyDown('KeyS') || input.throttle < -0.35;

      if (forwardThrust || brakeThrust) {
        if (forwardThrust) {
          speed = Math.min(125, speed + 52 * dt);
          thrusting = true;
        }
        if (brakeThrust) {
          speed = Math.max(-24, speed - 44 * dt);
        }
      } else if (autopilot) {
        const dist = ship.position.distanceTo(targetNode.posVec) - targetNode.radius;
        const desiredSpeed = dist > 95 ? 92 : Math.max(42, dist * 0.95);
        speed += (desiredSpeed - speed) * Math.min(1, 2.4 * dt);
        thrusting = true;
      } else {
        speed *= 1 - 0.14 * dt;
        if (Math.abs(speed) < 0.08) speed = 0;
      }

      const yawTurnRate = 1.75;
      const pitchTurnRate = 1.3;

      const leftHeld = input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft') || input.steer < -0.25;
      const rightHeld = input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight') || input.steer > 0.25;
      const pitchUpHeld = input.isKeyDown('ArrowUp') || input.isKeyDown('KeyI');
      const pitchDownHeld = input.isKeyDown('ArrowDown') || input.isKeyDown('KeyK');

      const manualSteering = leftHeld || rightHeld || pitchUpHeld || pitchDownHeld;
      let bankTarget = 0;

      if (manualSteering) {
        if (leftHeld) {
          ship.rotateY(yawTurnRate * dt);
          bankTarget += 0.24;
        }
        if (rightHeld) {
          ship.rotateY(-yawTurnRate * dt);
          bankTarget -= 0.24;
        }
        if (pitchUpHeld) {
          ship.rotateX(pitchTurnRate * dt);
        }
        if (pitchDownHeld) {
          ship.rotateX(-pitchTurnRate * dt);
        }
      } else if (autopilot) {
        steerDummy.position.copy(ship.position);
        steerDummy.lookAt(targetNode.posVec);
        steerDummy.rotateY(Math.PI);
        ship.quaternion.slerp(steerDummy.quaternion, Math.min(1, 2.8 * dt));
      }

      visualGroup.rotation.z +=
        (bankTarget - visualGroup.rotation.z) * Math.min(1, 7 * dt);

      ship.translateZ(-speed * dt);

      // Keep Earth from killing the mission ("sin morir en el intento"): soft rebound outside atmosphere
      const earthSurfDist = ship.position.distanceTo(earthNode.posVec) - earthNode.radius;
      if (earthSurfDist < 8) {
        const pushOut = ship.position.clone().sub(earthNode.posVec).normalize();
        ship.position.copy(earthNode.posVec).addScaledVector(pushOut, earthNode.radius + 9);
        speed = Math.max(0, speed * 0.4);
        boundaryNoteTimer = 2.0;
      }

      // Check capture rings for Moon or Mars
      for (const candidate of [moonNode, marsNode]) {
        const surfDist = ship.position.distanceTo(candidate.posVec) - candidate.radius;
        if (surfDist <= candidate.triggerDistance) {
          capturingBody = candidate;
          captureElapsed = 0;
          autopilot = false;
          return false;
        }
      }

      // Flame visuals & speed streaks
      mainFlame.visible = thrusting;
      if (thrusting) {
        flameMat.color.setHex(autopilot ? 0x2ec4b6 : targetNode.captureColorHex);
        const flicker = 0.88 + Math.sin(elapsed * 22) * 0.16;
        mainFlame.scale.set(1, 1, flicker * (0.9 + Math.min(1.4, Math.abs(speed) / 85)));
      }

      if (streakLines && streakPositions && streakMat) {
        const norm = clampNumber(Math.abs(speed) / 115, 0, 1.5);
        streakMat.opacity = norm > 0.08 ? clampNumber(norm * 0.45, 0, 0.58) : 0;
        if (streakMat.opacity > 0) {
          const adv = Math.max(10, Math.abs(speed) * 0.85) * dt;
          const tail = 0.6 + norm * 4.2;
          for (let i = 0; i < streakCount; i++) {
            const s = streakSeeds[i];
            s.z += adv;
            if (s.z > 12) s.z = -100 + rand() * 10;
            const b = i * 6;
            streakPositions[b + 0] = s.x;
            streakPositions[b + 1] = s.y;
            streakPositions[b + 2] = s.z;
            streakPositions[b + 3] = s.x;
            streakPositions[b + 4] = s.y;
            streakPositions[b + 5] = s.z - tail;
          }
          streakLines.geometry.attributes.position.needsUpdate = true;
        }
      }

      // Smooth chase camera with subtle viewport orbit look offset
      const yawOff = clampNumber(orbitYaw, -0.55, 0.55);
      const pitchOff = clampNumber(orbitPitch, -0.25, 0.35);
      const camOffset = new Vector3(
        Math.sin(yawOff) * 6.2,
        3.2 + pitchOff * 2.8,
        12.5,
      ).applyQuaternion(ship.quaternion);
      const desiredCam = ship.position.clone().add(camOffset);
      camera.position.lerp(desiredCam, Math.min(1, 8.5 * dt));

      const lookAhead = new Vector3(0, 0.9, -22)
        .applyQuaternion(ship.quaternion)
        .add(ship.position);
      camera.lookAt(lookAhead);

      return false;
    },

    getHudStatus(): string {
      if (capturingBody) {
        return `CAPTURE LOCK // ENTERING ${capturingBody.label} ORBIT...`;
      }
      const targetNode = targetNodes[navTarget];
      const dist = Math.max(0, Math.round(ship.position.distanceTo(targetNode.posVec) - targetNode.radius));
      const cue = getRelativeCue(ship, targetNode.posVec);
      const modeTag = autopilot ? 'AUTO-CRUISE' : 'MANUAL';
      const prefix =
        boundaryNoteTimer > 0
          ? 'EARTH ATMOSPHERE BOUNDARY · '
          : departureBannerTimer > 0
            ? 'ORBIT CLEARED · '
            : '';
      return `${prefix}${modeTag} -> ${targetNode.label} ${dist} KM (${cue}) · SPD ${Math.round(speed)} · [W/SPACE] THRUST · [A/D/ARROWS] STEER · [1/2] TARGET · [G] AUTO`;
    },

    dispose() {
      disposed = true;
      glbHandle.dispose();
      disposeObjectTree(scene);
    },
  };
}
