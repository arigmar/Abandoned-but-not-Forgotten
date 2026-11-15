import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
} from 'three';
import type { BodyEnvironmentPalette, TokenPalette } from './palette';
import { createPlanetaryRegolithTexture } from './textures';
import { clampNumber, createPrng, hashStringSeed } from './utils';

export interface CraterSpec {
  x: number;
  z: number;
  radius: number;
  depth: number;
}

export interface BoulderCollision {
  x: number;
  z: number;
  radius: number;
}

export interface SurfaceTerrainData {
  root: Group;
  spawnPosition: { x: number; z: number };
  boulders: BoulderCollision[];
  getHeight: (x: number, z: number) => number;
  stampWheelTracks: (
    x: number,
    z: number,
    yaw: number,
    heightAt: (px: number, pz: number) => number,
  ) => void;
  updateDust: (dt: number, roverX: number, roverY: number, roverZ: number, speed: number) => void;
}

export interface SurveyRoverRig {
  root: Group;
  leftWheels: Mesh[];
  rightWheels: Mesh[];
  frontSteerPivots: Group[];
  mastBeacon: Mesh;
}

export const ROVER_SCALE = 0.28;
export const ROVER_WHEEL_RADIUS = 0.29 * ROVER_SCALE;
export const ROVER_SPAWN_X = 0;
export const ROVER_SPAWN_Z = 62;

export interface SurfaceZonePoint {
  x: number;
  z: number;
}

