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
  onLaunchOrbit,
  onExploreSurface,
} from './game-shell';

const DRACO_DECODER_URL = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

/**
 * Adds distant Earth (`earth.glb` with spherical fallback) to a landing skybox.
 */
export function buildDistantEarth(scene, loader, options = {}) {
  const {
    pos = [-140, 110, -650],
    fallbackRadius = 5.5,
    scaleDiameter = 11,
    haloRadius = 7.2,
    haloColor = 0x88ccff,
    haloOpacity = 0.25,
    filterNonMappedMeshes = true,
  } = options;

  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);
  scene.add(group);

  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(fallbackRadius, 24, 24),
    new THREE.MeshBasicMaterial({ color: 0x66b2ff, fog: false })
  );
  group.add(fallback);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(haloRadius, 24, 24),
    new THREE.MeshBasicMaterial({
      color: haloColor,
      transparent: true,
      opacity: haloOpacity,
      side: THREE.BackSide,
      fog: false,
    })
  );
  group.add(halo);

  loader.load(
    withAssetUrl('/assets/games/earth.glb'),
    (gltf) => {
      group.remove(fallback);
      const model = gltf.scene;
      const box = new THREE.Box3();
      model.traverse((child) => {
        if (!child.isMesh) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((mat) => {
          mat.side = THREE.DoubleSide;
          mat.fog = false;
          if (mat.metalness !== undefined) {
            mat.metalness = 0.0;
            mat.roughness = 0.85;
          }
          if (mat.map) {
            mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.map.needsUpdate = true;
          }
          if (filterNonMappedMeshes && !mat.map) {
            child.visible = false;
          }
          mat.needsUpdate = true;
        });

        const name = `${child.name} ${child.parent?.name || ''}`.toLowerCase();
        if (
          name.includes('cloud') ||
          name.includes('atmos') ||
          name.includes('nube') ||
          name.includes('outer')
        ) {
          child.visible = false;
        }
        if (child.visible) box.expandByObject(child);
      });

      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? scaleDiameter / maxDim : 1;
      model.scale.setScalar(scale);

      const center = box.getCenter(new THREE.Vector3()).multiplyScalar(scale);
      model.position.sub(center);
      group.add(model);
    },
    undefined,
    (err) => {
      console.error('Failed to load distant Earth, keeping fallback sphere:', err);
      group.add(fallback);
    }
  );

  return group;
}

/**
 * Starts an interactive 3D powered descent, landing, and return-to-orbit
 * mission inside `#juego`.
 */
