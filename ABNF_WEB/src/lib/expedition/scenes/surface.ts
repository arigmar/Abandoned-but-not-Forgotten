import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  Vector3,
} from 'three';
import {
  getArtifactDiscoveryState,
  markArtifactInspected,
  markArtifactRecovered,
  readDiscoveryState,
} from '../../discovery';
import { playSonarTone } from '../../sonar';
import type { ExpeditionHud } from '../hud';
import type { ExpeditionInput } from '../input';
import { buildMonumentExterior, type MonumentBuild } from '../monuments';
import { getBodyEnvironmentPalette, type TokenPalette } from '../palette';
import { buildSurfaceTerrain, buildSurveyRover, type SurfaceTerrainData, type SurveyRoverRig } from '../terrain';
import type { ExpeditionArtifact, HotspotData, ProjectedHotspot } from '../types';
import { clampNumber, createPrng, disposeObjectTree, hashStringSeed, shortestAngleDelta } from '../utils';

export interface SurfaceSceneController {
  scene: Scene;
  getSubMode: () => 'drive' | 'inspect' | 'complete';
  triggerSonarPulse: () => void;
  toggleAutoApproach: () => void;
  interactInInspect: () => void;
  selectHotspot: (index: number) => void;
  stepHotspot: (delta: number) => void;
  returnToDriveMode: () => void;
  markRecovered: () => void;
  applyDiscoverySync: () => void;
  update: (dt: number, nowMs: number, camera: PerspectiveCamera, input: ExpeditionInput) => void;
  dispose: () => void;
}

function compassLabel(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[idx];
}