export function buildSurfaceTerrain(
  artifactId: string,
  body: 'mars' | 'moon',
  env: BodyEnvironmentPalette,
  reducedMotion: boolean,
  monumentSites: SurfaceZonePoint[] = [{ x: 0, z: 0 }],
  shipPad: SurfaceZonePoint = { x: -11, z: 54 },
  roverSpawn: SurfaceZonePoint = { x: ROVER_SPAWN_X, z: ROVER_SPAWN_Z },
): SurfaceTerrainData {
  const rand = createPrng(hashStringSeed(artifactId));
  const root = new Group();
  root.name = 'surface-terrain';

  const isNearExclusion = (px: number, pz: number, monClear: number, padClear: number): boolean => {
    if (Math.hypot(px - roverSpawn.x, pz - roverSpawn.z) < padClear) return true;
    if (Math.hypot(px - shipPad.x, pz - shipPad.z) < padClear + 2) return true;
    for (const site of monumentSites) {
      if (Math.hypot(px - site.x, pz - site.z) < monClear) return true;
    }
    return false;
  };

  const craters: CraterSpec[] = [];
  const craterCount = body === 'moon' ? 38 : 24;
  for (let i = 0; i < craterCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 10 + rand() * 124;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    if (isNearExclusion(cx, cz, 12.5, 11)) continue;
    craters.push({
      x: cx,
      z: cz,
      radius: 3.2 + rand() * 7.8,
      depth: 0.45 + rand() * 1.15,
    });
  }

  const phaseA = rand() * Math.PI * 2;
  const phaseB = rand() * Math.PI * 2;

  const getHeight = (x: number, z: number): number => {
    const ridge =
      Math.sin(x * 0.042 + phaseA) * Math.cos(z * 0.038 + phaseB) * 1.35 +
      Math.sin((x + z) * 0.095 + phaseA) * 0.42 +
      Math.cos((x - z) * 0.14) * 0.18;

    let h = ridge;

    // Distant perimeter crater-basin ridge elevation for natural horizon hills
    const radialDist = Math.hypot(x, z);
    if (radialDist > 118) {
      const outerT = clampNumber((radialDist - 118) / 36, 0, 1);
      h +=
        outerT *
        outerT *
        (4.8 + Math.sin(Math.atan2(z, x) * 5 + phaseA) * 2.1 + Math.cos(radialDist * 0.15) * 1.1);
    }

    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.radius * 1.35) continue;
      const t = d / c.radius;
      if (t < 1.0) {
        h -= (1 - t * t) * c.depth;
      } else {
        // Raised crater rim
        const rimT = 1 - (t - 1.0) / 0.35;
        h += rimT * rimT * c.depth * 0.28;
      }
    }

    // Smoothly flatten every monument pad, landed spacecraft apron, and rover spawn pad
    let padBlend = 1;
    for (const site of monumentSites) {
      const d = Math.hypot(x - site.x, z - site.z);
      padBlend *= clampNumber((d - 7.5) / 6.5, 0, 1);
    }
    const shipDist = Math.hypot(x - shipPad.x, z - shipPad.z);
    const shipBlend = clampNumber((shipDist - 8.5) / 6.5, 0, 1);
    const spawnDist = Math.hypot(x - roverSpawn.x, z - roverSpawn.z);
    const spawnBlend = clampNumber((spawnDist - 4.5) / 5.5, 0, 1);

    return h * padBlend * shipBlend * spawnBlend;
  };

  // Terrain mesh (covers all planetary zones comfortably with high-res relief & texture)
  const size = 300;
  const segments = 128;
  const terrainGeom = new PlaneGeometry(size, size, segments, segments);
  terrainGeom.rotateX(-Math.PI / 2);

  const posAttr = terrainGeom.attributes.position as BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cTmp = new Color();

  for (let i = 0; i < posAttr.count; i++) {
    const px = posAttr.getX(i);
    const pz = posAttr.getZ(i);
    const py = getHeight(px, pz);
    posAttr.setY(i, py);

    const elevT = clampNumber((py + 1.8) / 4.8, 0, 1);
    // Keep vertex tint balanced (0.76..0.96) so procedural regolith map + bump relief stay vivid
    const shade = 0.76 + elevT * 0.2;
    if (body === 'mars') {
      cTmp.setRGB(shade, shade * 0.92, shade * 0.86);
    } else {
      cTmp.setRGB(shade * 0.93, shade * 0.95, shade);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }

  terrainGeom.setAttribute('color', new Float32BufferAttribute(colors, 3));
  terrainGeom.computeVertexNormals();

  const regolithTex = createPlanetaryRegolithTexture(body, 28);
  const terrainMat = new MeshStandardMaterial({
    map: regolithTex ?? undefined,
    bumpMap: regolithTex ?? undefined,
    bumpScale: 0.18,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
    flatShading: false,
  });

  const terrainMesh = new Mesh(terrainGeom, terrainMat);
  terrainMesh.receiveShadow = true;
  root.add(terrainMesh);

  // Scattered textured boulders (InstancedMesh)
  const boulders: BoulderCollision[] = [];
  const rockGeom = new DodecahedronGeometry(1, 1);
  const rockMat = new MeshStandardMaterial({
    color: body === 'mars' ? 0x9a5943 : 0x909aa8,
    map: regolithTex ?? undefined,
    bumpMap: regolithTex ?? undefined,
    bumpScale: 0.1,
    roughness: 0.92,
    metalness: 0.05,
    flatShading: false,
  });

  const candidateCount = 110;
  const matrices: Matrix4[] = [];
  const dummy = new Object3D();

  for (let i = 0; i < candidateCount; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 10 + rand() * 124;
    const bx = Math.cos(angle) * dist;
    const bz = Math.sin(angle) * dist;

    if (isNearExclusion(bx, bz, 9.5, 7.5)) continue;

    const scaleXZ = 0.45 + rand() * 1.15;
    const scaleY = scaleXZ * (0.55 + rand() * 0.45);
    const by = getHeight(bx, bz) + scaleY * 0.32;

    dummy.position.set(bx, by, bz);
    dummy.rotation.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
    dummy.scale.set(scaleXZ, scaleY, scaleXZ * (0.75 + rand() * 0.5));
    dummy.updateMatrix();
    matrices.push(dummy.matrix.clone());

    boulders.push({ x: bx, z: bz, radius: scaleXZ + 0.45 });
  }

  if (matrices.length > 0) {
    const rockInstances = new InstancedMesh(rockGeom, rockMat, matrices.length);
    matrices.forEach((m, idx) => rockInstances.setMatrixAt(idx, m));
    rockInstances.instanceMatrix.needsUpdate = true;
    root.add(rockInstances);
  } else {
    rockGeom.dispose();
    rockMat.dispose();
  }

  // Wheel tracks ring buffer (paired left/right regolith prints sized to compact rover)
  const maxTrackMarks = 220;
  const trackGeom = new BoxGeometry(0.11, 0.025, 0.22);
  const trackMat = new MeshBasicMaterial({
    color: env.terrainLow.clone().multiplyScalar(0.75),
  });
  const trackMesh = new InstancedMesh(trackGeom, trackMat, maxTrackMarks * 2);
  const hideMatrix = new Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < maxTrackMarks * 2; i++) {
    trackMesh.setMatrixAt(i, hideMatrix);
  }
  trackMesh.instanceMatrix.needsUpdate = true;
  root.add(trackMesh);

  let trackCursor = 0;
  let lastTrackX = roverSpawn.x;
  let lastTrackZ = roverSpawn.z;
  const trackDummy = new Object3D();

  const stampWheelTracks = (
    x: number,
    z: number,
    yaw: number,
    heightAt: (px: number, pz: number) => number,
  ): void => {
    if (Math.hypot(x - lastTrackX, z - lastTrackZ) < 0.28) return;
    lastTrackX = x;
    lastTrackZ = z;

    const lateral = 0.84 * ROVER_SCALE;
    const rightX = Math.cos(yaw) * lateral;
    const rightZ = -Math.sin(yaw) * lateral;

    const lx = x - rightX;
    const lz = z - rightZ;
    trackDummy.position.set(lx, heightAt(lx, lz) + 0.02, lz);
    trackDummy.rotation.set(0, yaw, 0);
    trackDummy.scale.set(1, 1, 1);
    trackDummy.updateMatrix();
    trackMesh.setMatrixAt((trackCursor * 2) % (maxTrackMarks * 2), trackDummy.matrix);

    const rx = x + rightX;
    const rz = z + rightZ;
    trackDummy.position.set(rx, heightAt(rx, rz) + 0.02, rz);
    trackDummy.rotation.set(0, yaw, 0);
    trackDummy.updateMatrix();
    trackMesh.setMatrixAt((trackCursor * 2 + 1) % (maxTrackMarks * 2), trackDummy.matrix);

    trackMesh.instanceMatrix.needsUpdate = true;
    trackCursor++;
  };

  // Surface dust particles (wind drift on Mars + rover kick-up)
  const dustCount = reducedMotion ? 24 : 96;
  const dustPos = new Float32Array(dustCount * 3);
  const dustVel = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 45 + roverSpawn.x;
    dustPos[i * 3 + 1] = 0.4 + rand() * 4.5;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 45 + roverSpawn.z;
    dustVel[i * 3] = (rand() - 0.5) * (body === 'mars' ? 0.9 : 0.15);
    dustVel[i * 3 + 1] = 0.05 + rand() * 0.25;
    dustVel[i * 3 + 2] = (rand() - 0.5) * (body === 'mars' ? 0.9 : 0.15);
  }

  const dustGeom = new BufferGeometry();
  dustGeom.setAttribute('position', new BufferAttribute(dustPos, 3));
  const dustMat = new PointsMaterial({
    color: env.dustColor,
    size: body === 'mars' ? 0.24 : 0.16,
    transparent: true,
    opacity: body === 'mars' ? 0.45 : 0.3,
  });
  const dustPoints = new Points(dustGeom, dustMat);
  root.add(dustPoints);

  const updateDust = (
    dt: number,
    roverX: number,
    roverY: number,
    roverZ: number,
    speed: number,
  ): void => {
    if (reducedMotion) return;
    const pos = dustGeom.attributes.position as BufferAttribute;
    const activeKick = Math.abs(speed) > 0.2;
    for (let i = 0; i < dustCount; i++) {
      let x = pos.getX(i) + dustVel[i * 3] * dt;
      let y = pos.getY(i) + dustVel[i * 3 + 1] * dt;
      let z = pos.getZ(i) + dustVel[i * 3 + 2] * dt;

      if (Math.hypot(x - roverX, z - roverZ) > 28 || y > roverY + 6) {
        if (activeKick && i % 3 === 0) {
          x = roverX + (Math.random() - 0.5) * 2.2;
          y = roverY + 0.15;
          z = roverZ + (Math.random() - 0.5) * 2.2;
        } else {
          x = roverX + (Math.random() - 0.5) * 44;
          y = roverY + 0.2 + Math.random() * 2.2;
          z = roverZ + (Math.random() - 0.5) * 44;
        }
      }

      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  };

  return {
    root,
    spawnPosition: { x: roverSpawn.x, z: roverSpawn.z },
    boulders,
    getHeight,
    stampWheelTracks,
    updateDust,
  };
}

