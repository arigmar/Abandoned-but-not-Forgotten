import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { withBase } from '../lib/base-path';
import {
  viewport,
  createHud,
  createRenderGate,
  observeViewportSize,
  onMissionRestart,
  onSelectTarget,
  emitTargetChanged,
} from './game-shell';

const DRACO_DECODER_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

function createStarLayer(count, spread, size, colorHex, opacity = 1) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) {
    pos[i] = (Math.random() - 0.5) * spread;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: colorHex,
    size,
    transparent: opacity < 1,
    opacity,
    sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}

/**
 * Radial star-streaks attached in spacecraft frame that elongate cleanly
 * with forward velocity during planetary transit and orbit insertion.
 */
function createSpeedStreaks(count = 160) {
  const positions = new Float32Array(count * 6);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 5.5 + Math.random() * 28;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = -Math.random() * 110;
    seeds.push({ x, y, z });
    positions[i * 6 + 0] = x;
    positions[i * 6 + 1] = y;
    positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x;
    positions[i * 6 + 4] = y;
    positions[i * 6 + 5] = z + 0.8;
  }

  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(positions, 3);
  geo.setAttribute('position', attr);

  const mat = new THREE.LineBasicMaterial({
    color: 0x8be4db,
    transparent: true,
    opacity: 0,
  });
  const lines = new THREE.LineSegments(geo, mat);

  function update(dt, speed) {
    const norm = THREE.MathUtils.clamp(Math.abs(speed) / 150, 0, 1.8);
    mat.opacity = norm > 0.06 ? THREE.MathUtils.clamp(norm * 0.42, 0, 0.58) : 0;
    if (mat.opacity === 0) return;

    const advance = Math.max(12, Math.abs(speed) * 0.85) * dt;
    const tail = 0.6 + norm * 4.8;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      s.z += advance;
      if (s.z > 14) {
        s.z = -110 + Math.random() * 12;
      }
      const base = i * 6;
      positions[base + 0] = s.x;
      positions[base + 1] = s.y;
      positions[base + 2] = s.z;
      positions[base + 3] = s.x;
      positions[base + 4] = s.y;
      positions[base + 5] = s.z - tail;
    }
    attr.needsUpdate = true;
  }

  return { lines, update };
}

function createPlanet(scene, gltfLoader, spec) {
  const group = new THREE.Group();
  const posVec = new THREE.Vector3(...spec.pos);
  group.position.copy(posVec);
  scene.add(group);

  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 32, 32),
    new THREE.MeshStandardMaterial({ color: spec.fallbackColor, roughness: 0.82 })
  );
  group.add(fallback);

  if (spec.atmosphereColor) {
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(spec.radius * 1.06, 32, 32),
      new THREE.MeshBasicMaterial({
        color: spec.atmosphereColor,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      })
    );
    group.add(halo);
  }

  let captureRing = null;
  let ringMaterial = null;
  if (spec.showCaptureRing) {
    ringMaterial = new THREE.MeshBasicMaterial({
      color: spec.ringColor ?? 0x2ec4b6,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
    });
    captureRing = new THREE.Mesh(
      new THREE.RingGeometry(spec.radius * 1.3, spec.radius * 1.37, 64),
      ringMaterial
    );
    captureRing.rotation.x = Math.PI * 0.36;
    captureRing.rotation.y = 0.25;
    group.add(captureRing);
  }

  if (spec.urlGLB) {
    gltfLoader.load(
      withBase(spec.urlGLB),
      (gltf) => {
        group.remove(fallback);
        const modelo = gltf.scene;
        const caja = new THREE.Box3();
        modelo.traverse((hijo) => {
          if (!hijo.isMesh) return;
          const mats = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
          mats.forEach((mat) => {
            mat.side = THREE.DoubleSide;
            if (mat.metalness !== undefined) {
              mat.metalness = 0.0;
              mat.roughness = 0.82;
            }
            const nombre = hijo.name.toLowerCase();
            if ((nombre.includes('cloud') || nombre.includes('atmos')) && !mat.map) {
              hijo.visible = false;
            }
            mat.needsUpdate = true;
          });
          if (hijo.visible) caja.expandByObject(hijo);
        });

        const tamano = caja.getSize(new THREE.Vector3());
        const maxDim = Math.max(tamano.x, tamano.y, tamano.z);
        const escala = maxDim > 0 ? (spec.radius * 2) / maxDim : 1;
        modelo.scale.setScalar(escala);

        const centro = caja.getCenter(new THREE.Vector3()).multiplyScalar(escala);
        modelo.position.sub(centro);
        group.add(modelo);
      },
      undefined,
      (err) => console.error('Failed to load model:', spec.urlGLB, err)
    );
  }

  return {
    ...spec,
    group,
    posVec,
    captureRing,
    ringMaterial,
  };
}

