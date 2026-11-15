import {
  BackSide,
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DodecahedronGeometry,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { createDracoGltfLoader, loadNormalizedGlbIntoGroup } from '../glb-assets';
import type { ExpeditionInput } from '../input';
import { getBodyEnvironmentPalette, type TokenPalette } from '../palette';
import { createPlanetaryRegolithTexture } from '../textures';
import type { ExpeditionArtifact } from '../types';
import { clampNumber, createPrng, disposeObjectTree, hashStringSeed } from '../utils';
import type { SceneController } from './transit';

interface DustParticle {
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

function createSurfaceDustSystem(scene: Scene, dustColor: Color, count = 72) {
  const positions = new Float32Array(count * 3);
  const meta: DustParticle[] = [];
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 1] = -30;
    meta.push({ vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.8 });
  }
  const geo = new BufferGeometry();
  const attr = new BufferAttribute(positions, 3);
  geo.setAttribute('position', attr);
  const mat = new PointsMaterial({
    color: dustColor,
    size: 0.34,
    transparent: true,
    opacity: 0.55,
  });
  const points = new Points(geo, mat);
  scene.add(points);

  let cursor = 0;

  function emitOne(originX: number, speedMult: number) {
    const p = meta[cursor];
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.35 + Math.random() * 0.7;
    const radialSpeed = (1.8 + Math.random() * 4.2) * speedMult;
    positions[cursor * 3 + 0] = originX + Math.cos(ang) * rad;
    positions[cursor * 3 + 1] = 0.08 + Math.random() * 0.16;
    positions[cursor * 3 + 2] = Math.sin(ang) * rad;
    p.vx = Math.cos(ang) * radialSpeed;
    p.vy = (0.45 + Math.random() * 1.45) * speedMult;
    p.vz = Math.sin(ang) * radialSpeed * 0.65;
    p.life = 0.45 + Math.random() * 0.55;
    p.maxLife = p.life;
    cursor = (cursor + 1) % count;
  }

  return {
    reset() {
      for (let i = 0; i < count; i++) {
        meta[i].life = 0;
        positions[i * 3 + 1] = -30;
      }
      attr.needsUpdate = true;
    },
    burst(originX: number, speedMult = 1.15) {
      for (let i = 0; i < 34; i++) emitOne(originX, speedMult);
      attr.needsUpdate = true;
    },
    update(dt: number, originX: number, intensity: number) {
      if (intensity > 0.05) {
        const spawns = Math.floor(intensity * 5) + (Math.random() < intensity * 0.7 ? 1 : 0);
        for (let i = 0; i < spawns; i++) {
          emitOne(originX, 0.7 + intensity * 0.7);
        }
      }
      let dirty = intensity > 0.05;
      for (let i = 0; i < count; i++) {
        const p = meta[i];
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) {
          positions[i * 3 + 1] = -30;
        } else {
          positions[i * 3 + 0] += p.vx * dt;
          positions[i * 3 + 1] = Math.max(0.04, positions[i * 3 + 1] + p.vy * dt);
          positions[i * 3 + 2] += p.vz * dt;
          p.vx *= 1 - 1.6 * dt;
          p.vz *= 1 - 1.6 * dt;
          p.vy -= 1.3 * dt;
        }
        dirty = true;
      }
      if (dirty) attr.needsUpdate = true;
    },
  };
}

function buildFallbackLander(tokens: TokenPalette, flameColor: number): { root: Group; flame: Mesh } {
  const root = new Group();
  const hullMat = new MeshStandardMaterial({
    color: tokens.metalLight,
    roughness: 0.52,
    metalness: 0.42,
  });
  const darkMat = new MeshStandardMaterial({
    color: tokens.metalDark,
    roughness: 0.78,
    metalness: 0.25,
  });

  const body = new Mesh(new CylinderGeometry(0.55, 0.88, 1.35, 10), hullMat);
  root.add(body);

  const nose = new Mesh(new ConeGeometry(0.56, 0.65, 10), darkMat);
  nose.position.y = 0.98;
  root.add(nose);

  const legOffsets: Array<[number, number]> = [
    [-0.78, -0.78],
    [0.78, -0.78],
    [-0.78, 0.78],
    [0.78, 0.78],
  ];
  for (const [lx, lz] of legOffsets) {
    const leg = new Mesh(new CylinderGeometry(0.06, 0.09, 0.95, 6), darkMat);
    leg.position.set(lx * 0.78, -0.62, lz * 0.78);
    leg.rotation.z = lx > 0 ? -0.35 : 0.35;
    leg.rotation.x = lz > 0 ? 0.35 : -0.35;
    root.add(leg);
  }

  root.scale.setScalar(1.65);

  const flame = new Mesh(
    new ConeGeometry(0.55, 1.75, 12),
    new MeshBasicMaterial({ color: flameColor, transparent: true, opacity: 0.88 }),
  );
  flame.rotation.x = Math.PI;
  flame.position.y = -1.95;
  flame.visible = false;

  return { root, flame };
}