export function launchLandingMission(config) {
  if (!viewport) return;

  const contenedor = viewport;
  const hud = createHud();

  contenedor.setAttribute('tabindex', '0');
  contenedor.focus();
  contenedor.addEventListener('click', () => contenedor.focus());

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(config.skyColor);
  if (config.fogDensity && config.fogDensity > 0) {
    escena.fog = new THREE.FogExp2(config.fogColor ?? config.skyColor, config.fogDensity);
  }

  const defaultCamPos = config.cameraPos ?? [0, 8, 22];
  const defaultCamLook = config.cameraLookAt ?? [0, 6, 0];
  const camara = new THREE.PerspectiveCamera(60, 1, 0.1, 3000);
  camara.position.set(defaultCamPos[0], defaultCamPos[1], defaultCamPos[2]);
  camara.lookAt(defaultCamLook[0], defaultCamLook[1], defaultCamLook[2]);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  if (config.shadowType) {
    renderer.shadowMap.type = config.shadowType;
  }
  contenedor.appendChild(renderer.domElement);
  observeViewportSize(renderer, camara, contenedor);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_URL);
  const cargador = new GLTFLoader();
  cargador.setDRACOLoader(dracoLoader);

  const padDefaultColor = config.padDefaultColor ?? 0x00ffcc;
  const MITAD_PLATAFORMA = config.halfPadWidth ?? 1.6;

  const plataforma = new THREE.Group();
  plataforma.position.y = 0.08;
  escena.add(plataforma);

  const basePlataforma = new THREE.Mesh(
    new THREE.BoxGeometry(MITAD_PLATAFORMA * 2, 0.16, 3.4),
    new THREE.MeshStandardMaterial({
      color: 0x3b4248,
      metalness: 0.6,
      roughness: 0.4,
    })
  );
  basePlataforma.receiveShadow = true;
  plataforma.add(basePlataforma);

  const bordeLuminoso = new THREE.Mesh(
    new THREE.BoxGeometry(MITAD_PLATAFORMA * 2 + 0.14, 0.08, 3.54),
    new THREE.MeshBasicMaterial({ color: padDefaultColor })
  );
  bordeLuminoso.position.y = 0.02;
  plataforma.add(bordeLuminoso);

  const envHooks = config.buildEnvironment?.({
    scene: escena,
    loader: cargador,
    renderer,
    padGroup: plataforma,
    halfPadWidth: MITAD_PLATAFORMA,
  });

  const nave = new THREE.Group();
  escena.add(nave);

  const neutralConeColor = config.neutralConeColor ?? 0xd8e0ec;
  const conoTemporal = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: neutralConeColor })
  );
  nave.add(conoTemporal);

  const materialesNave = [];
  cargador.load(
    withAssetUrl('/assets/games/spaceship.glb'),
    (gltf) => {
      nave.remove(conoTemporal);
      const modeloNave = gltf.scene;
      const caja = new THREE.Box3();
      modeloNave.traverse((hijo) => {
        if (!hijo.isMesh) return;
        hijo.castShadow = true;
        const mats = Array.isArray(hijo.material) ? hijo.material : [hijo.material];
        mats.forEach((mat) => {
          mat.side = THREE.DoubleSide;
          if (mat.metalness !== undefined) mat.metalness = 0.25;
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          materialesNave.push(mat);
        });
        caja.expandByObject(hijo);
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
    (err) => console.error('Failed to load spaceship.glb:', err)
  );

  function pintarEstadoNave(hexColor) {
    conoTemporal.material.color.setHex(hexColor === null ? neutralConeColor : hexColor);
    materialesNave.forEach((mat) => {
      if (mat.emissive) {
        mat.emissive.setHex(hexColor === null ? 0x000000 : hexColor);
        mat.emissiveIntensity = hexColor === null ? 0 : 0.45;
      }
    });
  }

  const llama = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.9, 12),
    new THREE.MeshBasicMaterial({ color: config.flameColor ?? 0xff8800 })
  );
  llama.rotation.x = Math.PI;
  llama.position.y = -0.95;
  llama.visible = false;
  nave.add(llama);

  const ascentFlash = document.createElement('div');
  Object.assign(ascentFlash.style, {
    position: 'absolute',
    inset: '0',
    background:
      config.ascentFlashGradient ??
      'radial-gradient(circle, rgba(46, 196, 182, 0.45), #090d16 78%)',
    opacity: '0',
    pointerEvents: 'none',
    transition: 'opacity 0.35s ease',
    zIndex: '10',
  });
  contenedor.appendChild(ascentFlash);

  const physics = config.physics;
  const GRAVEDAD = physics.gravity;
  const EMPUJE = physics.thrust;
  const EMPUJE_LATERAL = physics.lateralThrust;
  const MITAD_ALTURA = physics.halfShipHeight ?? 0.6;
  const TECHO = physics.ceiling ?? 25;
  const LIMITE_X = physics.limitX ?? 22;
  const VEL_SEGURA = physics.safeVerticalSpeed;
  const VEL_LATERAL_SEGURA = physics.safeLateralSpeed;
  const COMBUSTIBLE_MAX = physics.fuelMax ?? 100;
  const GASTO = physics.fuelBurn;
  const GASTO_LATERAL = physics.lateralFuelBurn;

  const isMoonMission =
    (config.exploreRoute ?? '').includes('moon') ||
    (config.orbitReturnRoute ?? '').includes('moon');
  const currentBodyId = isMoonMission ? 'moon' : 'mars';

  let posX = 0;
  let posY = physics.startY ?? 16;
  let velX = 0;
  let velY = 0;
  let combustible = COMBUSTIBLE_MAX;
  let estado = 'volando';
  let velImpacto = 0;
  let motivo = '';
  let runElapsed = 0;
  let ascentElapsed = 0;
  let ascentRedirecting = false;
  let exploringSurface = false;

  function launchToOrbit(force = false) {
    if (estado === 'despegando') return;
    if (estado === 'estrellado' && !force) return;

    const standaloneFrame = document.getElementById('standalone-explore-frame');
    if (standaloneFrame) {
      standaloneFrame.remove();
    }
    exploringSurface = false;

    if (estado === 'estrellado') {
      posY = MITAD_ALTURA;
      velX = 0;
      velY = 0;
    }

    estado = 'despegando';
    ascentElapsed = 0;
    ascentRedirecting = false;
    nave.rotation.z = 0;
    pintarEstadoNave(0x2ec4b6);
    bordeLuminoso.material.color.setHex(0x2ec4b6);
    envHooks?.onAscent?.({ posX, posY });
  }

  function goExploreSurface() {
    if (exploringSurface) return;
    exploringSurface = true;
    ascentFlash.style.opacity = '1';

    setTimeout(() => {
      // Caso 1: Estamos dentro del simulador embebido en #expedition.
      // Enviamos postMessage para cambiar al Rover instantáneamente SIN recargar la web.
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: 'expedition:explore-surface', body: currentBodyId },
          '*'
        );
        return;
      }

      // Caso 2: Estamos directo en la vista grande (/vuelo o /aterrizaje).
      // Abrimos el modo exploración en grande a pantalla completa sin redirigir a la página principal.
      const fullExploreUrl = withBase(`/?explore=${currentBodyId}&fullscreen=1`);
      let exploreFrame = document.getElementById('standalone-explore-frame');
      if (!exploreFrame) {
        exploreFrame = document.createElement('iframe');
        exploreFrame.id = 'standalone-explore-frame';
        Object.assign(exploreFrame.style, {
          position: 'fixed',
          inset: '0',
          width: '100vw',
          height: '100vh',
          border: '0',
          zIndex: '9999',
          background: '#090d16',
        });
        exploreFrame.setAttribute('allow', 'fullscreen');
        document.body.appendChild(exploreFrame);
      }
      exploreFrame.src = fullExploreUrl;
      setTimeout(() => {
        exploreFrame.focus();
        exploreFrame.contentWindow?.focus();
      }, 60);
    }, 350);
  }

  // Escuchar si desde la vista grande de exploración el jugador presiona [L] Launch to Orbit o Exit
  window.addEventListener('message', (e) => {
    if (e.data?.type === 'expedition:launch-orbit') {
      const fromBody = e.data.body || currentBodyId;
      window.location.href = withBase(`/vuelo?from=${fromBody}`);
    } else if (e.data?.type === 'expedition:exit-standalone') {
      const standaloneFrame = document.getElementById('standalone-explore-frame');
      if (standaloneFrame) standaloneFrame.remove();
      reiniciar();
    }
  });

  function reiniciar() {
    posX = 0;
    posY = physics.startY ?? 16;
    velX = 0;
    velY = 0;
    combustible = COMBUSTIBLE_MAX;
    estado = 'volando';
    velImpacto = 0;
    motivo = '';
    runElapsed = 0;
    ascentElapsed = 0;
    ascentRedirecting = false;
    exploringSurface = false;
    ascentFlash.style.opacity = '0';
    pintarEstadoNave(null);
    bordeLuminoso.material.color.setHex(padDefaultColor);
    nave.rotation.z = 0;
    camara.position.set(defaultCamPos[0], defaultCamPos[1], defaultCamPos[2]);
    camara.lookAt(defaultCamLook[0], defaultCamLook[1], defaultCamLook[2]);

    const standaloneFrame = document.getElementById('standalone-explore-frame');
    if (standaloneFrame) standaloneFrame.remove();

    let x;
    do {
      x = Math.random() * 20 - 10;
    } while (Math.abs(x) < 3.5);
    plataforma.position.x = x;

    envHooks?.onRestart?.({ padX: x, camera: camara });
  }

  reiniciar();
  onMissionRestart(reiniciar);
  onLaunchOrbit(() => launchToOrbit(true));
  onExploreSurface(goExploreSurface);

  document.getElementById('hud-status')?.addEventListener('click', (event) => {
    const btn = event.target instanceof Element ? event.target.closest('[data-hud-action]') : null;
    if (!btn) return;
    const action = btn.getAttribute('data-hud-action');
    if (action === 'explore') goExploreSurface();
    else if (action === 'orbit') launchToOrbit(true);
    else if (action === 'retry') reiniciar();
    viewport?.focus();
  });

  const teclas = {};
  const TECLAS_JUEGO = [
    'Space',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
  ];

  window.addEventListener(
    'keydown',
    (e) => {
      if (exploringSurface) return;
      if (TECLAS_JUEGO.includes(e.code)) e.preventDefault();
      const k = e.key.toLowerCase();
      teclas[e.code] = true;
      teclas[k] = true;

      if ((e.code === 'KeyL' || k === 'l') && estado !== 'despegando') {
        launchToOrbit(true);
      }

      if ((e.code === 'KeyE' || k === 'e') && estado !== 'despegando') {
        goExploreSurface();
      }

      if ((e.code === 'KeyR' || k === 'r') && estado !== 'volando' && estado !== 'despegando') {
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

    if (!gate.active || exploringSurface) return;

    runElapsed += dt;
    let motorPrendido = false;

    if (estado === 'volando') {
      let accY = GRAVEDAD;
      let accX = 0;

      motorPrendido =
        (teclas['Space'] || teclas['ArrowUp'] || teclas['KeyW'] || teclas['w']) &&
        combustible > 0;
      if (motorPrendido) {
        accY += EMPUJE;
        combustible -= GASTO * dt;
      }

      const izquierda = teclas['ArrowLeft'] || teclas['KeyA'] || teclas['a'];
      const derecha = teclas['ArrowRight'] || teclas['KeyD'] || teclas['d'];
      if ((izquierda || derecha) && combustible > 0) {
        if (izquierda) accX -= EMPUJE_LATERAL;
        if (derecha) accX += EMPUJE_LATERAL;
        combustible -= GASTO_LATERAL * dt;
      }
      combustible = Math.max(0, combustible);

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
          motivo = `Descent too fast (${velImpacto.toFixed(1)} m/s).`;
          pintarEstadoNave(0xff3333);
          bordeLuminoso.material.color.setHex(0xff3333);
        } else if (velLateralImpacto > VEL_LATERAL_SEGURA) {
          estado = 'estrellado';
          motivo = `Lateral speed too high (${velLateralImpacto.toFixed(1)} m/s).`;
          pintarEstadoNave(0xff3333);
          bordeLuminoso.material.color.setHex(0xff3333);
        } else if (!enPlataforma) {
          estado = 'fuera';
          pintarEstadoNave(0xffcc33);
          bordeLuminoso.material.color.setHex(0xffcc33);
          // Entrar directo al modo exploración al aterrizar
          goExploreSurface();
        } else {
          estado = 'aterrizado';
          pintarEstadoNave(0x44ff66);
          bordeLuminoso.material.color.setHex(0x44ff66);
          // Entrar directo al modo exploración justo al aterrizar
          goExploreSurface();
        }

        envHooks?.onTouchdown?.({
          estado,
          posX,
          padX: plataforma.position.x,
          velImpacto,
          velLateralImpacto,
        });
      }
    } else if (estado === 'despegando') {
      ascentElapsed += dt;
      motorPrendido = true;

      const ascentAcc = Math.abs(GRAVEDAD) * 2.4 + 6.5;
      velX *= Math.max(0, 1 - 3.5 * dt);
      velY += (GRAVEDAD + ascentAcc) * dt;
      posX += velX * dt;
      posY += velY * dt;

      if ((posY > 30 || ascentElapsed > 2.4) && !ascentRedirecting) {
        ascentRedirecting = true;
        ascentFlash.style.opacity = '1';
        setTimeout(() => {
          window.location.href = withBase(config.orbitReturnRoute ?? '/vuelo');
        }, 550);
      }
    }

    nave.position.set(posX, posY, 0);
    if (estado === 'despegando') {
      nave.rotation.z = THREE.MathUtils.lerp(nave.rotation.z, 0, 8 * dt);
    } else if (estado === 'volando') {
      nave.rotation.z = -velX * (physics.tiltFactor ?? 0.06);
    }

    llama.visible = motorPrendido;
    if (motorPrendido) {
      if (estado === 'despegando') {
        llama.scale.set(1.25, 1.45 + Math.random() * 0.65, 1.25);
      } else {
        llama.scale.set(1, 0.8 + Math.random() * 0.4, 1);
      }
    }

    const caida = -velY;
    const altura = posY - MITAD_ALTURA;
    const colorCaida = caida > VEL_SEGURA && estado === 'volando' ? 'hud-danger' : '';
    const colorLateral = Math.abs(velX) > VEL_LATERAL_SEGURA ? 'hud-danger' : '';
    const colorComb = combustible < 25 ? 'hud-danger' : '';

    const frameCtx = {
      dt,
      elapsed: runElapsed,
      ascentElapsed,
      estado,
      motorPrendido,
      posX,
      posY,
      velX,
      velY,
      altura,
      combustible,
      padX: plataforma.position.x,
      nave,
      plataforma,
    };

    envHooks?.update?.(frameCtx);
    if (envHooks?.updateCamera) {
      envHooks.updateCamera(camara, frameCtx);
    } else if (estado === 'despegando') {
      camara.position.x = THREE.MathUtils.lerp(camara.position.x, posX * 0.25, 3 * dt);
      camara.position.y = THREE.MathUtils.lerp(
        camara.position.y,
        defaultCamPos[1] + Math.max(0, posY - 6) * 0.42,
        3 * dt
      );
      camara.position.z = THREE.MathUtils.lerp(
        camara.position.z,
        defaultCamPos[2] + Math.max(0, posY - 8) * 0.35,
        3 * dt
      );
      camara.lookAt(posX * 0.2, defaultCamLook[1] + Math.max(0, posY - 6) * 0.65, 0);
    }

    const actionButtonsHtml = `
      <div class="game-hud__actions">
        <button type="button" class="game-hud__btn game-hud__btn--explore" data-hud-action="explore">Explore Surface [E]</button>
        <button type="button" class="game-hud__btn game-hud__btn--orbit" data-hud-action="orbit">Launch to Orbit [L]</button>
        <button type="button" class="game-hud__btn" data-hud-action="retry">Retry [R]</button>
      </div>
    `;

    const copy = config.copy;
    let mensaje = '';
    if (estado === 'despegando') {
      mensaje = `
        <span class="hud-ok"><b>ASCENDING TO ORBIT</b></span><br>
        Escaping gravity well &mdash; returning to Moon / Mars flight space&hellip;
      `;
    } else if (estado === 'aterrizado' || estado === 'fuera') {
      mensaje = `
        <span class="hud-ok"><b>TOUCHDOWN CONFIRMED</b></span><br>
        Deploying surface rover&hellip;
      `;
    } else if (estado === 'estrellado') {
      mensaje = `
        <span class="hud-danger"><b>${copy.crashTitle}</b></span><br>
        ${motivo} Press <b>[ R ]</b> to retry or launch back to orbit.
        ${actionButtonsHtml}
      `;
    }

    hud.setTelemetry(`
      <span class="game-hud__title">${copy.gravityTitle}</span>
      Altitude ${altura.toFixed(1)} m<br>
      <span class="${colorCaida}">Vertical speed ${caida.toFixed(1)} m/s</span><br>
      <span class="${colorLateral}">Lateral speed ${Math.abs(velX).toFixed(1)} m/s</span><br>
      <span class="${colorComb}">Fuel ${Math.round(combustible)}%</span>
      <span class="game-hud__controls">[Space / &uarr; / W] Engine &middot; [&larr; &rarr; / A D] Lateral &middot; [E] Explore Surface &middot; [L] Launch to Orbit &middot; [R] Restart</span>
    `);
    hud.setStatus(mensaje);

    renderer.render(escena, camara);
  }

  actualizar();
}