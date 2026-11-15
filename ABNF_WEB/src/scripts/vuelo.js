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
} from './game-shell';

const contenedor = viewport;
const hud = createHud();

contenedor.setAttribute('tabindex', '0');
contenedor.focus();
contenedor.addEventListener('click', () => contenedor.focus());

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x010106);

// Plano lejano ampliado a 12000 para soportar distancias interplanetarias realistas
const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 12000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
contenedor.appendChild(renderer.domElement);
observeViewportSize(renderer, camara, contenedor);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const cargador = new GLTFLoader();
cargador.setDRACOLoader(dracoLoader);

// --- SOL LEJANO A ESCALA ASTRONÓMICA ---
const POS_SOL = new THREE.Vector3(2200, 950, -4200);
const RADIO_SOL = 420;
const DISTANCIA_LIMITE_SOL = 950; // Zona de radiación térmica infranqueable

const grupoSol = new THREE.Group();
grupoSol.position.copy(POS_SOL);
escena.add(grupoSol);

const temporalSol = new THREE.Mesh(
  new THREE.SphereGeometry(RADIO_SOL, 32, 32),
  new THREE.MeshBasicMaterial({ color: 0xffaa00 })
);
grupoSol.add(temporalSol);

const haloSol = new THREE.Mesh(
  new THREE.SphereGeometry(RADIO_SOL * 1.25, 32, 32),
  new THREE.MeshBasicMaterial({
    color: 0xff6600,
    transparent: true,
    opacity: 0.25,
    side: THREE.BackSide
  })
);
grupoSol.add(haloSol);

cargador.load(
  withBase('/assets/games/sun.glb'),
  (gltf) => {
    grupoSol.remove(temporalSol);
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
    const escala = maxDim > 0 ? (RADIO_SOL * 2) / maxDim : 1;
    modeloSol.scale.setScalar(escala);

    const centro = caja.getCenter(new THREE.Vector3()).multiplyScalar(escala);
    modeloSol.position.sub(centro);

    grupoSol.add(modeloSol);
  },
  undefined,
  (err) => console.error('Failed to load sun.glb:', err)
);

// Iluminación para mantener visibles los colores de Tierra, Luna y Marte
escena.add(new THREE.AmbientLight(0xffffff, 1.4));
const solLuz = new THREE.DirectionalLight(0xfff5e6, 3.0);
solLuz.position.set(300, 150, 250);
escena.add(solLuz);

function crearCapaEstrellas(cantidad, rango, tamano, colorHex, opacidad = 1) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cantidad * 3);
  for (let i = 0; i < cantidad * 3; i++) {
    pos[i] = (Math.random() - 0.5) * rango;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: colorHex,
    size: tamano,
    transparent: opacidad < 1,
    opacity: opacidad,
    sizeAttenuation: true
  });
  return new THREE.Points(geo, mat);
}

const estrellasLejanas = crearCapaEstrellas(5000, 10000, 2.2, 0xffffff, 0.8);
const estrellasAzules  = crearCapaEstrellas(1600, 8000,  3.5, 0xaaccff, 0.9);
const estrellasCalidas = crearCapaEstrellas(800,  6500,  4.2, 0xffddaa, 1.0);
escena.add(estrellasLejanas, estrellasAzules, estrellasCalidas);

// --- PUNTOS DE PLANETAS LEJANOS ---
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
    sizeAttenuation: true
  });

  return new THREE.Points(geo, mat);
}

const planetasLejanos = crearPlanetasLejanos(220, 4800, 9000);
escena.add(planetasLejanos);