function buildLandingStageEnvironment(
  artifact: ExpeditionArtifact,
  tokens: TokenPalette,
  isDisposed: () => boolean,
) {
  const env = getBodyEnvironmentPalette(artifact.body, tokens);
  const isMars = artifact.body === 'mars';
  const scene = new Scene();
  scene.background = isMars ? new Color('#7D3D23') : env.skyColor.clone();
  if (isMars) {
    scene.fog = new FogExp2(0x8b462a, 0.0082);
  }

  const glbHandle = createDracoGltfLoader();

  if (isMars) {
    scene.add(new HemisphereLight(0xe0a880, 0x4e2414, 1.25));
    const sun = new DirectionalLight(0xe6d8c8, 2.0);
    sun.position.set(28, 42, 24);
    scene.add(sun);
  } else {
    scene.add(new HemisphereLight(env.ambientColor, env.hemiGroundColor, env.ambientIntensity + 0.3));
    const sun = new DirectionalLight(env.sunColor, env.sunIntensity + 0.65);
    sun.position.set(28, 38, 24);
    scene.add(sun);
  }

  const rand = createPrng(hashStringSeed(`${artifact.id}-landing`));

  // Starfield on the airless Moon and distant Earth visible in either sky
  if (!isMars) {
    const starCount = 1200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const th = rand() * Math.PI * 2;
      const ph = rand() * Math.PI * 0.47;
      const r = 240 + rand() * 140;
      starPos[i * 3 + 0] = Math.cos(th) * Math.sin(ph) * r;
      starPos[i * 3 + 1] = 8 + Math.cos(ph) * r * 0.7;
      starPos[i * 3 + 2] = -Math.abs(Math.sin(th)) * r * 0.8 - 40;
    }
    const sGeo = new BufferGeometry();
    sGeo.setAttribute('position', new BufferAttribute(starPos, 3));
    scene.add(
      new Points(
        sGeo,
        new PointsMaterial({ color: tokens.starPrimary, size: 1.35, transparent: true, opacity: 0.88 }),
      ),
    );
  }

  // Distant Earth visible above horizon
  const earthrise = new Group();
  earthrise.position.set(isMars ? 54 : -46, isMars ? 34 : 26, -185);
  scene.add(earthrise);

  const earthFallback = new Mesh(
    new SphereGeometry(isMars ? 6.5 : 8.5, 24, 24),
    new MeshBasicMaterial({ color: 0x5aa6f5, fog: false }),
  );
  earthrise.add(earthFallback);
  earthrise.add(
    new Mesh(
      new SphereGeometry(isMars ? 8.2 : 10.6, 24, 24),
      new MeshBasicMaterial({
        color: 0x4ea8ff,
        transparent: true,
        opacity: 0.2,
        side: BackSide,
        fog: false,
      }),
    ),
  );
  loadNormalizedGlbIntoGroup(glbHandle.loader, '/assets/games/earth.glb', earthrise, {
    targetSize: isMars ? 13 : 17,
    fallbackToRemove: earthFallback,
    filterNonMappedMeshes: true,
    isDisposed,
  });

  // Procedural craters and horizon basin hills matching the original landing zones
  const craters: Array<{ x: number; z: number; radius: number; depth: number }> = [];
  const craterCount = isMars ? 18 : 28;
  for (let i = 0; i < craterCount; i++) {
    const cx = (rand() - 0.5) * 150;
    const cz = (rand() - 0.5) * 140;
    if (Math.abs(cz) < 5.5 && Math.abs(cx) < 24) continue;
    craters.push({
      x: cx,
      z: cz,
      radius: 3.5 + rand() * 9.5,
      depth: 0.65 + rand() * 1.55,
    });
  }

  const heightAt = (x: number, z: number): number => {
    let h =
      Math.sin(x * 0.055) * Math.cos(z * 0.05) * (isMars ? 0.55 : 0.75) +
      Math.sin((x + z) * 0.12) * 0.24;

    if (z < -26) {
      const distBack = Math.min(1, (-z - 26) / 68);
      h += distBack * distBack * (6.2 + Math.sin(x * 0.08 + 1.1) * 3.6 + Math.cos(x * 0.17) * 1.6);
    }

    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.radius * 1.35) continue;
      const t = d / c.radius;
      if (t < 1) {
        h -= c.depth * (1 - t * t);
      } else {
        const rimT = (t - 1) / 0.35;
        h += c.depth * 0.24 * Math.sin(rimT * Math.PI);
      }
    }

    const corridorX = clampNumber((Math.abs(x) - 15) / 8, 0, 1);
    const corridorZ = clampNumber((Math.abs(z) - 2.6) / 5.5, 0, 1);
    return h * Math.max(corridorX, corridorZ);
  };

  // High-detail regolith texture + sculpted relief ground plane
  const regolithTex = createPlanetaryRegolithTexture(artifact.body, isMars ? 42 : 18);
  const groundGeo = new PlaneGeometry(480, 420, 136, 128);
  groundGeo.rotateX(-Math.PI / 2);
  const posAttr = groundGeo.attributes.position;
  const cols = new Float32Array(posAttr.count * 3);
  const cTmp = new Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    const h = heightAt(x, z);
    posAttr.setY(i, h);

    // Keep vertex brightness near 0.78-0.96 so texture detail remains vivid
    const shade = clampNumber(0.84 + h * 0.032 + (rand() - 0.5) * 0.06, 0.72, 0.96);
    if (isMars) {
      cTmp.setRGB(shade, shade * 0.92, shade * 0.86);
    } else {
      cTmp.setRGB(shade * 0.93, shade * 0.95, shade);
    }
    cols[i * 3 + 0] = cTmp.r;
    cols[i * 3 + 1] = cTmp.g;
    cols[i * 3 + 2] = cTmp.b;
  }
  groundGeo.setAttribute('color', new BufferAttribute(cols, 3));
  groundGeo.computeVertexNormals();

  const ground = new Mesh(
    groundGeo,
    new MeshStandardMaterial({
      map: regolithTex ?? undefined,
      bumpMap: regolithTex ?? undefined,
      bumpScale: 0.16,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.03,
      flatShading: false,
    }),
  );
  scene.add(ground);

  // Scattered basaltic / iron-oxide surface boulders
  const rockGeo = new DodecahedronGeometry(0.55, 1);
  const rockMat = new MeshStandardMaterial({
    color: isMars ? 0x9b5a44 : 0x8f99a8,
    map: regolithTex ?? undefined,
    bumpMap: regolithTex ?? undefined,
    bumpScale: 0.08,
    roughness: 0.94,
    metalness: 0.04,
  });
  const rockMatrices: Matrix4[] = [];
  const rockDummy = new Object3D();
  for (let i = 0; i < 36; i++) {
    const rx = (rand() - 0.5) * 95;
    const rz = (rand() - 0.5) * 80;
    if (Math.abs(rz) < 3.8 && Math.abs(rx) < 20) continue;
    const ry = heightAt(rx, rz);
    const sx = 0.55 + rand() * 1.4;
    const sy = 0.35 + rand() * 0.95;
    const sz = 0.55 + rand() * 1.3;
    rockDummy.position.set(rx, ry + sy * 0.25, rz);
    rockDummy.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rockDummy.scale.set(sx, sy, sz);
    rockDummy.updateMatrix();
    rockMatrices.push(rockDummy.matrix.clone());
  }
  if (rockMatrices.length > 0) {
    const rocks = new InstancedMesh(rockGeo, rockMat, rockMatrices.length);
    rockMatrices.forEach((m, idx) => rocks.setMatrixAt(idx, m));
    rocks.instanceMatrix.needsUpdate = true;
    scene.add(rocks);
  } else {
    rockGeo.dispose();
    rockMat.dispose();
  }

  // Original Game 3 Martian terrain GLB surrounding the Mars landing zone
  if (isMars) {
    const marsTerrainGroup = new Group();
    marsTerrainGroup.position.set(0, 0, -6);
    scene.add(marsTerrainGroup);
    loadNormalizedGlbIntoGroup(glbHandle.loader, '/assets/games/perseverance_rover_on_mars.glb', marsTerrainGroup, {
      targetSize: 95,
      doubleSide: true,
      isDisposed,
      onLoaded(model) {
        const finalBox = new Box3().setFromObject(model);
        model.position.y += 1.25 - finalBox.max.y;
      },
    });
  }

  // Landing apron & beacon ring matching original pad proportions
  const padColorHex = isMars ? 0x00ffcc : 0x2ec4b6;
  const padGroup = new Group();
  scene.add(padGroup);

  const apron = new Mesh(
    new CylinderGeometry(3.2, 3.6, 0.24, 32),
    new MeshStandardMaterial({ color: tokens.slate, roughness: 0.7, metalness: 0.25 }),
  );
  apron.position.y = 0.12;
  padGroup.add(apron);

  const ringMat = new MeshBasicMaterial({ color: padColorHex });
  const padRing = new Mesh(new TorusGeometry(2.95, 0.12, 10, 48), ringMat);
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.26;
  padGroup.add(padRing);

  const beaconMat = new MeshBasicMaterial({
    color: padColorHex,
    transparent: true,
    opacity: 0.44,
    side: 2,
  });
  const beaconRing = new Mesh(new RingGeometry(4.2, 4.8, 36), beaconMat);
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.06;
  padGroup.add(beaconRing);

  // Controllable lander (crisp scale matching original high-altitude landing corridor)
  const lander = new Group();
  const flameHex = isMars ? 0xff9f1c : 0x2ec4b6;
  const fallback = buildFallbackLander(tokens, flameHex);
  lander.add(fallback.root);
  lander.add(fallback.flame);
  scene.add(lander);

  const engineGlow = new PointLight(flameHex, 0, 18, 1.5);
  scene.add(engineGlow);

  loadNormalizedGlbIntoGroup(glbHandle.loader, '/assets/games/spaceship.glb', lander, {
    targetSize: 3.8,
    fallbackToRemove: fallback.root,
    doubleSide: true,
    isDisposed,
  });

  const dust = createSurfaceDustSystem(scene, env.dustColor);

  return {
    env,
    isMars,
    scene,
    glbHandle,
    padGroup,
    ringMat,
    beaconMat,
    beaconRing,
    lander,
    flame: fallback.flame,
    engineGlow,
    dust,
  };
}

