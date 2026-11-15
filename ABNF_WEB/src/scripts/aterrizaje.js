import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// ---------- 0. Contenedor a Pantalla Completa ----------
const contenedor = document.getElementById('juego');
Object.assign(document.body.style, {
  margin: '0',
  padding: '0',
  overflow: 'hidden',
  backgroundColor: '#c8643b'
});
Object.assign(contenedor.style, {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  outline: 'none'
});

const ancho = () => window.innerWidth;
const alto  = () => window.innerHeight;

contenedor.setAttribute('tabindex', '0');
contenedor.focus();
contenedor.addEventListener('click', () => contenedor.focus());

// ---------- 1. Escena, cámara y renderer ----------
const escena = new THREE.Scene();
escena.background = new THREE.Color(0xc8643b);
escena.fog = new THREE.FogExp2(0xc8643b, 0.0085);

const camara = new THREE.PerspectiveCamera(60, ancho() / alto(), 0.1, 2000);
camara.position.set(0, 8, 22);
camara.lookAt(0, 6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(ancho(), alto());
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
contenedor.appendChild(renderer.domElement);

// ---------- 2. Luces ----------
escena.add(new THREE.HemisphereLight(0xffb88c, 0x5c2410, 1.35));
const sol = new THREE.DirectionalLight(0xfff0dd, 2.5);
sol.position.set(18, 35, 22);
sol.castShadow = true;
escena.add(sol);

// ---------- 3. Cargadores GLTF + Draco ----------
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const cargador = new GLTFLoader();
cargador.setDRACOLoader(dracoLoader);

// Textura procedural marciana infinita para el horizonte
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
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(130, 40, 15, 0.25)' : 'rgba(220, 110, 60, 0.2)';
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

// Suelo base gigantesco para cubrir todo el campo de visión en cualquier monitor
const sueloBase = new THREE.Mesh(
  new THREE.PlaneGeometry(2000, 2000),
  new THREE.MeshStandardMaterial({
    map: crearTexturaMarte(),
    roughness: 0.95,
    metalness: 0.0
  })
);
sueloBase.rotation.x = -Math.PI / 2;
sueloBase.position.y = -0.05;
sueloBase.receiveShadow = true;
escena.add(sueloBase);

// Modelo 3D del escenario de Marte con el Rover Perseverance
const grupoEscenario = new THREE.Group();
escena.add(grupoEscenario);

cargador.load(
  '/assets/games/perseverance_rover_on_mars.glb',
  (gltf) => {
    const modeloSuelo = gltf.scene;

    const caja = new THREE.Box3();
    modeloSuelo.traverse((hijo) => {
      if (hijo.isMesh) {
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
      }
    });

    const tamano = caja.getSize(new THREE.Vector3());
    const anchoActual = Math.max(tamano.x, tamano.z);
    // Escalado amplio para cubrir todo el ancho de la pantalla ultrawide / 4K
    const escala = anchoActual > 0 ? 95 / anchoActual : 1;
    modeloSuelo.scale.setScalar(escala);

    const cajaEscalada = new THREE.Box3().setFromObject(modeloSuelo);
    const centro = cajaEscalada.getCenter(new THREE.Vector3());

    modeloSuelo.position.x -= centro.x;
    modeloSuelo.position.z -= centro.z;
    modeloSuelo.position.y -= (cajaEscalada.max.y - 1.5);

    grupoEscenario.add(modeloSuelo);
  },
  undefined,
  (err) => console.error('Error cargando perseverance_rover_on_mars.glb:', err)
);

// Plataforma de aterrizaje con luces guía
const MITAD_PLATAFORMA = 1.6;
const plataforma = new THREE.Group();
plataforma.position.y = 0.08;
escena.add(plataforma);

const basePlataforma = new THREE.Mesh(
  new THREE.BoxGeometry(MITAD_PLATAFORMA * 2, 0.16, 3.4),
  new THREE.MeshStandardMaterial({
    color: 0x3b4248,
    metalness: 0.6,
    roughness: 0.4
  })
);
basePlataforma.receiveShadow = true;
plataforma.add(basePlataforma);

const bordeLuminoso = new THREE.Mesh(
  new THREE.BoxGeometry(MITAD_PLATAFORMA * 2 + 0.14, 0.08, 3.54),
  new THREE.MeshBasicMaterial({ color: 0x00ffcc })
);
bordeLuminoso.position.y = 0.02;
plataforma.add(bordeLuminoso);

// ---------- 4. Nave y llama ----------
const nave = new THREE.Group();
escena.add(nave);

const conoTemporal = new THREE.Mesh(
  new THREE.ConeGeometry(0.5, 1.2, 16),
  new THREE.MeshStandardMaterial({ color: 0xffffff })
);
nave.add(conoTemporal);

const materialesNave = [];
cargador.load(
  '/assets/games/spaceship.glb',
  (gltf) => {
    nave.remove(conoTemporal);
    const modeloNave = gltf.scene;

    const caja = new THREE.Box3();
    modeloNave.traverse((hijo) => {
      if (hijo.isMesh) {
        hijo.castShadow = true;
        const mats = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
        mats.forEach((mat) => {
          mat.side = THREE.DoubleSide;
          if (mat.metalness !== undefined) mat.metalness = 0.25;
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          materialesNave.push(mat);
        });
        caja.expandByObject(hijo);
      }
    });

    const tamano = caja.getSize(new THREE.Vector3());
    const maxDim = Math.max(tamano.x, tamano.y, tamano.z);
    const escala = maxDim > 0 ? 1.8 / maxDim : 1;
    modeloNave.scale.setScalar(escala);

    const centro = caja.getCenter(new THREE.Vector3()).multiplyScalar(escala);
    modeloNave.position.sub(centro);
    nave.add(modeloNave);
  },
  undefined,
  (err) => console.error('Error cargando spaceship.glb:', err)
);

function pintarEstadoNave(hexColor) {
  conoTemporal.material.color.setHex(hexColor);
  materialesNave.forEach((mat) => {
    if (mat.emissive) {
      mat.emissive.setHex(hexColor === 0xffffff ? 0x000000 : hexColor);
      mat.emissiveIntensity = hexColor === 0xffffff ? 0 : 0.45;
    }
  });
}

const llama = new THREE.Mesh(
  new THREE.ConeGeometry(0.32, 0.9, 12),
  new THREE.MeshBasicMaterial({ color: 0xff8800 })
);
llama.rotation.x = Math.PI;
llama.position.y = -0.95;
llama.visible = false;
nave.add(llama);

// ---------- 5. Física Realista de Marte ----------
const GRAVEDAD = -3.72;          // Gravedad real de Marte en m/s² (38% de la Tierra)
const EMPUJE = 9.6;              // Empuje calibrado (~2.5x la gravedad marciana)
const EMPUJE_LATERAL = 3.2;      // Propulsores de maniobra lateral
const MITAD_ALTURA = 0.6;
const TECHO = 25;
const LIMITE_X = 22;
const VEL_SEGURA = 2.5;          // Impacto vertical máximo seguro (m/s)
const VEL_LATERAL_SEGURA = 2.2;  // Impacto horizontal máximo seguro (m/s)
const COMBUSTIBLE_MAX = 100;
const GASTO = 22;                // Consumo por segundo del motor principal
const GASTO_LATERAL = 9;         // Consumo por segundo de maniobra lateral

let posX, posY, velX, velY, combustible, estado, velImpacto, motivo = '';

function reiniciar() {
  posX = 0;
  posY = 16;
  velX = 0;
  velY = 0;
  combustible = COMBUSTIBLE_MAX;
  estado = 'volando';
  velImpacto = 0;
  pintarEstadoNave(0xffffff);
  bordeLuminoso.material.color.setHex(0x00ffcc);
  nave.rotation.z = 0;

  let x;
  do { x = (Math.random() * 20) - 10; } while (Math.abs(x) < 3.5);
  plataforma.position.x = x;
}
reiniciar();

// ---------- 6. Controles ----------
const teclas = {};
const TECLAS_JUEGO = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
window.addEventListener('keydown', (e) => {
  if (TECLAS_JUEGO.includes(e.code)) e.preventDefault();
  teclas[e.code] = true;
  teclas[e.key.toLowerCase()] = true;
}, { passive: false });

window.addEventListener('keyup', (e) => {
  teclas[e.code] = false;
  teclas[e.key.toLowerCase()] = false;
});

// ---------- 7. Ciclo del juego ----------
const hud = document.getElementById('hud');
const reloj = new THREE.Clock();

function actualizar() {
  const dt = Math.min(reloj.getDelta(), 0.05);
  let motorPrendido = false;

  if (estado === 'volando') {
    let accY = GRAVEDAD;
    let accX = 0;

    motorPrendido = (teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'] || teclas['w']) && combustible > 0;
    if (motorPrendido) {
      accY += EMPUJE;
      combustible -= GASTO * dt;
    }

    const izquierda = teclas['ArrowLeft'] || teclas['KeyA'] || teclas['a'];
    const derecha   = teclas['ArrowRight'] || teclas['KeyD'] || teclas['d'];
    if ((izquierda || derecha) && combustible > 0) {
      if (izquierda) accX -= EMPUJE_LATERAL;
      if (derecha)   accX += EMPUJE_LATERAL;
      combustible -= GASTO_LATERAL * dt;
    }
    combustible = Math.max(0, combustible);

    // Resistencia atmosférica tenue de Marte (1% de la Tierra)
    velX = (velX + accX * dt) * (1 - 0.04 * dt);
    velY = (velY + accY * dt) * (1 - 0.02 * dt);
    posX += velX * dt;
    posY += velY * dt;

    if (Math.abs(posX) > LIMITE_X) {
      posX = Math.sign(posX) * LIMITE_X;
      velX = 0;
    }
    if (posY > TECHO) {
      posY = TECHO;
      velY = Math.min(velY, 0);
    }

    if (posY <= MITAD_ALTURA) {
      posY = MITAD_ALTURA;
      velImpacto = Math.abs(velY);
      const velLateralImpacto = Math.abs(velX);
      const enPlataforma = Math.abs(posX - plataforma.position.x) <= MITAD_PLATAFORMA;
      velX = 0;
      velY = 0;

      if (velImpacto > VEL_SEGURA) {
        estado = 'estrellado';
        motivo = `Caíste muy rápido (${velImpacto.toFixed(1)} m/s).`;
        pintarEstadoNave(0xff3333);
        bordeLuminoso.material.color.setHex(0xff3333);
      } else if (velLateralImpacto > VEL_LATERAL_SEGURA) {
        estado = 'estrellado';
        motivo = `Ibas muy rápido de lado (${velLateralImpacto.toFixed(1)} m/s).`;
        pintarEstadoNave(0xff3333);
        bordeLuminoso.material.color.setHex(0xff3333);
      } else if (!enPlataforma) {
        estado = 'fuera';
        pintarEstadoNave(0xffcc33);
        bordeLuminoso.material.color.setHex(0xffcc33);
      } else {
        estado = 'aterrizado';
        pintarEstadoNave(0x44ff66);
        bordeLuminoso.material.color.setHex(0x44ff66);
      }
    }
  } else if (teclas['KeyR'] || teclas['r']) {
    reiniciar();
  }

  nave.position.set(posX, posY, 0);
  nave.rotation.z = estado === 'volando' ? -velX * 0.06 : nave.rotation.z;

  llama.visible = motorPrendido;
  if (motorPrendido) llama.scale.y = 0.8 + Math.random() * 0.4;

  const caida = -velY;
  const altura = posY - MITAD_ALTURA;
  const rojo = '#ff5555';
  const colorCaida = caida > VEL_SEGURA ? rojo : '#ffffff';
  const colorLateral = Math.abs(velX) > VEL_LATERAL_SEGURA ? rojo : '#ffffff';
  const colorComb = combustible < 25 ? rojo : '#ffffff';

  let mensaje = '';
  if (estado === 'aterrizado') mensaje = '¡Aterrizaje exitoso en Marte! (R para reiniciar)';
  if (estado === 'fuera')      mensaje = 'Aterrizaste fuera de la plataforma. (R para reiniciar)';
  if (estado === 'estrellado') mensaje = `Te estrellaste. ${motivo} (R para reiniciar)`;

  if (hud) {
    hud.innerHTML = `
      <b>GRAVEDAD MARCIANA: 3.72 m/s²</b><br>
      Altitud: ${altura.toFixed(1)} m<br>
      <span style="color:${colorCaida}">Velocidad vertical: ${caida.toFixed(1)} m/s</span><br>
      <span style="color:${colorLateral}">Velocidad lateral: ${Math.abs(velX).toFixed(1)} m/s</span><br>
      <span style="color:${colorComb}">Combustible: ${Math.round(combustible)}%</span><br>
      <br>
      <b>${mensaje}</b><br>
      <small>Espacio/↑/W: motor · ←/→/AD: moverse · R: reiniciar</small>
    `;
  }

  renderer.render(escena, camara);
  requestAnimationFrame(actualizar);
}
actualizar();

// ---------- 8. Ajustar a pantalla completa ----------
window.addEventListener('resize', () => {
  camara.aspect = ancho() / alto();
  camara.updateProjectionMatrix();
  renderer.setSize(ancho(), alto());
});