function getRelativeCue(ship, targetPos) {
  const localDir = targetPos
    .clone()
    .sub(ship.position)
    .normalize()
    .applyQuaternion(ship.quaternion.clone().invert());

  if (localDir.z < -0.92) {
    return '<span class="hud-ok">On course</span>';
  }
  const parts = [];
  if (localDir.x < -0.14) parts.push('&larr; Left');
  else if (localDir.x > 0.14) parts.push('Right &rarr;');
  if (localDir.y > 0.14) parts.push('&uarr; Up');
  else if (localDir.y < -0.14) parts.push('&darr; Down');
  if (parts.length === 0 && localDir.z > 0) parts.push('Behind (turn around)');
  return `<span class="hud-dim">${parts.join(' ')}</span>`;
}

/**
 * Starts an interactive open-space planetary transit mission inside `#juego`.
 * Supports multiple simultaneous landable target bodies (Moon & Mars) and
 * spawning cleanly outside any departed body (`?from=moon` / `?from=mars`).
 */
export function launchTransitMission(config) {
  if (!viewport) return;

  const contenedor = viewport;
  const hud = createHud();

  contenedor.setAttribute('tabindex', '0');
  contenedor.focus();
  contenedor.addEventListener('click', () => contenedor.focus());

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x010106);

  const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  contenedor.appendChild(renderer.domElement);
  observeViewportSize(renderer, camara, contenedor);

  escena.add(new THREE.AmbientLight(0xe6ecf5, 1.45));
  const sol = new THREE.DirectionalLight(0xf6efe4, 3.0);
  sol.position.set(300, 150, 250);
  escena.add(sol);

  escena.add(
    createStarLayer(4000, 3500, 1.2, 0xe6ecf5, 0.8),
    createStarLayer(1200, 2500, 2.2, 0xaaccff, 0.9),
    createStarLayer(600, 2000, 2.8, 0xffddaa, 1.0)
  );

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_URL);
  const cargador = new GLTFLoader();
  cargador.setDRACOLoader(dracoLoader);

  const bodies = config.bodies.map((spec) => createPlanet(escena, cargador, spec));
  const targets = bodies.filter((b) => b.role === 'target');
  const getBody = (id) => bodies.find((b) => b.id === id);

  const nave = new THREE.Group();
  const modeloVisualNave = new THREE.Group();
  nave.add(modeloVisualNave);
  escena.add(nave);

  const speedStreaks = createSpeedStreaks(160);
  nave.add(speedStreaks.lines);

  const cuerpoTemporal = new THREE.Mesh(
    new THREE.ConeGeometry(1, 3.5, 12).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd6dfec, metalness: 0.4, roughness: 0.3 })
  );
  modeloVisualNave.add(cuerpoTemporal);

  const defaultFlameColor = config.cruiseFlameColor ?? 0x2ec4b6;
  const flameMaterial = new THREE.MeshBasicMaterial({ color: defaultFlameColor });
  const fuego = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 2.2, 8).rotateX(Math.PI / 2),
    flameMaterial
  );
  fuego.position.z = 2.4;
  modeloVisualNave.add(fuego);

  cargador.load(
    withBase('/assets/games/spaceship.glb'),
    (gltf) => {
      modeloVisualNave.remove(cuerpoTemporal);
      const modeloNave = gltf.scene;
      const caja = new THREE.Box3();
      modeloNave.traverse((hijo) => {
        if (!hijo.isMesh) return;
        const mats = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
        mats.forEach((mat) => {
          mat.side = THREE.DoubleSide;
          if (mat.metalness !== undefined) mat.metalness = 0.2;
        });
        caja.expandByObject(hijo);
      });

      const tamano = caja.getSize(new THREE.Vector3());
      const maxDim = Math.max(tamano.x, tamano.y, tamano.z);
      const escala = maxDim > 0 ? 4.5 / maxDim : 1;
      modeloNave.scale.setScalar(escala);

      const centro = caja.getCenter(new THREE.Vector3()).multiplyScalar(escala);
      modeloNave.position.sub(centro);
      modeloNave.rotation.y = Math.PI;
      modeloVisualNave.add(modeloNave);
    },
    undefined,
    (err) => console.error('Failed to load spaceship.glb:', err)
  );

  const flashEntrada = document.createElement('div');
  Object.assign(flashEntrada.style, {
    position: 'absolute',
    inset: '0',
    background: 'radial-gradient(circle, rgba(46, 196, 182, 0.5), #090d16 78%)',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.55s ease',
    zIndex: '10',
  });
  contenedor.appendChild(flashEntrada);

  const urlParams = new URLSearchParams(window.location.search);
  const departedFrom = urlParams.get('from');

  let estado = 'volando';
  let velocidad = 0;
  let redirigiendo = false;
  let failedBody = null;
  let capturingBody = null;
  let selectedTargetId =
    departedFrom === 'moon'
      ? 'mars'
      : departedFrom === 'mars'
        ? 'moon'
        : config.initialTarget ?? targets[0]?.id ?? 'mars';
  let autopilot = false;
  let elapsedAnim = 0;
  let departureBannerTimer = 0;

  const steerDummy = new THREE.Object3D();
  const prevForward = new THREE.Vector3();

  function selectTarget(targetId) {
    if (!targets.some((b) => b.id === targetId)) return;
    selectedTargetId = targetId;
    emitTargetChanged(selectedTargetId);
  }

  function applySpawnState() {
    const originBody =
      departedFrom === 'moon' || departedFrom === 'mars' ? getBody(departedFrom) : null;
    const altTarget =
      departedFrom === 'moon'
        ? getBody('mars')
        : departedFrom === 'mars'
          ? getBody('moon')
          : null;

    if (originBody && altTarget) {
      const dir = altTarget.posVec.clone().sub(originBody.posVec).normalize();
      const offsetDist = originBody.radius + (originBody.triggerDistance ?? 32) + 42;
      nave.position.copy(originBody.posVec).addScaledVector(dir, offsetDist);
      nave.lookAt(altTarget.posVec);
      nave.rotateY(Math.PI);

      const camBack = dir.clone().multiplyScalar(-12);
      camara.position.copy(nave.position).add(camBack).add(new THREE.Vector3(0, 3.5, 0));
      velocidad = 45;
      departureBannerTimer = 3.2;
      selectedTargetId = altTarget.id;
    } else {
      nave.position.set(0, 0, 0);
      nave.rotation.set(0, 0, 0);
      velocidad = 0;
      departureBannerTimer = 0;
      camara.position.set(0, 3.5, 12);
      selectedTargetId = config.initialTarget ?? targets[0]?.id ?? 'mars';
    }

    emitTargetChanged(selectedTargetId);
  }

  function reiniciar() {
    modeloVisualNave.rotation.set(0, 0, 0);
    estado = 'volando';
    failedBody = null;
    capturingBody = null;
    redirigiendo = false;
    autopilot = false;
    elapsedAnim = 0;
    flameMaterial.color.setHex(defaultFlameColor);
    fuego.scale.set(1, 1, 1);
    fuego.visible = false;
    flashEntrada.style.opacity = '0';
    camara.fov = 60;
    camara.updateProjectionMatrix();
    applySpawnState();
    hud.setStatus('');
  }
  reiniciar();
  onMissionRestart(reiniciar);
  onSelectTarget((target) => selectTarget(target));

  const teclas = {};
  const GAME_CODES = [
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'Tab',
  ];

  window.addEventListener(
    'keydown',
    (e) => {
      if (GAME_CODES.includes(e.code)) e.preventDefault();
      const k = e.key.toLowerCase();
      teclas[e.code] = true;
      teclas[k] = true;

      if (estado === 'volando') {
        if (e.code === 'Digit1' || k === '1') selectTarget('moon');
        if (e.code === 'Digit2' || k === '2') selectTarget('mars');
        if (e.code === 'Tab' && targets.length > 1) {
          const idx = targets.findIndex((b) => b.id === selectedTargetId);
          selectTarget(targets[(idx + 1) % targets.length].id);
        }
        if (e.code === 'KeyG' || k === 'g') {
          autopilot = !autopilot;
        }
      }

      if ((e.code === 'KeyR' || k === 'r') && estado !== 'volando') {
        reiniciar();
      }
    },
    { passive: false }
  );

  window.addEventListener('keyup', (e) => {
    teclas[e.code] = false;
    teclas[e.key.toLowerCase()] = false;
  });

  window.addEventListener('blur', () => {
    for (const k in teclas) teclas[k] = false;
  });

  let lastTime = performance.now();
  const gate = createRenderGate(contenedor);

  function actualizar() {
    requestAnimationFrame(actualizar);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!gate.active) return;

    elapsedAnim += dt;
    if (departureBannerTimer > 0) departureBannerTimer = Math.max(0, departureBannerTimer - dt);

    const lockedTarget = getBody(selectedTargetId) ?? targets[0];

    for (const b of bodies) {
      b.group.rotation.y += b.rotSpeed * dt;
      if (b.captureRing && b.ringMaterial) {
        b.captureRing.rotation.z += 0.35 * dt;
        const isLocked = b.id === selectedTargetId;
        const pulse = isLocked
          ? 1.02 + Math.sin(elapsedAnim * 3.8) * 0.055
          : 0.98 + Math.sin(elapsedAnim * 2.1) * 0.02;
        b.captureRing.scale.setScalar(pulse);
        b.ringMaterial.opacity = isLocked ? 0.72 : 0.26;
      }
    }

    if (estado === 'volando') {
      const manualSteer =
        teclas['ArrowLeft'] ||
        teclas['ArrowRight'] ||
        teclas['ArrowUp'] ||
        teclas['ArrowDown'] ||
        teclas['KeyA'] ||
        teclas['a'] ||
        teclas['KeyD'] ||
        teclas['d'] ||
        teclas['KeyI'] ||
        teclas['KeyK'] ||
        teclas['KeyS'] ||
        teclas['s'];

      if (manualSteer && autopilot) {
        autopilot = false;
      }

      if (autopilot && lockedTarget) {
        prevForward.set(0, 0, -1).applyQuaternion(nave.quaternion);
        steerDummy.position.copy(nave.position);
        steerDummy.lookAt(lockedTarget.posVec);
        steerDummy.rotateY(Math.PI);
        nave.quaternion.slerp(steerDummy.quaternion, 2.4 * dt);

        const targetForward = new THREE.Vector3(0, 0, -1).applyQuaternion(steerDummy.quaternion);
        const turnRoll = THREE.MathUtils.clamp(prevForward.cross(targetForward).y * 3.5, -0.45, 0.45);
        modeloVisualNave.rotation.z = THREE.MathUtils.lerp(
          modeloVisualNave.rotation.z,
          turnRoll,
          6 * dt
        );

        velocidad = Math.min(velocidad + 70 * dt, 135);
        fuego.visible = true;
        fuego.scale.set(1, 1, 0.85 + Math.random() * 0.55);
      } else {
        const acelerando = teclas['KeyW'] || teclas['w'] || teclas['Space'];
        const frenando = teclas['KeyS'] || teclas['s'];

        if (acelerando) {
          velocidad = Math.min(velocidad + 75 * dt, 150);
          fuego.visible = true;
          fuego.scale.set(1, 1, 0.8 + Math.random() * 0.6);
        } else if (frenando) {
          velocidad = Math.max(velocidad - 75 * dt, -35);
          fuego.visible = false;
        } else {
          velocidad *= 0.985;
          if (Math.abs(velocidad) < 0.1) velocidad = 0;
          fuego.visible = false;
        }

        const velGiro = 1.8;
        let giroY = 0;
        let giroX = 0;

        if (teclas['ArrowLeft'] || teclas['KeyA'] || teclas['a']) giroY += 1;
        if (teclas['ArrowRight'] || teclas['KeyD'] || teclas['d']) giroY -= 1;
        if (teclas['ArrowUp'] || teclas['KeyI']) giroX += 1;
        if (teclas['ArrowDown'] || teclas['KeyK']) giroX -= 1;

        nave.rotateY(giroY * velGiro * dt);
        nave.rotateX(giroX * velGiro * dt);

        const inclinacionObjetivo = giroY * 0.45;
        modeloVisualNave.rotation.z = THREE.MathUtils.lerp(
          modeloVisualNave.rotation.z,
          inclinacionObjetivo,
          8 * dt
        );
      }

      nave.translateZ(-velocidad * dt);

      const distances = bodies.map((b) => ({
        body: b,
        dist: Math.max(0, nave.position.distanceTo(b.posVec) - b.radius),
      }));

      for (const entry of distances) {
        const b = entry.body;
        if (b.role === 'target' && entry.dist < (b.triggerDistance ?? 32)) {
          estado = 'acelerando_destino';
          capturingBody = b;
          autopilot = false;
          selectedTargetId = b.id;
          emitTargetChanged(b.id);
          modeloVisualNave.rotation.z = 0;
          flameMaterial.color.setHex(b.captureFlameColor ?? defaultFlameColor);
          flashEntrada.style.background =
            b.captureFlashGradient ??
            'radial-gradient(circle, rgba(46, 196, 182, 0.5), #090d16 78%)';
          nave.lookAt(b.posVec);
          nave.rotateY(Math.PI);
          break;
        }
        if (b.role === 'origin' && entry.dist < (b.abortDistance ?? 10)) {
          estado = 'fallo';
          failedBody = b;
          autopilot = false;
          velocidad = 0;
          fuego.visible = false;
          break;
        }
      }

      const distanceSummary = distances
        .slice()
        .sort((a, b) => {
          if (a.body.id === selectedTargetId) return -1;
          if (b.body.id === selectedTargetId) return 1;
          if (a.body.role === 'target' && b.body.role !== 'target') return -1;
          if (b.body.role === 'target' && a.body.role !== 'target') return 1;
          return 0;
        })
        .map((d) => {
          const text = `${d.body.label} ${d.dist.toFixed(0)} km`;
          return d.body.id === selectedTargetId ? `<span class="hud-ok">${text}</span>` : text;
        })
        .join(' &middot; ');

      const cue = lockedTarget ? getRelativeCue(nave, lockedTarget.posVec) : '';
      const autoLabel = autopilot ? ' <span class="hud-ok">[AUTO]</span>' : '';

      hud.setTelemetry(`
        <span class="game-hud__title">Target: ${lockedTarget?.label ?? 'Orbit'}${autoLabel} &middot; Fly to Moon or Mars</span>
        ${distanceSummary}<br>
        Speed ${velocidad.toFixed(0)} km/s${cue ? ` &middot; Heading ${cue}` : ''}
        <span class="game-hud__controls">[W / Space] Thrust &middot; [S] Brake &middot; [A / D / &larr; &rarr;] Turn &middot; [&uarr; &darr;] Pitch &middot; [1] Moon &middot; [2] Mars &middot; [G] Auto-cruise</span>
      `);

      if (departureBannerTimer > 0 && departedFrom) {
        const departedName = departedFrom === 'moon' ? 'the Moon' : 'Mars';
        hud.setStatus(`
          <span class="hud-ok"><b>ORBIT ACHIEVED</b></span><br>
          Departed ${departedName}. Steer to ${lockedTarget?.label ?? 'your next target'} or press <b>[ G ]</b> for auto-cruise.
        `);
      } else {
        hud.setStatus('');
      }
    } else if (estado === 'fallo' && failedBody) {
      hud.setStatus(`
        <span class="hud-danger"><b>${failedBody.failTitle}</b></span><br>
        ${failedBody.failBody}<br>
        Press <b>[ R ]</b> or hit <b>Restart</b> to try again.
      `);
    } else if (estado === 'acelerando_destino' && capturingBody) {
      velocidad += 350 * dt;
      nave.translateZ(-velocidad * dt);

      if (camara.fov < 115) {
        camara.fov += 90 * dt;
        camara.updateProjectionMatrix();
      }

      fuego.visible = true;
      fuego.scale.set(1.5, 1.5, 4 + Math.random() * 2);

      hud.setStatus(`
        <span class="hud-warning"><b>${capturingBody.captureStatusTitle}</b></span><br>
        ${capturingBody.captureStatusBody}
      `);

      const centerDist = nave.position.distanceTo(capturingBody.posVec);
      if (centerDist < (capturingBody.transitionRadius ?? capturingBody.radius) && !redirigiendo) {
        redirigiendo = true;
        flashEntrada.style.opacity = '1';
        setTimeout(() => {
          window.location.href = withBase(capturingBody.nextRoute);
        }, 550);
      }
    }

    speedStreaks.update(
      dt,
      estado === 'volando' || estado === 'acelerando_destino' ? velocidad : 0
    );

    if (estado === 'volando' || estado === 'acelerando_destino') {
      nave.updateMatrixWorld();
      const offsetCamara = new THREE.Vector3(0, 3.5, 12).applyMatrix4(nave.matrixWorld);
      camara.position.lerp(offsetCamara, 0.15);

      if (estado === 'acelerando_destino') {
        camara.position.x += (Math.random() - 0.5) * 0.5;
        camara.position.y += (Math.random() - 0.5) * 0.5;
      }

      camara.lookAt(nave.position);
    }

    renderer.render(escena, camara);
  }

  actualizar();
}
