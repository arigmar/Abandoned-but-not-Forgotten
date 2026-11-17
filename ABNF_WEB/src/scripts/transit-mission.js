import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { withAssetUrl, withBase } from '../lib/base-path';
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

const CAMERA_MODES = [
  { name: 'Standard', offset: new THREE.Vector3(0, 3.3, 11.8), lookAhead: 16, baseFov: 60 },
  { name: 'Close Action', offset: new THREE.Vector3(0, 2.1, 7.2), lookAhead: 24, baseFov: 65 },
  { name: 'Panoramic', offset: new THREE.Vector3(0, 5.2, 17.5), lookAhead: 12, baseFov: 56 },
];

// ==========================================
// 1. TEXTURAS PROCEDURALES, ESTRELLAS Y PLANETAS LEJANOS
// ==========================================
function createProceduralPlanetTexture({ base, bands = [], spots = [], craters = 0 }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  bands.forEach(({ y, height, color, opacity = 0.5 }) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    const grad = ctx.createLinearGradient(0, y - height, 0, y + height);
    grad.addColorStop(0, 'transparent');
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - height, canvas.width, height * 2);
    ctx.restore();
  });

  spots.forEach(({ x, y, rx, ry, color, opacity = 0.75 }) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  for (let i = 0; i < craters; i++) {
    const x = Math.random() * canvas.width;
    const y = 20 + Math.random() * (canvas.height - 40);
    const r = 2 + Math.random() * 14;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createRingTexture(colorStops) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
  colorStops.forEach(([pos, col]) => grad.addColorStop(pos, col));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

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

function crearPlanetasLejanos(cantidad, radioMin, radioMax) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cantidad * 3);
  const colores = new Float32Array(cantidad * 3);

  const paletaPlanetas = [
    new THREE.Color(0x5599ff),
    new THREE.Color(0xff8855),
    new THREE.Color(0xeedd99),
    new THREE.Color(0x77ddaa),
    new THREE.Color(0xd488ff),
  ];

  for (let i = 0; i < cantidad; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const r = radioMin + Math.random() * (radioMax - radioMin);

    pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);

    const color = paletaPlanetas[Math.floor(Math.random() * paletaPlanetas.length)];
    colores[i * 3]     = color.r;
    colores[i * 3 + 1] = color.g;
    colores[i * 3 + 2] = color.b;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colores, 3));

  const mat = new THREE.PointsMaterial({
    size: 11,
    vertexColors: true,
    sizeAttenuation: true,
  });

  return new THREE.Points(geo, mat);
}

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

// ==========================================
// 2. SOL (sun.glb) Y PLANETAS CON ESCALA DINÁMICA
// ==========================================
function createSun(scene, gltfLoader, sunSpec) {
  const basePos = new THREE.Vector3(...sunSpec.pos);
  const group = new THREE.Group();
  group.position.copy(basePos);
  scene.add(group);

  const temporalSol = new THREE.Mesh(
    new THREE.SphereGeometry(sunSpec.radius, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 })
  );
  group.add(temporalSol);

  const haloSol = new THREE.Mesh(
    new THREE.SphereGeometry(sunSpec.radius * 1.25, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xff6600,
      transparent: true,
      opacity: 0.25,
      side: THREE.BackSide,
    })
  );
  group.add(haloSol);

  if (sunSpec.urlGLB) {
    gltfLoader.load(
      withAssetUrl(sunSpec.urlGLB),
      (gltf) => {
        group.remove(temporalSol);
        const modeloSol = gltf.scene;
        const caja = new THREE.Box3();

        modeloSol.traverse((hijo) => {
          if (hijo.isMesh) {
            hijo.material.side = THREE.DoubleSide;

            if (hijo.material.metalness !== undefined) {
              hijo.material.metalness = 0.0;
              hijo.material.roughness = 1.0;
            }

            if (hijo.material.map) {
              hijo.material.emissiveMap = hijo.material.map;
              hijo.material.emissive = new THREE.Color(0xffffff);
              hijo.material.emissiveIntensity = 1.2;
            }

            hijo.material.needsUpdate = true;
            caja.expandByObject(hijo);
          }
        });

        const tamano = caja.getSize(new THREE.Vector3());
        const maxDim = Math.max(tamano.x, tamano.y, tamano.z);
        const escala = maxDim > 0 ? (sunSpec.radius * 2) / maxDim : 1;
        modeloSol.scale.setScalar(escala);

        const centro = caja.getCenter(new THREE.Vector3()).multiplyScalar(escala);
        modeloSol.position.sub(centro);

        group.add(modeloSol);
      },
      undefined,
      (err) => console.error('Failed to load sun.glb:', err)
    );
  }

  return {
    ...sunSpec,
    group,
    basePos,
    posVec: group.position,
    haloSol,
  };
}

