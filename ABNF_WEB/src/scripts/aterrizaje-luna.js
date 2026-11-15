import * as THREE from 'three';
import { buildDistantEarth, launchLandingMission } from './landing-core';

function createPrng(seed = 19690720) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createLunarRegolithTexture() {
  const rand = createPrng(19670417);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#6c7482';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 6000; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const r = rand() * 3.2 + 0.6;
    ctx.fillStyle =
      rand() > 0.45 ? 'rgba(54, 60, 72, 0.28)' : 'rgba(155, 165, 180, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 55; i++) {
    const x = rand() * 512;
    const y = rand() * 512;
    const radius = 6 + rand() * 18;
    const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
    grad.addColorStop(0, 'rgba(42, 47, 56, 0.34)');
    grad.addColorStop(0.75, 'rgba(130, 140, 156, 0.16)');
    grad.addColorStop(1, 'rgba(108, 116, 130, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createLunarStarfield(scene) {
  const rand = createPrng(19710726);
  const count = 1600;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const phi = rand() * Math.PI * 0.48; // Upper hemisphere above lunar ridges
    const r = 340 + rand() * 160;
    pos[i * 3 + 0] = Math.cos(theta) * Math.sin(phi) * r * 1.4;
    pos[i * 3 + 1] = 12 + Math.cos(phi) * r * 0.75;
    pos[i * 3 + 2] = -Math.abs(Math.sin(theta)) * r * 0.9 - 60;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xd4def0,
    size: 1.45,
    transparent: true,
    opacity: 0.88,
    sizeAttenuation: true,
  });
  scene.add(new THREE.Points(geo, mat));
}

function buildLunarSurface(scene) {
  const rand = createPrng(19690720);
  const craters = [];
  for (let i = 0; i < 28; i++) {
    const x = (rand() - 0.5) * 140;
    const z = (rand() - 0.5) * 130;
    // Keep landing corridor clear of craters
    if (Math.abs(z) < 4.5 && Math.abs(x) < 22) continue;
    craters.push({
      x,
      z,
      radius: 3.5 + rand() * 9.5,
      depth: 0.65 + rand() * 1.6,
    });
  }

  const heightAt = (x, z) => {
    let h =
      Math.sin(x * 0.055) * Math.cos(z * 0.05) * 0.75 +
      Math.sin((x + z) * 0.12) * 0.25;

    // Distant Mare basin mountains framing Earthrise on the back horizon
    if (z < -26) {
      const distBack = Math.min(1, (-z - 26) / 68);
      h += distBack * distBack * (6.5 + Math.sin(x * 0.08 + 1.1) * 3.8 + Math.cos(x * 0.17) * 1.8);
    }

    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.radius * 1.35) continue;
      const t = d / c.radius;
      if (t < 1) {
        h -= c.depth * (1 - t * t);
      } else {
        const rimT = (t - 1) / 0.35;
        h += c.depth * 0.22 * Math.sin(rimT * Math.PI);
      }
    }

    // Smoothly flatten landing corridor around x in [-16, 16], z in [-2.6, 2.6]
    const corridorX = THREE.MathUtils.clamp((Math.abs(x) - 15) / 8, 0, 1);
    const corridorZ = THREE.MathUtils.clamp((Math.abs(z) - 2.2) / 5, 0, 1);
    const blend = Math.max(corridorX, corridorZ);
    return h * blend;
  };

  const geo = new THREE.PlaneGeometry(240, 220, 136, 128);
  geo.rotateX(-Math.PI / 2);
  const posAttr = geo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    posAttr.setY(i, heightAt(vx, vz));
  }
  geo.computeVertexNormals();

  const surface = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      map: createLunarRegolithTexture(),
      roughness: 0.96,
      metalness: 0.02,
    })
  );
  surface.receiveShadow = true;
  scene.add(surface);

  // Scattered angular basaltic boulders resting on crater rims and plains
  const rockGeo = new THREE.DodecahedronGeometry(0.55, 0);
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x5c6472,
    roughness: 0.95,
    metalness: 0.04,
  });
  for (let i = 0; i < 36; i++) {
    const rx = (rand() - 0.5) * 90;
    const rz = (rand() - 0.5) * 76;
    if (Math.abs(rz) < 3.4) continue;
    const ry = heightAt(rx, rz);
    const rock = new THREE.Mesh(rockGeo, rockMat);
    const sx = 0.5 + rand() * 1.4;
    const sy = 0.35 + rand() * 0.9;
    const sz = 0.5 + rand() * 1.3;
    rock.scale.set(sx, sy, sz);
    rock.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    rock.position.set(rx, ry + sy * 0.25, rz);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
  }
}

/**
 * Radial regolith dust spray particle system triggered when the thruster plume
 * impinges on low-altitude lunar dust or during touchdown.
 */