export function createSurfaceScene(
  artifact: ExpeditionArtifact,
  hotspots: HotspotData[],
  tokens: TokenPalette,
  hud: ExpeditionHud,
  reducedMotion: boolean,
): SurfaceSceneController {
  const env = getBodyEnvironmentPalette(artifact.body, tokens);
  const scene = new Scene();
  scene.background = env.skyColor.clone();
  scene.fog = new FogExp2(env.fogColor.getHex(), env.fogDensity);

  // Calibrated three-point + sky hemisphere lighting capped below #E6ECF5
  const hemi = new HemisphereLight(env.ambientColor, env.hemiGroundColor, env.ambientIntensity + 0.15);
  scene.add(hemi);

  const ambient = new AmbientLight(env.ambientColor, env.ambientIntensity * 0.65);
  scene.add(ambient);

  const sun = new DirectionalLight(env.sunColor, env.sunIntensity);
  sun.position.set(34, 48, 28);
  scene.add(sun);

  const fillLight = new DirectionalLight(tokens.slateRaised, 0.35);
  fillLight.position.set(-28, 18, -32);
  scene.add(fillLight);

  // Airless Moon zenith starfield backdrop
  if (artifact.body === 'moon') {
    const rand = createPrng(hashStringSeed(`${artifact.id}-moon-sky`));
    const count = 180;
    const coords = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const az = rand() * Math.PI * 2;
      const el = 0.08 + rand() * 1.15;
      const r = 165;
      coords[i * 3] = Math.cos(az) * Math.cos(el) * r;
      coords[i * 3 + 1] = Math.sin(el) * r;
      coords[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(coords, 3));
    const m = new PointsMaterial({ color: tokens.starPrimary, size: 0.48 });
    scene.add(new Points(g, m));
  }

  // Seeded terrain & procedural exterior monument at (0, h(0,0), 0)
  const terrain: SurfaceTerrainData = buildSurfaceTerrain(
    artifact.id,
    artifact.body,
    env,
    reducedMotion,
  );
  scene.add(terrain.root);

  const monument: MonumentBuild = buildMonumentExterior(artifact.id, tokens);
  monument.root.position.set(0, terrain.getHeight(0, 0), 0);
  scene.add(monument.root);

  // Unbranded survey rover at spawn pad (~49s drive away)
  const rover: SurveyRoverRig = buildSurveyRover(tokens);
  let roverX = terrain.spawnPosition.x;
  let roverZ = terrain.spawnPosition.z;
  let roverYaw = Math.atan2(roverX, roverZ);
  let roverSpeed = 0;
  let roverSteerAngle = 0;
  rover.root.rotation.order = 'YXZ';
  rover.root.position.set(roverX, terrain.getHeight(roverX, roverZ), roverZ);
  scene.add(rover.root);

  // Turquoise sonar wave ring + brief target sky column
  const sonarRingMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0,
  });
  const sonarRing = new Mesh(new RingGeometry(0.92, 1.0, 48), sonarRingMat);
  sonarRing.rotation.x = -Math.PI / 2;
  sonarRing.visible = false;
  scene.add(sonarRing);

  const pingColumnMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0,
  });
  const pingColumn = new Mesh(new CylinderGeometry(0.16, 0.35, 22, 10), pingColumnMat);
  pingColumn.position.set(0, terrain.getHeight(0, 0) + 11, 0);
  pingColumn.visible = false;
  scene.add(pingColumn);

  // Tiny horizon beacon bar above monument base matching discovery state
  const groundHaloMat = new MeshBasicMaterial({
    color: tokens.dormant,
    transparent: true,
    opacity: 0.25,
  });
  const monumentHalo = new Mesh(new BoxGeometry(0.18, 0.04, 0.18), groundHaloMat);
  monumentHalo.visible = false;
  scene.add(monumentHalo);

  // Game state
  let subMode: 'drive' | 'inspect' | 'complete' = 'drive';
  let autoApproach = false;
  let sonarTimer = 0;
  let lastPingSummary = '';
  let inspectedSynced = false;

  const scannedSet = new Set<string>();
  let activeHotspotIndex = 0;

  // Camera state
  let driveYaw = roverYaw + Math.PI;
  let drivePitch = 0.28;
  let inspectYaw = 0.45;
  let inspectTargetYaw: number | null = null;
  let inspectPitch = 0.38;
  let inspectDistance = monument.boundingRadius + 4.4;
  const camPosSmooth = new Vector3(roverX, terrain.getHeight(roverX, roverZ) + 3.8, roverZ + 7.5);
  const camLookAt = new Vector3();

  const tempWorld = new Vector3();
  const tempProjected = new Vector3();

  const syncMonumentVisuals = (): void => {
    const status = getArtifactDiscoveryState(artifact.id, readDiscoveryState());
    monument.setDiscoveryState(status);
    hud.setDiscoveryStatus(status);
    if (status === 'recovered') {
      groundHaloMat.color.copy(tokens.amber);
    } else if (status === 'inspected') {
      groundHaloMat.color.copy(tokens.turquoise);
    } else {
      groundHaloMat.color.copy(tokens.dormant);
    }
    hotspots.forEach((hp, idx) => {
      monument.setHotspotVisual(idx, scannedSet.has(hp.id), subMode === 'inspect' && idx === activeHotspotIndex);
    });
  };

  const refreshInspectionHud = (): void => {
    hud.setInspectionProgress(scannedSet.size, hotspots.length, scannedSet.size >= hotspots.length);
    syncMonumentVisuals();
  };

  const focusHotspotTarget = (index: number): void => {
    activeHotspotIndex = ((index % hotspots.length) + hotspots.length) % hotspots.length;
    const marker = monument.hotspotMarkers[activeHotspotIndex];
    if (marker) {
      marker.anchor.getWorldPosition(tempWorld);
      const localX = tempWorld.x - monument.root.position.x;
      const localZ = tempWorld.z - monument.root.position.z;
      if (Math.hypot(localX, localZ) > 0.35) {
        inspectTargetYaw = Math.atan2(localX, localZ);
      }
    }
    refreshInspectionHud();
  };

  const enterInspectMode = (): void => {
    if (subMode === 'inspect') return;
    subMode = 'inspect';
    autoApproach = false;
    hud.setApproachEngaged(false);
    hud.setPhase('inspect');
    hud.setDistanceReadout('EXTERIOR ORBIT // DRAG OR ARROWS TO INSPECT · E SCAN');
    focusHotspotTarget(activeHotspotIndex);
    hud.announce(`Inspection orbit active around ${artifact.name}. Five exterior points ready to scan.`);
  };

  const scanHotspotIndex = (index: number): void => {
    focusHotspotTarget(index);
    const hp = hotspots[activeHotspotIndex];
    if (!hp) return;

    const firstTime = !scannedSet.has(hp.id);
    scannedSet.add(hp.id);
    playSonarTone('scan');
    hud.showPlaque(hp);
    hud.announce(`${hp.title}: ${hp.explorerBody}`);

    if (scannedSet.size >= hotspots.length && !inspectedSynced) {
      inspectedSynced = true;
      markArtifactInspected(artifact.id);
      hud.announce(
        `${artifact.name} exterior inspection complete. Archive link unlocked: hold or press HOLD to recover.`,
      );
    } else if (firstTime) {
      refreshInspectionHud();
    } else {
      syncMonumentVisuals();
    }
  };

  hud.setHotspots(hotspots);
  hud.setPhase('drive');
  refreshInspectionHud();

  const updateDriveCamera = (dt: number, camera: PerspectiveCamera, input: ExpeditionInput): void => {
    const orbit = input.consumeOrbitDelta();
    driveYaw += orbit.yaw;
    drivePitch = clampNumber(drivePitch + orbit.pitch, 0.14, 0.72);
    // Discard unused zoom deltas cleanly
    input.consumeWheelZoom();

    // Soft chase drift behind rover heading when driving without mouse drag
    if (Math.abs(orbit.yaw) < 0.0001 && Math.abs(roverSpeed) > 0.1) {
      const behindAngle = roverYaw;
      driveYaw += shortestAngleDelta(driveYaw, behindAngle) * Math.min(1, dt * 1.4);
    }

    const desiredX = roverX + Math.sin(driveYaw) * 6.8 * Math.cos(drivePitch);
    const desiredZ = roverZ + Math.cos(driveYaw) * 6.8 * Math.cos(drivePitch);
    const groundUnderCam = terrain.getHeight(desiredX, desiredZ);
    const desiredY = Math.max(rover.root.position.y + 1.8, groundUnderCam + 0.9) + Math.sin(drivePitch) * 4.2;

    const lerpT = Math.min(1, dt * 6.5);
    camPosSmooth.lerp(tempWorld.set(desiredX, desiredY, desiredZ), lerpT);
    camera.position.copy(camPosSmooth);
    camLookAt.set(roverX, rover.root.position.y + 1.15, roverZ);
    camera.lookAt(camLookAt);
  };

  const updateInspectCamera = (dt: number, camera: PerspectiveCamera, input: ExpeditionInput): void => {
    const orbit = input.consumeOrbitDelta();
    const zoom = input.consumeWheelZoom();

    if (Math.abs(orbit.yaw) > 0.0001 || Math.abs(input.inspectRotate) > 0.01) {
      inspectTargetYaw = null;
    }

    inspectYaw += orbit.yaw - input.inspectRotate * dt * 1.55;
    inspectPitch = clampNumber(inspectPitch + orbit.pitch, 0.12, 1.24);
    inspectDistance = clampNumber(
      inspectDistance + zoom * 0.45 + input.inspectZoom * dt * 3.8,
      monument.boundingRadius + 1.5,
      13.5,
    );

    if (inspectTargetYaw !== null) {
      const step = shortestAngleDelta(inspectYaw, inspectTargetYaw);
      inspectYaw += step * Math.min(1, dt * 4.5);
      if (Math.abs(step) < 0.02) inspectTargetYaw = null;
    }

    const centerY = monument.root.position.y + 1.15;
    const offsetHoriz = Math.cos(inspectPitch) * inspectDistance;
    const rawX = Math.sin(inspectYaw) * offsetHoriz;
    const rawZ = Math.cos(inspectYaw) * offsetHoriz;
    const rawY = centerY + Math.sin(inspectPitch) * inspectDistance;

    // Camera collision guard: never below local ground and never inside monument bounding radius
    const minGroundY = terrain.getHeight(rawX, rawZ) + 0.65;
    const safeY = Math.max(rawY, minGroundY);
    tempWorld.set(rawX, safeY - centerY, rawZ);
    const radialDist = tempWorld.length();
    const minSphere = monument.boundingRadius + 1.4;
    if (radialDist < minSphere && radialDist > 0.001) {
      tempWorld.multiplyScalar(minSphere / radialDist);
    }

    camera.position.set(tempWorld.x, centerY + tempWorld.y, tempWorld.z);
    camera.lookAt(0, centerY, 0);
  };

  const updateHotspotProjections = (camera: PerspectiveCamera): void => {
    const canvas = hud ? document.getElementById('expedition-canvas') : null;
    const width = canvas?.clientWidth || window.innerWidth;
    const height = canvas?.clientHeight || window.innerHeight;

    const projectedList: ProjectedHotspot[] = hotspots.map((hp, index) => {
      const marker = monument.hotspotMarkers[index];
      if (!marker) {
        return { data: hp, x: 0, y: 0, visible: false, scanned: false, active: false };
      }

      marker.anchor.getWorldPosition(tempWorld);
      tempProjected.copy(tempWorld).project(camera);
      const visible =
        tempProjected.z > -1 &&
        tempProjected.z < 1 &&
        Math.abs(tempProjected.x) <= 0.96 &&
        Math.abs(tempProjected.y) <= 0.9;

      return {
        data: hp,
        x: (tempProjected.x * 0.5 + 0.5) * width,
        y: (-tempProjected.y * 0.5 + 0.5) * height,
        visible,
        scanned: scannedSet.has(hp.id),
        active: index === activeHotspotIndex,
      };
    });

    hud.updateHotspotProjection(projectedList);
  };

  return {
    scene,
    getSubMode: () => subMode,

    triggerSonarPulse() {
      if (subMode !== 'drive') return;
      sonarTimer = 2.2;
      sonarRing.visible = true;
      sonarRing.position.set(roverX, rover.root.position.y + 0.16, roverZ);
      sonarRing.scale.setScalar(1);
      sonarRingMat.opacity = 0.85;

      pingColumn.visible = true;
      pingColumnMat.opacity = 0.65;

      const dx = -roverX;
      const dz = -roverZ;
      const distMeters = Math.max(0, Math.round(Math.hypot(dx, dz) - 4));
      const azDeg = Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI) % 360 + 360) % 360);
      lastPingSummary = `SONAR // ${azDeg}° ${compassLabel(azDeg)} · RANGE ${distMeters} M (COMPRESSED)`;
      hud.setDistanceReadout(lastPingSummary);
      hud.announce(lastPingSummary);
      playSonarTone('ping');
    },

    toggleAutoApproach() {
      if (subMode !== 'drive') return;
      autoApproach = !autoApproach;
      hud.setApproachEngaged(autoApproach);
      hud.announce(autoApproach ? 'Auto-Approach engaged.' : 'Manual driving resumed.');
    },

    interactInInspect() {
      if (subMode === 'drive') {
        if (Math.hypot(roverX, roverZ) <= 12) enterInspectMode();
        return;
      }
      if (subMode === 'inspect' && scannedSet.size < hotspots.length) {
        scanHotspotIndex(activeHotspotIndex);
      }
    },

    selectHotspot(index: number) {
      if (subMode === 'inspect') {
        focusHotspotTarget(index);
      }
    },

    stepHotspot(delta: number) {
      if (subMode === 'inspect') {
        focusHotspotTarget(activeHotspotIndex + delta);
      }
    },

    returnToDriveMode() {
      if (subMode !== 'inspect') return;
      subMode = 'drive';
      // Back rover cleanly to perimeter edge so inspection does not immediately re-trigger
      const dist = Math.hypot(roverX, roverZ) || 1;
      roverX = (roverX / dist) * 11.4;
      roverZ = (roverZ / dist) * 11.4;
      rover.root.position.set(roverX, terrain.getHeight(roverX, roverZ), roverZ);
      hud.showPlaque(null);
      hud.setPhase('drive');
      refreshInspectionHud();
    },

    markRecovered() {
      subMode = 'complete';
      markArtifactRecovered(artifact.id);
      playSonarTone('recover');
      syncMonumentVisuals();
      hud.showCompleteCard();
    },

    applyDiscoverySync() {
      syncMonumentVisuals();
    },

    update(dt: number, nowMs: number, camera: PerspectiveCamera, input: ExpeditionInput) {
      // Animate expanding sonar ring wave & monument column fade
      if (sonarTimer > 0) {
        sonarTimer = Math.max(0, sonarTimer - dt);
        const progress = 1 - sonarTimer / 2.2;
        if (!reducedMotion) {
          sonarRing.scale.setScalar(1 + progress * 92);
        } else {
          sonarRing.scale.setScalar(14);
        }
        sonarRingMat.opacity = (1 - progress) * 0.78;
        pingColumnMat.opacity = (1 - progress) * 0.6;
        if (sonarTimer === 0) {
          sonarRing.visible = false;
          pingColumn.visible = false;
        }
      }

      if (subMode === 'drive') {
        const manualThrottle = input.throttle;
        const manualSteer = input.steer;

        // Cancel autopilot cleanly if player inputs manual driving controls
        if (autoApproach && (Math.abs(manualThrottle) > 0.2 || Math.abs(manualSteer) > 0.2)) {
          autoApproach = false;
          hud.setApproachEngaged(false);
        }

        let targetSpeed = 0;
        let targetSteer = 0;

        if (autoApproach) {
          // Guide rover cleanly toward southern inspection apron (0, 8.6)
          const tx = 0 - roverX;
          const tz = 8.4 - roverZ;
          const desiredYaw = Math.atan2(-tx, -tz);
          const yawErr = shortestAngleDelta(roverYaw, desiredYaw);
          targetSteer = clampNumber(-yawErr * 1.8, -1, 1);
          targetSpeed = Math.abs(yawErr) < 0.7 ? 7.8 : 4.2;
        } else {
          targetSpeed = manualThrottle * 1.75; // ~49s to cross 86m spawn span
          targetSteer = manualSteer;
        }

        roverSpeed += (targetSpeed - roverSpeed) * Math.min(1, dt * 5.2);
        roverSteerAngle += (targetSteer * 0.42 - roverSteerAngle) * Math.min(1, dt * 8);

        if (Math.abs(roverSpeed) > 0.03) {
          const reverseSign = roverSpeed < 0 ? -1 : 1;
          roverYaw -= targetSteer * reverseSign * 1.35 * dt;
        } else if (Math.abs(targetSteer) > 0.1 && !autoApproach) {
          // Gentle pivot on spot for easy framing
          roverYaw -= targetSteer * 0.9 * dt;
        }

        let nextX = roverX - Math.sin(roverYaw) * roverSpeed * dt;
        let nextZ = roverZ - Math.cos(roverYaw) * roverSpeed * dt;

        // Soft boulder repulsion so rover rolls past rocks smoothly
        for (const rock of terrain.boulders) {
          const dx = nextX - rock.x;
          const dz = nextZ - rock.z;
          const d = Math.hypot(dx, dz);
          if (d < rock.radius && d > 0.001) {
            const push = (rock.radius - d) / d;
            nextX += dx * push;
            nextZ += dz * push;
          }
        }

        // Prevent driving directly through monument chassis
        const monDist = Math.hypot(nextX, nextZ);
        const minMonumentPad = monument.boundingRadius + 1.5;
        if (monDist < minMonumentPad && monDist > 0.001) {
          nextX = (nextX / monDist) * minMonumentPad;
          nextZ = (nextZ / monDist) * minMonumentPad;
        }

        // Clamp within terrain bounds
        const maxBound = 104;
        roverX = clampNumber(nextX, -maxBound, maxBound);
        roverZ = clampNumber(nextZ, -maxBound, maxBound);

        const baseY = terrain.getHeight(roverX, roverZ);
        rover.root.position.set(roverX, baseY, roverZ);

        // Compute surface pitch and roll across rover footprint
        const fX = -Math.sin(roverYaw);
        const fZ = -Math.cos(roverYaw);
        const rX = Math.cos(roverYaw);
        const rZ = -Math.sin(roverYaw);
        const hFront = terrain.getHeight(roverX + fX * 1.1, roverZ + fZ * 1.1);
        const hBack = terrain.getHeight(roverX - fX * 1.1, roverZ - fZ * 1.1);
        const hRight = terrain.getHeight(roverX + rX * 0.85, roverZ + rZ * 0.85);
        const hLeft = terrain.getHeight(roverX - rX * 0.85, roverZ - rZ * 0.85);

        rover.root.rotation.y = roverYaw;
        rover.root.rotation.x = Math.atan2(hFront - hBack, 2.2) * 0.72;
        rover.root.rotation.z = -Math.atan2(hRight - hLeft, 1.7) * 0.72;

        // Wheel spin, front steering visual & ground tracks
        const wheelSpin = (-roverSpeed * dt) / 0.29;
        for (const w of rover.leftWheels) w.rotation.x += wheelSpin;
        for (const w of rover.rightWheels) w.rotation.x += wheelSpin;
        for (const pivot of rover.frontSteerPivots) {
          pivot.rotation.y = -roverSteerAngle;
        }

        terrain.stampWheelTracks(roverX, roverZ, roverYaw, terrain.getHeight);
        terrain.updateDust(dt, roverX, baseY, roverZ, roverSpeed);

        const targetRange = Math.max(0, Math.round(Math.hypot(roverX, roverZ) - 4));
        if (sonarTimer <= 0) {
          hud.setDistanceReadout(
            autoApproach
              ? `AUTO-APPROACH // ${targetRange} M TO TARGET`
              : `RANGE TO MONUMENT // ${targetRange} M (COMPRESSED)`,
          );
        }

        updateDriveCamera(dt, camera, input);

        // Switch cleanly into Exterior Inspection when within inspection apron
        if (Math.hypot(roverX, roverZ) <= 9.5) {
          enterInspectMode();
        }
      } else if (subMode === 'inspect') {
        terrain.updateDust(dt, 0, terrain.getHeight(0, 0), 0, 0);
        updateInspectCamera(dt, camera, input);
        updateHotspotProjections(camera);
        hud.tickHold(nowMs);
      } else {
        // Gentle idle orbit after archive recovery
        inspectYaw += (reducedMotion ? 0 : dt * 0.22);
        updateInspectCamera(dt, camera, input);
      }
    },

    dispose() {
      disposeObjectTree(scene);
    },
  };
}