function crearPlaneta({ posicion, radio, colorRespaldo, urlGLB, atmosferaColor = null }) {
  const grupo = new THREE.Group();
  grupo.position.copy(posicion);
  escena.add(grupo);

  const temporal = new THREE.Mesh(
    new THREE.SphereGeometry(radio, 32, 32),
    new THREE.MeshStandardMaterial({ color: colorRespaldo, roughness: 0.8 })
  );
  grupo.add(temporal);

  if (atmosferaColor) {
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(radio * 1.06, 32, 32),
      new THREE.MeshBasicMaterial({
        color: atmosferaColor,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide
      })
    );
    grupo.add(halo);
  }

  if (urlGLB) {
    cargador.load(
      withBase(urlGLB),
      (gltf) => {
        grupo.remove(temporal);
        const modelo = gltf.scene;

        const caja = new THREE.Box3();
        modelo.traverse((hijo) => {
          if (hijo.isMesh) {
            hijo.material.side = THREE.DoubleSide;

            if (hijo.material.metalness !== undefined) {
              hijo.material.metalness = 0.0;
              hijo.material.roughness = 0.8;
            }

            const nombre = hijo.name.toLowerCase();
            if ((nombre.includes('cloud') || nombre.includes('atmos')) && !hijo.material.map) {
              hijo.visible = false;
            }

            hijo.material.needsUpdate = true;
            caja.expandByObject(hijo);
          }
        });

        const tamano = caja.getSize(new THREE.Vector3());
        const maxDim = Math.max(tamano.x, tamano.y, tamano.z);
        const escala = maxDim > 0 ? (radio * 2) / maxDim : 1;
        modelo.scale.setScalar(escala);

        const centro = caja.getCenter(new THREE.Vector3()).multiplyScalar(escala);
        modelo.position.sub(centro);

        grupo.add(modelo);
      },
      undefined,
      (err) => console.error('Failed to load model:', urlGLB, err)
    );
  }

  return grupo;
}

// --- CUERPOS CELESTES CON PROPORCIONES Y DISTANCIAS REALISTAS ---
// 1. Tierra: punto de partida cercano (órbita terrestre)
const POS_TIERRA = new THREE.Vector3(-45, -30, 140);
const RADIO_TIERRA = 55;
const tierra = crearPlaneta({
  posicion: POS_TIERRA,
  radio: RADIO_TIERRA,
  colorRespaldo: 0x2266cc,
  atmosferaColor: 0x44aaff,
  urlGLB: '/assets/games/earth.glb'
});

// 2. Luna: ~1/4 del tamaño de la Tierra y orbitando en su vecindad
const POS_LUNA = new THREE.Vector3(-240, 45, -280);
const RADIO_LUNA = 15;
const luna = crearPlaneta({
  posicion: POS_LUNA,
  radio: RADIO_LUNA,
  colorRespaldo: 0x888888,
  urlGLB: '/assets/games/Lune.glb'
});

// 3. Marte: ~53% del tamaño de la Tierra y a distancia interplanetaria
const POS_MARTE = new THREE.Vector3(380, -35, -1350);
const RADIO_MARTE = 30;
const marte = crearPlaneta({
  posicion: POS_MARTE,
  radio: RADIO_MARTE,
  colorRespaldo: 0xc1440e,
  atmosferaColor: 0xff6622,
  urlGLB: '/assets/games/mars.glb'
});

const nave = new THREE.Group();
const modeloVisualNave = new THREE.Group();
nave.add(modeloVisualNave);
escena.add(nave);

const cuerpoTemporal = new THREE.Mesh(
  new THREE.ConeGeometry(1, 3.5, 12).rotateX(-Math.PI / 2),
  new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.3 })
);
modeloVisualNave.add(cuerpoTemporal);

// --- PROPULSORES NARANJAS (SOLO LOS 2 LATERALES) ---
const grupoPropulsores = new THREE.Group();
grupoPropulsores.position.z = 2.2;
modeloVisualNave.add(grupoPropulsores);

const fuegoIzq = new THREE.Mesh(
  new THREE.ConeGeometry(0.24, 1.1, 8).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff7711 })
);
fuegoIzq.position.set(-0.72, 0, 0.55);
grupoPropulsores.add(fuegoIzq);

const fuegoDer = new THREE.Mesh(
  new THREE.ConeGeometry(0.24, 1.1, 8).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xff7711 })
);
fuegoDer.position.set(0.72, 0, 0.55);
grupoPropulsores.add(fuegoDer);