function createRegolithDustSystem(scene, count = 110) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const life = new Float32Array(count);

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute('position', posAttr);

  const mat = new THREE.PointsMaterial({
    color: 0x9aa4b4,
    size: 0.22,
    transparent: true,
    opacity: 0.55,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function spawnParticle(idx, originX, strength) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (1.6 + Math.random() * 4.4) * strength;
    positions[idx * 3 + 0] = originX + (Math.random() - 0.5) * 0.55;
    positions[idx * 3 + 1] = 0.08 + Math.random() * 0.14;
    positions[idx * 3 + 2] = (Math.random() - 0.5) * 0.65;

    velocities[idx * 3 + 0] = Math.cos(angle) * speed;
    velocities[idx * 3 + 1] = (0.35 + Math.random() * 1.15) * strength;
    velocities[idx * 3 + 2] = Math.sin(angle) * speed;
    life[idx] = 0.35 + Math.random() * 0.65;
  }

  function reset() {
    for (let i = 0; i < count; i++) {
      life[i] = 0;
      positions[i * 3 + 1] = -20;
    }
    posAttr.needsUpdate = true;
  }

  function burst(originX, strength, fraction = 0.7) {
    let spawned = 0;
    const limit = Math.floor(count * fraction);
    for (let i = 0; i < count && spawned < limit; i++) {
      spawnParticle(i, originX, strength);
      spawned += 1;
    }
    posAttr.needsUpdate = true;
  }

  function update(dt, originX, activeIntensity) {
    let budget = activeIntensity > 0 ? Math.ceil(activeIntensity * 6) : 0;
    let changed = false;

    for (let i = 0; i < count; i++) {
      if (life[i] > 0) {
        life[i] -= dt;
        velocities[i * 3 + 1] -= 1.62 * dt; // Lunar gravity arc
        positions[i * 3 + 0] += velocities[i * 3 + 0] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;

        if (positions[i * 3 + 1] < 0.05) {
          positions[i * 3 + 1] = 0.05;
          velocities[i * 3 + 0] *= 0.85;
          velocities[i * 3 + 2] *= 0.85;
          velocities[i * 3 + 1] = 0;
        }
        changed = true;
      } else if (budget > 0) {
        spawnParticle(i, originX, 0.55 + activeIntensity * 0.75);
        budget -= 1;
        changed = true;
      } else if (positions[i * 3 + 1] > -10) {
        positions[i * 3 + 1] = -20;
        changed = true;
      }
    }

    if (changed) posAttr.needsUpdate = true;
  }

  reset();
  return { reset, burst, update };
}