export function buildSurveyRover(tokens: TokenPalette): SurveyRoverRig {
  const root = new Group();
  root.name = 'unbranded-survey-rover';
  root.scale.setScalar(ROVER_SCALE);

  const chassisMat = new MeshStandardMaterial({
    color: tokens.roverChassis,
    roughness: 0.65,
    metalness: 0.35,
  });
  const deckMat = new MeshStandardMaterial({
    color: tokens.roverDeck,
    roughness: 0.55,
    metalness: 0.45,
  });
  const wheelMat = new MeshStandardMaterial({
    color: tokens.roverWheel,
    roughness: 0.88,
    metalness: 0.12,
  });
  const strutMat = new MeshStandardMaterial({
    color: tokens.metalMid,
    roughness: 0.6,
    metalness: 0.4,
  });

  // Main body hull (generic, strictly unbranded)
  const hull = new Mesh(new BoxGeometry(1.38, 0.58, 2.05), chassisMat);
  hull.position.y = 0.72;
  root.add(hull);

  // Top instrument deck & radiator fins
  const deck = new Mesh(new BoxGeometry(1.48, 0.1, 2.15), deckMat);
  deck.position.y = 1.04;
  root.add(deck);

  // Forward optical mast & stereo head
  const mast = new Mesh(new CylinderGeometry(0.06, 0.08, 0.85, 8), strutMat);
  mast.position.set(-0.28, 1.48, -0.68);
  root.add(mast);

  const head = new Mesh(new BoxGeometry(0.42, 0.18, 0.22), deckMat);
  head.position.set(-0.28, 1.92, -0.68);
  root.add(head);

  const lensMat = new MeshBasicMaterial({ color: tokens.turquoise });
  const eyeLeft = new Mesh(new CylinderGeometry(0.04, 0.04, 0.04, 8), lensMat);
  eyeLeft.rotation.x = Math.PI / 2;
  eyeLeft.position.set(-0.37, 1.92, -0.8);
  root.add(eyeLeft);

  const eyeRight = new Mesh(new CylinderGeometry(0.04, 0.04, 0.04, 8), lensMat);
  eyeRight.rotation.x = Math.PI / 2;
  eyeRight.position.set(-0.19, 1.92, -0.8);
  root.add(eyeRight);

  // Rear telemetry whip & turquoise beacon
  const whip = new Mesh(new CylinderGeometry(0.02, 0.025, 0.72, 6), strutMat);
  whip.position.set(0.42, 1.4, 0.82);
  root.add(whip);

  const mastBeaconMat = new MeshStandardMaterial({
    color: tokens.turquoise,
    emissive: tokens.turquoise,
    emissiveIntensity: 0.55,
  });
  const mastBeacon = new Mesh(new BoxGeometry(0.11, 0.11, 0.11), mastBeaconMat);
  mastBeacon.position.set(0.42, 1.78, 0.82);
  root.add(mastBeacon);

  // Rocker-bogie suspension beams & 6 wheels
  const beamLeft = new Mesh(new BoxGeometry(0.09, 0.09, 1.76), strutMat);
  beamLeft.position.set(-0.8, 0.52, 0);
  root.add(beamLeft);

  const beamRight = new Mesh(new BoxGeometry(0.09, 0.09, 1.76), strutMat);
  beamRight.position.set(0.8, 0.52, 0);
  root.add(beamRight);

  const wheelGeom = new CylinderGeometry(0.29, 0.29, 0.24, 12);
  wheelGeom.rotateZ(Math.PI / 2);

  const leftWheels: Mesh[] = [];
  const rightWheels: Mesh[] = [];
  const frontSteerPivots: Group[] = [];

  const zOffsets = [-0.88, 0, 0.88];
  for (const z of zOffsets) {
    for (const side of [-1, 1]) {
      const pivot = new Group();
      pivot.position.set(side * 0.92, 0.29, z);

      const wheel = new Mesh(wheelGeom, wheelMat);
      pivot.add(wheel);
      root.add(pivot);

      if (side < 0) leftWheels.push(wheel);
      else rightWheels.push(wheel);

      if (z < 0) frontSteerPivots.push(pivot);
    }
  }

  return {
    root,
    leftWheels,
    rightWheels,
    frontSteerPivots,
    mastBeacon,
  };
}