cargador.load(
  withBase('/assets/games/spaceship.glb'),
  (gltf) => {
    modeloVisualNave.remove(cuerpoTemporal);
    const modeloNave = gltf.scene;

    const caja = new THREE.Box3();
    modeloNave.traverse((hijo) => {
      if (hijo.isMesh) {
        hijo.material.side = THREE.DoubleSide;
        if (hijo.material.metalness !== undefined) {
          hijo.material.metalness = 0.2;
        }
        caja.expandByObject(hijo);
      }
    });

    const tamano = caja.getSize(new THREE.Vector3());
    const maxDim = Math.max(tamano.x, tamano.y, tamano.z);
    const largoDeseado = 4.5;
    const escala = maxDim > 0 ? largoDeseado / maxDim : 1;
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
  background: 'radial-gradient(circle, #ffaa44, #d9381e)',
  opacity: '0',
  pointerEvents: 'none',
  transition: 'opacity 0.5s ease',
  zIndex: '10'
});
contenedor.appendChild(flashEntrada);

let estado = 'volando';
let velocidad = 0;
let redirigiendo = false;

function reiniciar() {
  nave.position.set(0, 0, 0);
  nave.rotation.set(0, 0, 0);
  modeloVisualNave.rotation.set(0, 0, 0);
  velocidad = 0;
  estado = 'volando';
  redirigiendo = false;
  flashEntrada.style.opacity = '0';
  camara.fov = 60;
  camara.updateProjectionMatrix();
  camara.position.set(0, 3.5, 12);
}
reiniciar();
onMissionRestart(reiniciar);

const teclas = {};
window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    e.preventDefault();
  }
  const k = e.key.toLowerCase();
  teclas[e.code] = true;
  teclas[k] = true;

  if ((e.code === 'KeyR' || k === 'r') && estado !== 'volando') {
    reiniciar();
  }
}, { passive: false });

window.addEventListener('keyup', (e) => {
  teclas[e.code] = false;
  teclas[e.key.toLowerCase()] = false;
});

window.addEventListener('blur', () => {
  for (const k in teclas) teclas[k] = false;
});

const reloj = new THREE.Clock();
const gate = createRenderGate(contenedor);