launchLandingMission({
  skyColor: 0x090d16,
  fogDensity: 0,
  cameraPos: [0, 12.5, 27],
  cameraLookAt: [0, 8, 0],
  padDefaultColor: 0x2ec4b6,
  flameColor: 0x2ec4b6,
  orbitReturnRoute: '/vuelo?from=moon',
  exploreRoute: '/?explore=moon#expedition',
  ascentFlashGradient: 'radial-gradient(circle, rgba(46, 196, 182, 0.55), #090d16 78%)',
  physics: {
    gravity: -1.62,
    thrust: 4.9,
    lateralThrust: 2.6,
    safeVerticalSpeed: 2.2,
    safeLateralSpeed: 1.8,
    fuelMax: 100,
    fuelBurn: 16,
    lateralFuelBurn: 7,
    startY: 16.5,
    ceiling: 26,
    limitX: 22,
    tiltFactor: 0.08,
  },
  copy: {
    gravityTitle: 'Lunar gravity: 1.62 m/s&sup2;',
    landedTitle: 'SOFT LANDING ON THE MOON',
    landedBody:
      'Touchdown confirmed on the lunar pad. Press <b>[ L ]</b> to launch back to orbit (fly to Mars), or <b>[ R ]</b> to land again.',
    offPadTitle: 'OFF THE LANDING PAD',
    offPadBody:
      'You touched down outside the pad. Press <b>[ L ]</b> for orbit or <b>[ R ]</b> to retry.',
    crashTitle: 'HARD IMPACT',
  },
  buildEnvironment({ scene, loader, padGroup, halfPadWidth }) {
    // Low-angle harsh unfiltered solar light + subtle gray regolith bounce
    scene.add(new THREE.HemisphereLight(0x4b586e, 0x1b202a, 0.52));
    const sol = new THREE.DirectionalLight(0xe6ecf5, 2.75);
    sol.position.set(34, 24, 20);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.left = -36;
    sol.shadow.camera.right = 36;
    sol.shadow.camera.top = 36;
    sol.shadow.camera.bottom = -36;
    sol.shadow.camera.near = 2;
    sol.shadow.camera.far = 110;
    sol.shadow.normalBias = 0.03;
    sol.shadow.bias = -0.0004;
    scene.add(sol);

    createLunarStarfield(scene);

    // Prominent Earthrise above the lunar highland horizon
    const earthrise = buildDistantEarth(scene, loader, {
      pos: [-52, 28, -200],
      fallbackRadius: 9,
      scaleDiameter: 18,
      haloRadius: 11.4,
      haloColor: 0x4ea8ff,
      haloOpacity: 0.22,
    });

    buildLunarSurface(scene);

    // Subtle ground beacon ring + corner approach pylons anchored cleanly on padGroup
    const beaconRing = new THREE.Mesh(
      new THREE.RingGeometry(halfPadWidth * 1.4, halfPadWidth * 1.56, 36),
      new THREE.MeshBasicMaterial({
        color: 0x2ec4b6,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      })
    );
    beaconRing.rotation.x = -Math.PI / 2;
    beaconRing.position.y = -0.04;
    padGroup.add(beaconRing);

    const pylonGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.42, 8);
    const pylonMat = new THREE.MeshBasicMaterial({ color: 0x2ec4b6 });
    const pylonOffsets = [
      [-halfPadWidth - 0.12, -1.65],
      [halfPadWidth + 0.12, -1.65],
      [-halfPadWidth - 0.12, 1.65],
      [halfPadWidth + 0.12, 1.65],
    ];
    for (const [px, pz] of pylonOffsets) {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(px, 0.22, pz);
      padGroup.add(pylon);
    }

    // Thruster downward light illuminating gray dust under the descending ship
    const engineGlow = new THREE.PointLight(0x2ec4b6, 0, 14, 1.8);
    scene.add(engineGlow);

    const regolithDust = createRegolithDustSystem(scene, 110);
    let crashShake = 0;

    return {
      onRestart({ camera }) {
        crashShake = 0;
        regolithDust.reset();
        beaconRing.material.color.setHex(0x2ec4b6);
        pylonMat.color.setHex(0x2ec4b6);
        camera.position.set(0, 12.5, 27);
        camera.lookAt(0, 8, 0);
      },

      onAscent({ posX }) {
        beaconRing.material.color.setHex(0x2ec4b6);
        pylonMat.color.setHex(0x2ec4b6);
        regolithDust.burst(posX, 1.45, 0.85);
      },

      onTouchdown({ estado, posX }) {
        if (estado === 'aterrizado') {
          beaconRing.material.color.setHex(0x44ff66);
          pylonMat.color.setHex(0x44ff66);
          regolithDust.burst(posX, 0.9, 0.45);
        } else if (estado === 'fuera') {
          beaconRing.material.color.setHex(0xff9f1c);
          pylonMat.color.setHex(0xff9f1c);
          regolithDust.burst(posX, 1.15, 0.6);
        } else {
          beaconRing.material.color.setHex(0xe71d36);
          pylonMat.color.setHex(0xe71d36);
          regolithDust.burst(posX, 1.75, 0.95);
          crashShake = 0.45;
        }
      },

      update({ dt, elapsed, motorPrendido, altura, posX, posY, estado }) {
        earthrise.rotation.y += 0.04 * dt;

        const beaconPulse = 1 + Math.sin(elapsed * 3.6) * 0.045;
        beaconRing.scale.setScalar(estado === 'volando' ? beaconPulse : 1);

        if (motorPrendido) {
          engineGlow.position.set(posX, Math.max(0.4, posY - 0.8), 0);
          engineGlow.intensity = 2.4 + Math.random() * 0.8;
        } else {
          engineGlow.intensity = THREE.MathUtils.lerp(engineGlow.intensity, 0, 10 * dt);
        }

        const dustIntensity =
          motorPrendido && altura < 7.2
            ? THREE.MathUtils.clamp(1 - altura / 7.2, 0.1, 1)
            : 0;
        regolithDust.update(dt, posX, dustIntensity);

        if (crashShake > 0) {
          crashShake = Math.max(0, crashShake - dt * 1.4);
        }
      },

      updateCamera(camera, { dt, elapsed, posX, posY, altura, estado }) {
        if (estado === 'despegando') {
          camera.position.x = THREE.MathUtils.lerp(camera.position.x, posX * 0.24, 4 * dt);
          camera.position.y = THREE.MathUtils.lerp(
            camera.position.y,
            7.8 + Math.max(0, posY - 4) * 0.42,
            3.5 * dt
          );
          camera.position.z = THREE.MathUtils.lerp(
            camera.position.z,
            23 + Math.max(0, posY - 8) * 0.35,
            3.5 * dt
          );
          camera.lookAt(posX * 0.22, 5.4 + Math.max(0, posY - 4) * 0.68, 0);
          return;
        }

        const introBlend = THREE.MathUtils.clamp(elapsed / 1.3, 0, 1);
        const eased = 1 - Math.pow(1 - introBlend, 2);

        const targetX = posX * 0.24 * eased;
        const targetY = THREE.MathUtils.lerp(
          12.5,
          7.6 + Math.max(0, altura - 5) * 0.14,
          eased
        );
        const targetZ = THREE.MathUtils.lerp(27, 22.5, eased);

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 5 * dt);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetY, 4 * dt);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 4 * dt);

        if (crashShake > 0) {
          camera.position.x += (Math.random() - 0.5) * crashShake * 0.9;
          camera.position.y += (Math.random() - 0.5) * crashShake * 0.9;
        }

        const lookX = posX * 0.22 * eased;
        const lookY = 5.4 + Math.max(0, altura - 6) * 0.22;
        camera.lookAt(lookX, lookY, 0);
      },
    };
  },
});