export function createDescentScene(
  artifact: ExpeditionArtifact,
  tokens: TokenPalette,
  reducedMotion: boolean,
): SceneController {
  let disposed = false;
  const stage = buildLandingStageEnvironment(artifact, tokens, () => disposed);
  const { isMars, scene, glbHandle, padGroup, ringMat, beaconMat, beaconRing, lander, flame, engineGlow, dust } =
    stage;

  // Real physical constants matching Game 3 Mars / Moon specs
  const gravity = isMars ? -3.72 : -1.62;
  const thrustAcc = isMars ? 9.8 : 5.1;
  const lateralAcc = isMars ? 3.5 : 2.8;
  const safeVertical = isMars ? 3.1 : 2.6;
  const safeLateral = isMars ? 2.5 : 2.1;
  const halfHeight = 1.9;
  const halfPad = 3.6;

  let estado: 'flying' | 'landed' | 'offpad' | 'crashed' = 'flying';
  let autoland = reducedMotion;
  let posX = 0;
  let posY = 36.75;
  let velX = 0;
  let velY = -0.6;
  let fuel = 100;
  let elapsed = 0;
  let crashShake = 0;
  let impactReason = '';
  const rand = createPrng(hashStringSeed(`${artifact.id}-pad`));

  function resetDescent() {
    let px = (rand() - 0.5) * 16;
    if (Math.abs(px) < 3.5) px = (px >= 0 ? 1 : -1) * 5.2;
    padGroup.position.x = px;

    posX = 0;
    // 1.5x starting descent altitude over baseline 24.5m -> 36.75m
    posY = 36.75;
    velX = 0;
    velY = -0.6;
    fuel = 100;
    estado = 'flying';
    crashShake = 0;
    impactReason = '';
    autoland = reducedMotion;
    ringMat.color.setHex(isMars ? 0x00ffcc : 0x2ec4b6);
    beaconMat.color.setHex(isMars ? 0x00ffcc : 0x2ec4b6);
    lander.rotation.z = 0;
    dust.reset();
  }

  resetDescent();

  return {
    scene,

    toggleAutoPilot(): boolean {
      if (estado !== 'flying') return autoland;
      autoland = !autoland;
      return autoland;
    },

    isAutoPilotEngaged(): boolean {
      return autoland;
    },

    isCrashed(): boolean {
      return estado === 'crashed';
    },

    getLandingState() {
      return estado;
    },

    getImpactInfo(): string {
      return impactReason;
    },

    retry(): void {
      resetDescent();
    },

    update(
      dt: number,
      camera: PerspectiveCamera,
      orbitYaw: number,
      orbitPitch: number,
      input: ExpeditionInput,
    ): boolean {
      elapsed += dt;
      let engineFiring = false;

      if (estado === 'flying') {
        let accY = gravity;
        let accX = 0;

        const manualThrust =
          input.isKeyDown('Space') ||
          input.isKeyDown('KeyW') ||
          input.isKeyDown('ArrowUp') ||
          input.throttle > 0.35;
        const manualLeft = input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft') || input.steer < -0.25;
        const manualRight = input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight') || input.steer > 0.25;

        // Manual inputs gently take priority, or Auto-Land [G] guides to a soft touchdown
        if (manualThrust && fuel > 0) {
          accY += thrustAcc;
          fuel -= (isMars ? 8.5 : 7.0) * dt;
          engineFiring = true;
        } else if (autoland) {
          const altitude = Math.max(0, posY - halfHeight);
          const dx = padGroup.position.x - posX;
          const desiredVx = clampNumber(dx * 0.9, -4.5, 4.5);
          accX = clampNumber((desiredVx - velX) * 3.0, -lateralAcc, lateralAcc);
          const desiredVy =
            altitude > 16 ? -3.4 : altitude > 6 ? -2.2 : altitude > 2 ? -1.45 : -0.95;
          if (velY < desiredVy) {
            accY += thrustAcc;
            engineFiring = true;
          }
        }

        if ((manualLeft || manualRight) && fuel > 0) {
          accX = manualLeft ? -lateralAcc : lateralAcc;
          fuel -= 3.2 * dt;
        }
        fuel = Math.max(0, fuel);

        velX = (velX + accX * dt) * (1 - 0.05 * dt);
        velY = (velY + accY * dt) * (1 - 0.02 * dt);
        posX = clampNumber(posX + velX * dt, -20, 20);
        posY = clampNumber(posY + velY * dt, halfHeight, 40);

        if (posY <= halfHeight) {
          posY = halfHeight;
          const vImp = Math.abs(velY);
          const hImp = Math.abs(velX);
          const onPad = Math.abs(posX - padGroup.position.x) <= halfPad;
          velX = 0;
          velY = 0;

          if (vImp > safeVertical) {
            estado = 'crashed';
            impactReason = `VERTICAL ${vImp.toFixed(1)} M/S > ${safeVertical.toFixed(1)}`;
            ringMat.color.setHex(0xe71d36);
            beaconMat.color.setHex(0xe71d36);
            crashShake = 0.45;
            dust.burst(posX, 1.55);
          } else if (hImp > safeLateral) {
            estado = 'crashed';
            impactReason = `LATERAL ${hImp.toFixed(1)} M/S > ${safeLateral.toFixed(1)}`;
            ringMat.color.setHex(0xe71d36);
            beaconMat.color.setHex(0xe71d36);
            crashShake = 0.45;
            dust.burst(posX, 1.4);
          } else if (!onPad) {
            estado = 'offpad';
            ringMat.color.setHex(0xff9f1c);
            beaconMat.color.setHex(0xff9f1c);
            dust.burst(posX, 1.0);
          } else {
            estado = 'landed';
            ringMat.color.setHex(0x44ff66);
            beaconMat.color.setHex(0x44ff66);
            dust.burst(posX, 0.85);
          }
        }
      }

      lander.position.set(posX, posY, 0);
      lander.rotation.z = estado === 'flying' ? -velX * 0.06 : 0;

      flame.visible = engineFiring;
      if (engineFiring) {
        flame.scale.set(1, 0.85 + Math.random() * 0.4, 1);
        engineGlow.position.set(posX, Math.max(0.4, posY - 0.8), 0);
        engineGlow.intensity = 2.2 + Math.random() * 0.6;
      } else {
        engineGlow.intensity = Math.max(0, engineGlow.intensity - 10 * dt);
      }

      const alt = Math.max(0, posY - halfHeight);
      const dustIntensity = engineFiring && alt < 7.2 ? clampNumber(1 - alt / 7.2, 0.12, 1) : 0;
      dust.update(dt, posX, dustIntensity);
      beaconRing.scale.setScalar(estado === 'flying' ? 1 + Math.sin(elapsed * 3.6) * 0.045 : 1);

      if (crashShake > 0) crashShake = Math.max(0, crashShake - dt * 1.4);

      const yawOff = clampNumber(orbitYaw, -0.45, 0.45);
      const pitchOff = clampNumber(orbitPitch, -0.15, 0.35);
      const camX = posX * 0.28 + Math.sin(yawOff) * 6.5;
      const camY = 12.0 + Math.max(0, alt - 5) * 0.38 + pitchOff * 3.0;
      const camZ = 34.5;
      camera.position.set(
        camX + (crashShake > 0 ? (Math.random() - 0.5) * crashShake * 0.8 : 0),
        camY + (crashShake > 0 ? (Math.random() - 0.5) * crashShake * 0.8 : 0),
        camZ,
      );
      camera.lookAt(posX * 0.25, 7.4 + Math.max(0, alt - 5) * 0.34, 0);

      return false;
    },

    getHudStatus(): string {
      const alt = Math.max(0, posY - halfHeight);
      if (estado === 'landed') {
        return `TOUCHDOWN ON PAD · [E] EXPLORE SURFACE (ROVER) · [L] LAUNCH TO ORBIT · [R] RETRY`;
      }
      if (estado === 'offpad') {
        return `SAFE TOUCHDOWN OFF-PAD · [E] EXPLORE SURFACE (ROVER) · [L] LAUNCH TO ORBIT · [R] RETRY`;
      }
      if (estado === 'crashed') {
        return `HARD IMPACT (${impactReason}) · [R] RETRY · [L] ORBIT · [E / ENTER] DEPLOY ROVER`;
      }
      const fall = Math.max(0, -velY);
      const gStr = isMars ? '3.72' : '1.62';
      const autoStr = autoland ? ' · AUTO-LAND' : '';
      return `G=${gStr} M/S2 · ALT ${alt.toFixed(1)}M · V-SPD ${fall.toFixed(1)}/${safeVertical.toFixed(1)} · FUEL ${Math.round(fuel)}%${autoStr} · [SPACE/W] ENGINE · [A/D] LAT · [G] AUTO`;
    },

    dispose() {
      disposed = true;
      glbHandle.dispose();
      disposeObjectTree(scene);
    },
  };
}