function actualizar() {
  requestAnimationFrame(actualizar);

  const dt = Math.min(reloj.getDelta(), 0.05);
  if (!gate.active) return;

  tierra.rotation.y += 0.06 * dt;
  luna.rotation.y   += 0.10 * dt;
  marte.rotation.y  += 0.12 * dt;
  grupoSol.rotation.y += 0.02 * dt;

  const pulsoSol = 1 + Math.sin(reloj.elapsedTime * 2) * 0.03;
  haloSol.scale.setScalar(pulsoSol);

  if (estado === 'volando') {
    const acelerando = teclas['KeyW'] || teclas['w'] || teclas['Space'];
    const frenando   = teclas['KeyS'] || teclas['s'];

    if (acelerando) {
      velocidad = Math.min(velocidad + 140 * dt, 320);
      grupoPropulsores.visible = true;
      fuegoIzq.scale.z = 0.8 + Math.random() * 0.6;
      fuegoDer.scale.z = 0.8 + Math.random() * 0.6;
    } else if (frenando) {
      velocidad = Math.max(velocidad - 180 * dt, 0);
      grupoPropulsores.visible = false;
    } else {
      velocidad *= 0.985;
      if (velocidad < 0.1) velocidad = 0;
      grupoPropulsores.visible = false;
    }

    const velGiro = 1.8;
    let giroY = 0;
    let giroX = 0;

    if (teclas['ArrowLeft'] || teclas['KeyA'] || teclas['a'])  giroY += 1;
    if (teclas['ArrowRight'] || teclas['KeyD'] || teclas['d']) giroY -= 1;
    if (teclas['ArrowUp'] || teclas['KeyI'])                   giroX += 1;
    if (teclas['ArrowDown'] || teclas['KeyK'])                 giroX -= 1;

    nave.rotateY(giroY * velGiro * dt);
    nave.rotateX(giroX * velGiro * dt);

    const inclinacionObjetivo = giroY * 0.45;
    modeloVisualNave.rotation.z = THREE.MathUtils.lerp(
      modeloVisualNave.rotation.z,
      inclinacionObjetivo,
      8 * dt
    );

    nave.translateZ(-velocidad * dt);

    const distLuna   = nave.position.distanceTo(POS_LUNA)   - RADIO_LUNA;
    const distMarte  = nave.position.distanceTo(POS_MARTE)  - RADIO_MARTE;
    const distTierra = nave.position.distanceTo(POS_TIERRA) - RADIO_TIERRA;
    const distSol    = nave.position.distanceTo(POS_SOL)    - RADIO_SOL;

    if (distSol < DISTANCIA_LIMITE_SOL) {
      estado = 'fallo_sol';
      velocidad = 0;
      grupoPropulsores.visible = false;
      flashEntrada.style.opacity = '0.45';
    }

    if (distLuna < 12) {
      estado = 'fallo_luna';
      velocidad = 0;
      grupoPropulsores.visible = false;
    }

    if (distTierra < 15) {
      estado = 'fallo_tierra';
      velocidad = 0;
      grupoPropulsores.visible = false;
    }

    if (distMarte < 45) {
      estado = 'acelerando_marte';
      modeloVisualNave.rotation.z = 0;
      nave.lookAt(POS_MARTE);
      nave.rotateY(Math.PI);
    }

    hud.setTelemetry(`
      <span class="game-hud__title">Mission: reach Mars (the red planet)</span>
      Mars ${Math.max(0, distMarte).toFixed(0)} km · Moon ${Math.max(0, distLuna).toFixed(0)} km · Earth ${Math.max(0, distTierra).toFixed(0)} km<br>
      Speed ${velocidad.toFixed(0)} km/s
      <span class="game-hud__controls">[W / Space] Thrust · [S] Brake · [A / D / &larr; &rarr;] Turn · [&uarr; &darr;] Pitch</span>
    `);
    hud.setStatus('');
  }

  else if (estado === 'fallo_sol') {
    hud.setStatus(`
      <span class="hud-danger"><b>CRITICAL HEAT WARNING</b></span><br>
      Solar radiation exceeded hull limits — you cannot approach the Sun.<br>
      Press <b>[ R ]</b> or hit <b>Restart</b> to launch again.
    `);
  }

  else if (estado === 'fallo_luna') {
    hud.setStatus(`
      <span class="hud-danger"><b>MISSION FAILED</b></span><br>
      You approached the Moon — wrong target.<br>
      Press <b>[ R ]</b> or hit <b>Restart</b> to try again.
    `);
  }

  else if (estado === 'fallo_tierra') {
    hud.setStatus(`
      <span class="hud-danger"><b>MISSION ABORTED</b></span><br>
      You returned to Earth's atmosphere.<br>
      Press <b>[ R ]</b> or hit <b>Restart</b> to launch again towards Mars.
    `);
  }

  else if (estado === 'acelerando_marte') {
    velocidad += 350 * dt;
    nave.translateZ(-velocidad * dt);

    if (camara.fov < 115) {
      camara.fov += 90 * dt;
      camara.updateProjectionMatrix();
    }

    grupoPropulsores.visible = true;
    fuegoIzq.scale.set(1.3, 1.3, 3 + Math.random() * 1.5);
    fuegoDer.scale.set(1.3, 1.3, 3 + Math.random() * 1.5);

    hud.setStatus(`
      <span class="hud-warning"><b>ENTERING MARS ORBIT</b></span><br>
      Starting descent sequence&hellip;
    `);

    if (nave.position.distanceTo(POS_MARTE) < RADIO_MARTE && !redirigiendo) {
      redirigiendo = true;
      flashEntrada.style.opacity = '1';
      setTimeout(() => {
        window.location.href = withBase('/aterrizaje');
      }, 500);
    }
  }

  if (estado === 'volando' || estado === 'acelerando_marte') {
    nave.updateMatrixWorld();
    const offsetCamara = new THREE.Vector3(0, 3.5, 12).applyMatrix4(nave.matrixWorld);
    camara.position.lerp(offsetCamara, 0.15);

    if (estado === 'acelerando_marte') {
      camara.position.x += (Math.random() - 0.5) * 0.6;
      camara.position.y += (Math.random() - 0.5) * 0.6;
    }

    camara.lookAt(nave.position);
  }

  renderer.render(escena, camara);
}
actualizar();