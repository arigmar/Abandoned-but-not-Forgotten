import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const contenedor = document.getElementById('juego');
const ancho = () => contenedor.clientWidth || window.innerWidth;
const alto  = () => contenedor.clientHeight || window.innerHeight;
const hud = document.getElementById('hud');

contenedor.setAttribute('tabindex', '0');
contenedor.style.outline = 'none';
contenedor.focus();
contenedor.addEventListener('click', () => contenedor.focus());

const escena = new THREE.Scene();
escena.background = new THREE.Color(0x010106);

const camara = new THREE.PerspectiveCamera(60, ancho() / alto(), 0.1, 4000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(ancho(), alto());
renderer.outputColorSpace = THREE.SRGBColorSpace;
contenedor.appendChild(renderer.domElement);

escena.add(new THREE.AmbientLight(0xffffff, 1.4));
const sol = new THREE.DirectionalLight(0xfff5e6, 3.0);
sol.position.set(300, 150, 250);
escena.add(sol);

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

const estrellasLejanas = crearCapaEstrellas(4000, 3500, 1.2, 0xffffff, 0.8);
const estrellasAzules  = crearCapaEstrellas(1200, 2500, 2.2, 0xaaccff, 0.9);
const estrellasCalidas = crearCapaEstrellas(600,  2000, 2.8, 0xffddaa, 1.0);
escena.add(estrellasLejanas, estrellasAzules, estrellasCalidas);

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const cargador = new GLTFLoader();
cargador.setDRACOLoader(dracoLoader);

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
      urlGLB,
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
      (err) => console.error('Error cargando:', urlGLB, err)
    );
  }

  return grupo;
}

const POS_TIERRA = new THREE.Vector3(-40, -35, 130);
const RADIO_TIERRA = 55;
const tierra = crearPlaneta({
  posicion: POS_TIERRA,
  radio: RADIO_TIERRA,
  colorRespaldo: 0x2266cc,
  atmosferaColor: 0x44aaff,
  urlGLB: '/assets/games/earth.glb'
});

const POS_LUNA = new THREE.Vector3(-180, 30, -350);
const RADIO_LUNA = 25;
const luna = crearPlaneta({
  posicion: POS_LUNA,
  radio: RADIO_LUNA,
  colorRespaldo: 0x888888,
  urlGLB: '/assets/games/Lune.glb'
});

const POS_MARTE = new THREE.Vector3(160, -20, -500);
const RADIO_MARTE = 45;
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

const fuego = new THREE.Mesh(
  new THREE.ConeGeometry(0.55, 2.2, 8).rotateX(Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x00ffff })
);
fuego.position.z = 2.4;
modeloVisualNave.add(fuego);

cargador.load(
  '/assets/games/spaceship.glb',
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
  (err) => console.error('Error cargando spaceship.glb:', err)
);

const flashEntrada = document.createElement('div');
Object.assign(flashEntrada.style, {
  position: 'fixed',
  inset: '0',
  background: 'radial-gradient(circle, #ffaa44, #d9381e)',
  opacity: '0',
  pointerEvents: 'none',
  transition: 'opacity 0.5s ease',
  zIndex: '9999'
});
document.body.appendChild(flashEntrada);

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
}
reiniciar();

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

function actualizar() {
  const dt = Math.min(reloj.getDelta(), 0.05);

  tierra.rotation.y += 0.06 * dt;
  luna.rotation.y   += 0.10 * dt;
  marte.rotation.y  += 0.12 * dt;

  if (estado === 'volando') {
    const acelerando = teclas['KeyW'] || teclas['w'] || teclas['Space'];
    const frenando   = teclas['KeyS'] || teclas['s'];

    if (acelerando) {
      velocidad = Math.min(velocidad + 75 * dt, 150);
      fuego.visible = true;
      fuego.scale.z = 0.8 + Math.random() * 0.6;
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

    if (distLuna < 15) {
      estado = 'fallo_luna';
      velocidad = 0;
      fuego.visible = false;
    }

    if (distTierra < 15) {
      estado = 'fallo_tierra';
      velocidad = 0;
      fuego.visible = false;
    }

    if (distMarte < 40) {
      estado = 'acelerando_marte';
      modeloVisualNave.rotation.z = 0;
      nave.lookAt(POS_MARTE);
      nave.rotateY(Math.PI);
    }

    if (hud) {
      hud.innerHTML = `
        <b>MISIÓN: LLEGA A MARTE (Planeta Rojo)</b><br>
        Marte: ${Math.max(0, distMarte).toFixed(0)} km | Luna: ${Math.max(0, distLuna).toFixed(0)} km | Tierra: ${Math.max(0, distTierra).toFixed(0)} km<br>
        Velocidad: ${velocidad.toFixed(0)} km/s — [W/Espacio] Acelerar | [A/D/Flechas] Girar | [Arriba/Abajo] Subir/Bajar
      `;
    }
  }

  else if (estado === 'fallo_luna') {
    if (hud) {
      hud.innerHTML = `
        <span style="color: #ff5555;"><b>¡MISIÓN FALLIDA!</b></span><br>
        Te acercaste a la Luna (objetivo equivocado).<br>
        Presiona <b>[ R ]</b> para volver a intentarlo.
      `;
    }
  }

  else if (estado === 'fallo_tierra') {
    if (hud) {
      hud.innerHTML = `
        <span style="color: #ff5555;"><b>¡MISIÓN ABORTADA!</b></span><br>
        Regresaste a la atmósfera de la Tierra.<br>
        Presiona <b>[ R ]</b> para despegar de nuevo hacia Marte.
      `;
    }
  }

  else if (estado === 'acelerando_marte') {
    velocidad += 350 * dt;
    nave.translateZ(-velocidad * dt);

    if (camara.fov < 115) {
      camara.fov += 90 * dt;
      camara.updateProjectionMatrix();
    }

    fuego.visible = true;
    fuego.scale.set(1.5, 1.5, 4 + Math.random() * 2);

    if (hud) {
      hud.innerHTML = `
        <span style="color: #ffaa00;"><b>¡ENTRANDO EN ÓRBITA DE MARTE!</b></span><br>
        Iniciando secuencia de descenso...
      `;
    }

    if (nave.position.distanceTo(POS_MARTE) < RADIO_MARTE && !redirigiendo) {
      redirigiendo = true;
      flashEntrada.style.opacity = '1';
      setTimeout(() => {
        window.location.href = '/aterrizaje';
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
  requestAnimationFrame(actualizar);
}
actualizar();

window.addEventListener('resize', () => {
  camara.aspect = ancho() / alto();
  camara.updateProjectionMatrix();
  renderer.setSize(ancho(), alto());
});