export function createAscentScene(
  artifact: ExpeditionArtifact,
  tokens: TokenPalette,
  reducedMotion: boolean,
): SceneController {
  let disposed = false;
  const stage = buildLandingStageEnvironment(artifact, tokens, () => disposed);
  const { isMars, scene, glbHandle, ringMat, beaconMat, lander, flame, engineGlow, dust } = stage;

  const gravity = isMars ? -3.72 : -1.62;
  const ascentAcc = Math.abs(gravity) * 2.5 + 7.0;

  let posY = 1.9;
  let velY = 0;
  let elapsed = 0;

  ringMat.color.setHex(0x2ec4b6);
  beaconMat.color.setHex(0x2ec4b6);
  dust.burst(0, 2.2);

  return {
    scene,

    update(
      dt: number,
      camera: PerspectiveCamera,
      orbitYaw: number,
      orbitPitch: number,
    ): boolean {
      elapsed += dt;
      velY += (gravity + ascentAcc) * dt;
      posY += velY * dt;

      lander.position.set(0, posY, 0);
      flame.visible = true;
      flame.scale.set(1.22, 1.4 + Math.random() * 0.65, 1.22);

      engineGlow.position.set(0, Math.max(0.6, posY - 2.0), 0);
      engineGlow.intensity = 3.2 + Math.random() * 0.7;

      const alt = Math.max(0, posY - 1.9);
      dust.update(dt, 0, alt < 11 ? clampNumber(1 - alt / 11, 0.15, 1) : 0);

      const yawOff = clampNumber(orbitYaw, -0.45, 0.45);
      const pitchOff = clampNumber(orbitPitch, -0.15, 0.35);
      camera.position.set(
        Math.sin(yawOff) * 6.5,
        11.0 + Math.max(0, posY - 6) * 0.48 + pitchOff * 2.5,
        34 + Math.max(0, posY - 10) * 0.32,
      );
      camera.lookAt(0, 6.8 + Math.max(0, posY - 6) * 0.65, 0);

      const targetDur = reducedMotion ? 0.65 : 2.6;
      return posY > 46 || elapsed >= targetDur;
    },

    getHudStatus(): string {
      return `LIFTOFF FROM ${artifact.body.toUpperCase()} // ASCENDING TO INTERPLANETARY ORBIT...`;
    },

    dispose() {
      disposed = true;
      glbHandle.dispose();
      disposeObjectTree(scene);
    },
  };
}