function createPlanet(scene, gltfLoader, spec) {
  const group = new THREE.Group();
  const basePos = new THREE.Vector3(...spec.pos);
  group.position.copy(basePos);
  if (spec.tilt) group.rotation.z = spec.tilt;
  scene.add(group);

  const procTex = spec.textureOpts ? createProceduralPlanetTexture(spec.textureOpts) : null;
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(spec.radius, 40, 40),
    new THREE.MeshStandardMaterial({
      color: procTex ? 0xffffff : spec.fallbackColor,
      map: procTex,
      roughness: 0.82,
      metalness: 0.04,
    })
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

  if (spec.rings) {
    const ringGeo = new THREE.RingGeometry(spec.rings.innerRadius, spec.rings.outerRadius, 96);
    const posAttr = ringGeo.attributes.position;
    const uvAttr = ringGeo.attributes.uv;
    const v3 = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      v3.fromBufferAttribute(posAttr, i);
      const u =
        (v3.length() - spec.rings.innerRadius) /
        (spec.rings.outerRadius - spec.rings.innerRadius);
      uvAttr.setXY(i, u, 0.5);
    }

    const ringMesh = new THREE.Mesh(
      ringGeo,
      new THREE.MeshStandardMaterial({
        map: createRingTexture(spec.rings.colorStops),
        side: THREE.DoubleSide,
        transparent: true,
        roughness: 0.65,
        metalness: 0.1,
      })
    );
    ringMesh.rotation.x = Math.PI / 2;
    group.add(ringMesh);
  }

  let moonsPivot = null;
  if (spec.hasMartianMoons) {
    moonsPivot = new THREE.Group();
    moonsPivot.position.copy(basePos);
    scene.add(moonsPivot);

    const phobos = new THREE.Mesh(
      new THREE.DodecahedronGeometry(2.2, 1),
      new THREE.MeshStandardMaterial({ color: 0x7a6e67, roughness: 0.95 })
    );
    phobos.position.set(spec.radius + 18, 5, 0);
    moonsPivot.add(phobos);

    const deimos = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.4, 1),
      new THREE.MeshStandardMaterial({ color: 0x8d8279, roughness: 0.95 })
    );
    deimos.position.set(-(spec.radius + 32), -8, 12);
    moonsPivot.add(deimos);
  }

  if (spec.urlGLB) {
    gltfLoader.load(
      withAssetUrl(spec.urlGLB),
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
              mat.roughness = 0.8;
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
    basePos,
    posVec: group.position,
    moonsPivot,
    currentScale: 1,
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

// ==========================================
// 3. LANZADOR DE LA MISIÓN DE TRÁNSITO
// ==========================================
export function launchTransitMission(config) {
  if (!viewport) return;

  const contenedor = viewport;
  const hud = createHud();

  contenedor.setAttribute('tabindex', '0');
  contenedor.focus();
  contenedor.addEventListener('click', () => contenedor.focus());

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(0x010106);

  const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 45000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  contenedor.appendChild(renderer.domElement);
  observeViewportSize(renderer, camara, contenedor);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_URL);
  const cargador = new GLTFLoader();
  cargador.setDRACOLoader(dracoLoader);

  const sunObj = config.sun ? createSun(escena, cargador, config.sun) : null;

  escena.add(new THREE.AmbientLight(0xffffff, 1.4));
  const solLuz = new THREE.DirectionalLight(0xfff5e6, 3.0);
  solLuz.position.set(300, 150, 250);
  escena.add(solLuz);

  escena.add(
    createStarLayer(5000, 26000, 2.2, 0xffffff, 0.8),
    createStarLayer(1600, 22000, 3.5, 0xaaccff, 0.9),
    createStarLayer(800, 18000, 4.2, 0xffddaa, 1.0),
    crearPlanetasLejanos(220, 4800, 14000)
  );

  const bodies = config.bodies.map((spec) => createPlanet(escena, cargador, spec));
  const targets = bodies.filter((b) => b.role === 'target');
  const playableBodies = bodies.filter((b) => b.role === 'target' || b.role === 'origin');
  const solarSystemBodies = bodies.filter((b) => b.role === 'solar_system');
  const getBody = (id) => bodies.find((b) => b.id === id);

  const CANTIDAD_ASTEROIDES = config.asteroidCount ?? 8;
  const geoAsteroide = new THREE.IcosahedronGeometry(1, 1);
  const matAsteroide = new THREE.MeshStandardMaterial({
    color: 0x7c756e,
    roughness: 0.92,
    metalness: 0.08,
    flatShading: true,
  });
  const mallaAsteroides = new THREE.InstancedMesh(geoAsteroide, matAsteroide, CANTIDAD_ASTEROIDES);
  const datosAsteroides = [];
  const matrizTemp = new THREE.Matrix4();
  const quatTemp = new THREE.Quaternion();
  const escTemp = new THREE.Vector3();

  for (let i = 0; i < CANTIDAD_ASTEROIDES; i++) {
    const pos = new THREE.Vector3(
      (Math.random() - 0.5) * 900,
      (Math.random() - 0.5) * 350,
      -350 - Math.random() * 900
    );
    for (const pb of playableBodies) {
      if (pos.distanceTo(pb.basePos) < pb.radius + 95) {
        pos.x += 180;
      }
    }
    const radio = 2.0 + Math.random() * 3.5;
    quatTemp.setFromEuler(
      new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI)
    );
    escTemp.set(radio, radio * 0.85, radio * 1.1);
    matrizTemp.compose(pos, quatTemp, escTemp);
    mallaAsteroides.setMatrixAt(i, matrizTemp);
    datosAsteroides.push({ posicion: pos, radio });
  }
  mallaAsteroides.instanceMatrix.needsUpdate = true;
  escena.add(mallaAsteroides);

  // ==========================================
  // 4. NAVE Y PROPULSORES DOBLES
  // ==========================================
  const nave = new THREE.Group();
  const modeloVisualNave = new THREE.Group();
  nave.add(modeloVisualNave);
  escena.add(nave);

  const speedStreaks = createSpeedStreaks(160);
  nave.add(speedStreaks.lines);

  const cuerpoTemporal = new THREE.Mesh(
    new THREE.ConeGeometry(1, 3.5, 12).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.3 })
  );
  modeloVisualNave.add(cuerpoTemporal);

  const defaultFlameColor = config.cruiseFlameColor ?? 0xff7711;
  const flameMaterial = new THREE.MeshBasicMaterial({ color: defaultFlameColor });

  const grupoPropulsores = new THREE.Group();
  grupoPropulsores.position.z = 2.2;
  grupoPropulsores.visible = false;
  modeloVisualNave.add(grupoPropulsores);

  const fuegoIzq = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 1.1, 8).rotateX(Math.PI / 2),
    flameMaterial
  );
  fuegoIzq.position.set(-0.72, 0, 0.55);
  grupoPropulsores.add(fuegoIzq);

  const fuegoDer = new THREE.Mesh(
    new THREE.ConeGeometry(0.24, 1.1, 8).rotateX(Math.PI / 2),
    flameMaterial
  );
  fuegoDer.position.set(0.72, 0, 0.55);
  grupoPropulsores.add(fuegoDer);

  cargador.load(
    withAssetUrl('/assets/games/spaceship.glb'),
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
    background: 'radial-gradient(circle, rgba(255, 170, 68, 0.35), transparent 75%)',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.5s ease',
    zIndex: '10',
  });
  contenedor.appendChild(flashEntrada);

  // ==========================================
  // 5. FÍSICA, BARRERA LUNAR Y ACERCAMIENTO CONTINUO
  // ==========================================
  const urlParams = new URLSearchParams(window.location.search);
  const departedFrom = urlParams.get('from');

  let estado = 'volando';
  const vectorVelocidad = new THREE.Vector3(0, 0, 0);
  const velocidadAngular = new THREE.Vector3(0, 0, 0);
  let velocidadEntrada = 0;
  let captureElapsed = 0;
  let redirigiendo = false;
  let failedTitle = '';
  let failedBodyText = '';
  let capturingBody = null;
  let selectedTargetId =
    departedFrom === 'moon'
      ? 'mars'
      : departedFrom === 'mars'
        ? 'moon'
        : config.initialTarget ?? targets[0]?.id ?? 'mars';
  let autopilot = false;
  let cameraModeIdx = 0;
  let elapsedAnim = 0;
  let departureBannerTimer = 0;

  const VELOCIDAD_MAXIMA = 310;
  const EMPUJE_PRINCIPAL = 135;
  const EMPUJE_FRENADO = 240;
  const FRICCION_FRENADO = 4.2;
  const FRICCION_INERCIAL = 1.65;
  const DISTANCIA_MINIMA_SUPERFICIE = 4.2; // Barrera física: nunca atraviesa la superficie

  const steerDummy = new THREE.Object3D();
  const prevForward = new THREE.Vector3();
  const dirFrente = new THREE.Vector3();
  const velDeseada = new THREE.Vector3();
  const normalPlaneta = new THREE.Vector3();
  const puntoFrentePlaneta = new THREE.Vector3();
  const camFocusPoint = new THREE.Vector3();
  const idealLookAt = new THREE.Vector3();
  const idealCamPos = new THREE.Vector3();
  const upVector = new THREE.Vector3(0, 1, 0);

  // Impide físicamente que la nave atraviese la Luna, Marte o la Tierra
  function enforcePlanetaryBarriers() {
    for (const b of playableBodies) {
      const effectiveRadius = b.radius * (b.currentScale ?? 1);
      const minAllowedDist = effectiveRadius + DISTANCIA_MINIMA_SUPERFICIE;
      const distToCenter = nave.position.distanceTo(b.posVec);

      if (distToCenter < minAllowedDist) {
        normalPlaneta.subVectors(nave.position, b.posVec);
        if (normalPlaneta.lengthSq() < 0.0001) {
          normalPlaneta.set(0, 0, 1);
        } else {
          normalPlaneta.normalize();
        }
        nave.position.copy(b.posVec).addScaledVector(normalPlaneta, minAllowedDist);

        // Eliminar componente de velocidad que empuje hacia adentro del planeta
        const velHaciaAdentro = vectorVelocidad.dot(normalPlaneta);
        if (velHaciaAdentro < 0) {
          vectorVelocidad.addScaledVector(normalPlaneta, -velHaciaAdentro);
        }
      }
    }
  }

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
      const dir = altTarget.basePos.clone().sub(originBody.basePos).normalize();
      const offsetDist = originBody.radius * (originBody.maxProximityScale ?? 1.5) + 60;
      nave.position.copy(originBody.basePos).addScaledVector(dir, offsetDist);
      nave.lookAt(altTarget.basePos);
      nave.rotateY(Math.PI);

      const camBack = dir.clone().multiplyScalar(-12);
      camara.position.copy(nave.position).add(camBack).add(new THREE.Vector3(0, 3.3, 0));
      camFocusPoint.copy(nave.position).addScaledVector(dir, 14);
      vectorVelocidad.copy(dir).multiplyScalar(55);
      departureBannerTimer = 3.2;
      selectedTargetId = altTarget.id;
    } else {
      nave.position.set(0, 0, 0);
      nave.rotation.set(0, 0, 0);
      vectorVelocidad.set(0, 0, 0);
      departureBannerTimer = 0;
      camara.position.set(0, 3.3, 11.8);
      camFocusPoint.set(0, 0, -16);
      selectedTargetId = config.initialTarget ?? targets[0]?.id ?? 'mars';
    }

    velocidadAngular.set(0, 0, 0);
    emitTargetChanged(selectedTargetId);
  }

  function reiniciar() {
    modeloVisualNave.rotation.set(0, 0, 0);
    estado = 'volando';
    failedTitle = '';
    failedBodyText = '';
    capturingBody = null;
    captureElapsed = 0;
    redirigiendo = false;
    autopilot = false;
    elapsedAnim = 0;
    flameMaterial.color.setHex(defaultFlameColor);
    fuegoIzq.scale.set(1, 1, 1);
    fuegoDer.scale.set(1, 1, 1);
    grupoPropulsores.visible = false;
    flashEntrada.style.opacity = '0';
    camara.fov = CAMERA_MODES[cameraModeIdx].baseFov;
    camara.up.set(0, 1, 0);
    camara.updateProjectionMatrix();

    for (const b of playableBodies) {
      b.currentScale = 1;
      b.group.scale.setScalar(1);
      if (b.moonsPivot) b.moonsPivot.scale.setScalar(1);
    }

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
    'KeyV',
    'KeyC',
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
        if (e.code === 'KeyV' || k === 'v' || e.code === 'KeyC' || k === 'c') {
          cameraModeIdx = (cameraModeIdx + 1) % CAMERA_MODES.length;
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
    const camPreset = CAMERA_MODES[cameraModeIdx];

    if (sunObj) {
      sunObj.group.rotation.y += 0.02 * dt;
      const pulsoSol = 1 + Math.sin(elapsedAnim * 2) * 0.03;
      sunObj.haloSol.scale.setScalar(pulsoSol);
    }

    // Rotación planetaria y crecimiento progresivo al acercarse
    for (const b of bodies) {
      b.group.rotation.y += (b.rotSpeed ?? 0.06) * dt;
      if (b.moonsPivot) {
        b.moonsPivot.rotation.y += 0.35 * dt;
      }
      if (b.role === 'solar_system') {
        b.group.position.copy(b.basePos).addScaledVector(nave.position, 0.94);
      } else if (b.maxProximityScale && b.proximityRange && estado === 'volando') {
        const centerDist = nave.position.distanceTo(b.posVec);
        const proxNorm = THREE.MathUtils.clamp(
          1 - (centerDist - b.radius) / b.proximityRange,
          0,
          1
        );
        const targetScale = 1 + (b.maxProximityScale - 1) * (proxNorm * proxNorm);
        b.currentScale = THREE.MathUtils.lerp(b.currentScale, targetScale, 1 - Math.exp(-6 * dt));
        b.group.scale.setScalar(b.currentScale);
        if (b.moonsPivot) b.moonsPivot.scale.setScalar(b.currentScale);
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
        nave.quaternion.slerp(steerDummy.quaternion, 1 - Math.exp(-3.2 * dt));

        const targetForward = new THREE.Vector3(0, 0, -1).applyQuaternion(steerDummy.quaternion);
        const turnRoll = THREE.MathUtils.clamp(
          prevForward.cross(targetForward).y * 3.8,
          -0.48,
          0.48
        );
        modeloVisualNave.rotation.z = THREE.MathUtils.lerp(
          modeloVisualNave.rotation.z,
          turnRoll,
          1 - Math.exp(-8 * dt)
        );
        modeloVisualNave.rotation.x = THREE.MathUtils.lerp(
          modeloVisualNave.rotation.x,
          0,
          1 - Math.exp(-8 * dt)
        );

        nave.getWorldDirection(dirFrente).negate();
        const rapidezObjetivo = Math.min(vectorVelocidad.length() + 115 * dt, 230);
        vectorVelocidad.copy(dirFrente).multiplyScalar(rapidezObjetivo);

        grupoPropulsores.visible = true;
        fuegoIzq.scale.z = 0.85 + Math.random() * 0.6;
        fuegoDer.scale.z = 0.85 + Math.random() * 0.6;
      } else {
        const acelerando = teclas['KeyW'] || teclas['w'] || teclas['Space'];
        const frenando = teclas['KeyS'] || teclas['s'];

        const acelAngular = 3.8;
        let inputYaw = 0;
        let inputPitch = 0;

        if (teclas['ArrowLeft'] || teclas['KeyA'] || teclas['a']) inputYaw += 1;
        if (teclas['ArrowRight'] || teclas['KeyD'] || teclas['d']) inputYaw -= 1;
        if (teclas['ArrowUp'] || teclas['KeyI']) inputPitch += 1;
        if (teclas['ArrowDown'] || teclas['KeyK']) inputPitch -= 1;

        if (inputYaw !== 0) {
          velocidadAngular.y = THREE.MathUtils.clamp(
            velocidadAngular.y + inputYaw * acelAngular * dt,
            -1.85,
            1.85
          );
        } else {
          velocidadAngular.y *= Math.exp(-10 * dt);
          if (Math.abs(velocidadAngular.y) < 0.004) velocidadAngular.y = 0;
        }

        if (inputPitch !== 0) {
          velocidadAngular.x = THREE.MathUtils.clamp(
            velocidadAngular.x + inputPitch * acelAngular * dt,
            -1.75,
            1.75
          );
        } else {
          velocidadAngular.x *= Math.exp(-10 * dt);
          if (Math.abs(velocidadAngular.x) < 0.004) velocidadAngular.x = 0;
        }

        nave.rotateY(velocidadAngular.y * dt);
        nave.rotateX(velocidadAngular.x * dt);

        const inclinacionZ = velocidadAngular.y * 0.38;
        const inclinacionX = -velocidadAngular.x * 0.16;
        modeloVisualNave.rotation.z = THREE.MathUtils.lerp(
          modeloVisualNave.rotation.z,
          inclinacionZ,
          1 - Math.exp(-9 * dt)
        );
        modeloVisualNave.rotation.x = THREE.MathUtils.lerp(
          modeloVisualNave.rotation.x,
          inclinacionX,
          1 - Math.exp(-9 * dt)
        );

        nave.getWorldDirection(dirFrente).negate();

        if (acelerando) {
          vectorVelocidad.addScaledVector(dirFrente, EMPUJE_PRINCIPAL * dt);
          const rapidez = Math.min(vectorVelocidad.length(), VELOCIDAD_MAXIMA);
          velDeseada.copy(dirFrente).multiplyScalar(rapidez);
          vectorVelocidad.lerp(velDeseada, 1 - Math.exp(-5.5 * dt));

          grupoPropulsores.visible = true;
          fuegoIzq.scale.z = 0.85 + Math.random() * 0.6;
          fuegoDer.scale.z = 0.85 + Math.random() * 0.6;
        } else if (frenando) {
          vectorVelocidad.multiplyScalar(Math.exp(-FRICCION_FRENADO * dt));
          const rapidezActual = vectorVelocidad.length();
          if (rapidezActual > 0) {
            const nuevaRapidez = Math.max(rapidezActual - EMPUJE_FRENADO * dt, 0);
            vectorVelocidad.setLength(nuevaRapidez);
          }
          grupoPropulsores.visible = false;
        } else {
          vectorVelocidad.multiplyScalar(Math.exp(-FRICCION_INERCIAL * dt));
          const rapidezActual = vectorVelocidad.length();
          if (rapidezActual > 0) {
            const nuevaRapidez = Math.max(rapidezActual - 18 * dt, 0);
            if (nuevaRapidez < 0.25) {
              vectorVelocidad.set(0, 0, 0);
            } else {
              velDeseada.copy(dirFrente).multiplyScalar(nuevaRapidez);
              vectorVelocidad.lerp(velDeseada, 1 - Math.exp(-4.0 * dt));
              vectorVelocidad.setLength(nuevaRapidez);
            }
          }
          grupoPropulsores.visible = false;
        }
      }

      nave.position.addScaledVector(vectorVelocidad, dt);

      // Barrera física para que jamás atraviese la Luna ni ningún planeta
      enforcePlanetaryBarriers();

      if (sunObj) {
        const distSol = nave.position.distanceTo(sunObj.posVec) - sunObj.radius;
        if (distSol < (sunObj.dangerDistance ?? 950)) {
          estado = 'fallo';
          failedTitle = 'CRITICAL HEAT WARNING';
          failedBodyText = 'Solar radiation exceeded hull limits — you cannot approach the Sun.';
          autopilot = false;
          vectorVelocidad.set(0, 0, 0);
          grupoPropulsores.visible = false;
          flashEntrada.style.background = 'radial-gradient(circle, #ffaa44, #d9381e)';
          flashEntrada.style.opacity = '0.45';
        }
      }

      if (estado === 'volando') {
        for (let i = 0; i < CANTIDAD_ASTEROIDES; i++) {
          const ast = datosAsteroides[i];
          if (nave.position.distanceToSquared(ast.posicion) < (ast.radio + 1.8) ** 2) {
            estado = 'fallo';
            failedTitle = 'METEORITE IMPACT';
            failedBodyText = 'Your spacecraft collided with a meteorite.';
            autopilot = false;
            vectorVelocidad.set(0, 0, 0);
            grupoPropulsores.visible = false;
            break;
          }
        }
      }

      const distances = playableBodies.map((b) => {
        const effectiveRadius = b.radius * (b.currentScale ?? 1);
        return {
          body: b,
          effectiveRadius,
          dist: Math.max(0, nave.position.distanceTo(b.posVec) - effectiveRadius),
        };
      });

      if (estado === 'volando') {
        for (const entry of distances) {
          const b = entry.body;
          if (b.role === 'target' && entry.dist < (b.triggerDistance ?? 36)) {
            estado = 'acelerando_destino';
            capturingBody = b;
            captureElapsed = 0;
            autopilot = false;
            velocidadEntrada = Math.max(vectorVelocidad.length(), 160);
            selectedTargetId = b.id;
            emitTargetChanged(b.id);
            modeloVisualNave.rotation.set(0, 0, 0);
            flameMaterial.color.setHex(b.captureFlameColor ?? defaultFlameColor);
            flashEntrada.style.background =
              b.captureFlashGradient ??
              'radial-gradient(circle, rgba(155, 231, 255, 0.32), transparent 75%)';
            nave.lookAt(b.posVec);
            nave.rotateY(Math.PI);
            break;
          }
          if (b.role === 'origin' && entry.dist < (b.abortDistance ?? 15)) {
            estado = 'fallo';
            failedTitle = b.failTitle;
            failedBodyText = b.failBody;
            autopilot = false;
            vectorVelocidad.set(0, 0, 0);
            grupoPropulsores.visible = false;
            break;
          }
        }
      }

      const mainDistancesHtml = distances
        .slice()
        .sort((a, b) => {
          if (a.body.id === selectedTargetId) return -1;
          if (b.body.id === selectedTargetId) return 1;
          return 0;
        })
        .map((d) => {
          const text = `${d.body.label} ${d.dist.toFixed(0)} km`;
          return d.body.id === selectedTargetId ? `<span class="hud-ok">${text}</span>` : text;
        })
        .join(' &middot; ');

      const solarDistancesHtml = solarSystemBodies
        .map((b) => `${b.label} ${b.realDistanceMkm}M km`)
        .join(' &middot; ');

      const rapidez = vectorVelocidad.length();
      const cue = lockedTarget ? getRelativeCue(nave, lockedTarget.posVec) : '';
      const autoLabel = autopilot ? ' <span class="hud-ok">[AUTO]</span>' : '';

      hud.setTelemetry(`
        <span class="game-hud__title">Target: ${lockedTarget?.label ?? 'Mars'}${autoLabel} &middot; View: ${camPreset.name}</span>
        ${mainDistancesHtml}<br>
        <span class="hud-dim" style="font-size:0.86em;">Solar System: ${solarDistancesHtml}</span><br>
        Speed ${rapidez.toFixed(0)} km/s${cue ? ` &middot; Heading ${cue}` : ''}
        <span class="game-hud__controls">[W / Space] Thrust &middot; [S] Brake &middot; [A / D / &larr; &rarr;] Yaw &middot; [&uarr; &darr;] Pitch &middot; [V] Camera &middot; [1] Moon &middot; [2] Mars &middot; [G] Auto</span>
      `);

      if (departureBannerTimer > 0 && departedFrom) {
        const departedName = departedFrom === 'moon' ? 'the Moon' : 'Mars';
        hud.setStatus(`
          <span class="hud-ok"><b>ORBIT ACHIEVED</b></span><br>
          Departed ${departedName}. Steer to ${lockedTarget?.label ?? 'your next target'} or press <b>[ G ]</b> for auto-cruise.
        `);
      } else if (estado === 'volando') {
        hud.setStatus('');
      }
    } else if (estado === 'fallo') {
      hud.setStatus(`
        <span class="hud-danger"><b>${failedTitle}</b></span><br>
        ${failedBodyText}<br>
        Press <b>[ R ]</b> or hit <b>Restart</b> to launch again.
      `);
    } else if (estado === 'acelerando_destino' && capturingBody) {
      captureElapsed += dt;
      velocidadEntrada = Math.min(velocidadEntrada + 180 * dt, 340);

      // Hacer que la Luna / Marte crezca continuamente frente a ti mientras carga la siguiente escena
      capturingBody.currentScale = Math.min(
        (capturingBody.currentScale ?? 1) + dt * 0.55 * (capturingBody.currentScale ?? 1),
        6.5
      );
      capturingBody.group.scale.setScalar(capturingBody.currentScale);
      if (capturingBody.moonsPivot) {
        capturingBody.moonsPivot.scale.setScalar(capturingBody.currentScale);
      }

      // Acercar la nave asintóticamente hacia el borde de la Luna SIN atravesarla jamás
      const effectiveRadius = capturingBody.radius * capturingBody.currentScale;
      normalPlaneta.subVectors(nave.position, capturingBody.posVec);
      if (normalPlaneta.lengthSq() < 0.0001) {
        normalPlaneta.set(0, 0, 1);
      } else {
        normalPlaneta.normalize();
      }

      const standoffRadius = effectiveRadius + DISTANCIA_MINIMA_SUPERFICIE + 1.5;
      puntoFrentePlaneta.copy(capturingBody.posVec).addScaledVector(normalPlaneta, standoffRadius);
      nave.position.lerp(puntoFrentePlaneta, 1 - Math.exp(-4.5 * dt));

      // Garantizar barrera dura en todo momento
      enforcePlanetaryBarriers();

      nave.lookAt(capturingBody.posVec);
      nave.rotateY(Math.PI);

      // Efecto visual de aproximación continua (FOV + propulsores + resplandor suave que deja ver la Luna)
      const targetCaptureFov = Math.min(86, camPreset.baseFov + captureElapsed * 14);
      camara.fov = THREE.MathUtils.lerp(camara.fov, targetCaptureFov, 1 - Math.exp(-5 * dt));
      camara.updateProjectionMatrix();

      grupoPropulsores.visible = true;
      fuegoIzq.scale.set(1.3, 1.3, 2.6 + Math.random() * 1.4);
      fuegoDer.scale.set(1.3, 1.3, 2.6 + Math.random() * 1.4);

      // Distancia visual simulada en el HUD que baja suavemente mientras carga
      const simulatedAlt = Math.max(1, Math.round(120 / (1 + captureElapsed * 2.2)));
      hud.setTelemetry(`
        <span class="game-hud__title">Target: ${capturingBody.label} &middot; Orbital Descent</span>
        <span class="hud-ok">${capturingBody.label} Approach Altitude ${simulatedAlt} km</span><br>
        Descent Speed ${velocidadEntrada.toFixed(0)} km/s &middot; Locking landing zone&hellip;
      `);

      hud.setStatus(`
        <span class="hud-warning"><b>${capturingBody.captureStatusTitle}</b></span><br>
        ${capturingBody.captureStatusBody}
      `);

      // Iniciar la carga de la página de aterrizaje manteniendo la animación viva mientras responde el navegador
      if (captureElapsed > 0.35 && !redirigiendo) {
        redirigiendo = true;
        flashEntrada.style.opacity = '0.32';
        window.location.href = withBase(capturingBody.nextRoute);
      }
    }

    const rapidezActual =
      estado === 'acelerando_destino'
        ? velocidadEntrada
        : estado === 'volando'
          ? vectorVelocidad.length()
          : 0;
    speedStreaks.update(dt, rapidezActual);

    // ==========================================
    // 6. MOVIMIENTO DE CÁMARA CINEMÁTICO MEJORADO
    // ==========================================
    if (estado === 'volando' || estado === 'acelerando_destino') {
      nave.updateMatrixWorld();

      const speedNorm = THREE.MathUtils.clamp(rapidezActual / VELOCIDAD_MAXIMA, 0, 1.2);
      idealCamPos
        .copy(camPreset.offset)
        .add(
          new THREE.Vector3(
            -velocidadAngular.y * 1.35,
            velocidadAngular.x * 0.75,
            speedNorm * 1.8
          )
        )
        .applyMatrix4(nave.matrixWorld);

      const posSmoothing = 1 - Math.exp(-11 * dt);
      camara.position.lerp(idealCamPos, posSmoothing);

      if (estado === 'acelerando_destino' && capturingBody) {
        // Enfocarse directamente hacia el horizonte de la Luna/Marte mientras nos acercamos
        idealLookAt.copy(capturingBody.posVec);
        camara.position.x += (Math.random() - 0.5) * 0.28;
        camara.position.y += (Math.random() - 0.5) * 0.28;
      } else {
        idealLookAt
          .set(
            -velocidadAngular.y * 2.8,
            0.65 - velocidadAngular.x * 2.2,
            -camPreset.lookAhead
          )
          .applyMatrix4(nave.matrixWorld);
      }

      const lookSmoothing = 1 - Math.exp(-15 * dt);
      camFocusPoint.lerp(idealLookAt, lookSmoothing);

      if (estado === 'volando') {
        const targetFov = camPreset.baseFov + speedNorm * 14;
        camara.fov = THREE.MathUtils.lerp(camara.fov, targetFov, 1 - Math.exp(-6 * dt));
        camara.updateProjectionMatrix();

        upVector
          .set(-velocidadAngular.y * 0.12, 1, 0)
          .normalize()
          .applyQuaternion(nave.quaternion);
        camara.up.lerp(upVector, 1 - Math.exp(-8 * dt));
      }

      camara.lookAt(camFocusPoint);
    }

    renderer.render(escena, camara);
  }

  actualizar();
}