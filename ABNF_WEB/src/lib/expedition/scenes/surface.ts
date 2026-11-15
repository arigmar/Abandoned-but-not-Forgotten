import {
  AmbientLight,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import {
  getArtifactDiscoveryState,
  markArtifactInspected,
  markArtifactRecovered,
  readDiscoveryState,
} from '../../discovery';
import { playSonarTone, playSubsystemPulseTone } from '../../sonar';
import { createDracoGltfLoader, loadNormalizedGlbIntoGroup } from '../glb-assets';
import { buildArtifactHotspots, type ExpeditionHud } from '../hud';
import type { ExpeditionInput } from '../input';
import { buildMonumentExterior, type MonumentBuild } from '../monuments';
import { getBodyEnvironmentPalette, type TokenPalette } from '../palette';
import {
  ROVER_SCALE,
  ROVER_WHEEL_RADIUS,
  buildSurfaceTerrain,
  buildSurveyRover,
  type SurfaceTerrainData,
  type SurveyRoverRig,
} from '../terrain';
import type { ExpeditionArtifact, HotspotData, ProjectedHotspot } from '../types';
import { clampNumber, createPrng, disposeObjectTree, hashStringSeed, shortestAngleDelta } from '../utils';
import {
  LANDER_PAD_POSITION,
  ROVER_SPAWN_POSITION,
  azToCompass8,
  computeAzimuthDeg,
  computePlanetMonumentPlacements,
} from '../zones';

export interface SurfaceSceneController {
  scene: Scene;
  getSubMode: () => 'drive' | 'inspect' | 'complete';
  triggerSonarPulse: () => void;
  toggleAutoApproach: () => void;
  interactInInspect: () => void;
  selectHotspot: (index: number, openPlaque?: boolean) => void;
  stepHotspot: (delta: number) => void;
  triggerDiagnosticTest: () => void;
  setSimMode: (nominal: boolean) => void;
  returnToDriveMode: () => void;
  continueExploring: () => void;
  markRecovered: () => void;
  applyDiscoverySync: () => void;
  update: (dt: number, nowMs: number, camera: PerspectiveCamera, input: ExpeditionInput) => void;
  dispose: () => void;
}

interface SurfaceMonumentSite {
  artifact: ExpeditionArtifact;
  x: number;
  y: number;
  z: number;
  zoneLabel: string;
  monument: MonumentBuild;
  hotspots: HotspotData[];
  scannedSet: Set<string>;
  testedSet: Set<string>;
  inspectedSynced: boolean;
  beaconMat: MeshBasicMaterial;
  beaconColumn: Mesh;
  perimeterMat: MeshBasicMaterial;
  perimeterRing: Mesh;
}

// 4.5x total manual rover drive multiplier relative to baseline 1.75 m/s (1.5x over previous 3x)
const ROVER_MANUAL_TOP_SPEED = 1.75 * 3 * 1.5;
const ROVER_AUTOPILOT_SPEED = 12.0 * 1.5;

export function createSurfaceScene(
  artifact: ExpeditionArtifact,
  hotspots: HotspotData[],
  tokens: TokenPalette,
  hud: ExpeditionHud,
  reducedMotion: boolean,
  planetArtifacts: ExpeditionArtifact[] = [artifact],
): SurfaceSceneController {
  const env = getBodyEnvironmentPalette(artifact.body, tokens);
  const scene = new Scene();
  scene.background = env.skyColor.clone();
  scene.fog = new FogExp2(env.fogColor.getHex(), env.fogDensity * 0.72);

  let disposed = false;
  const glbHandle = createDracoGltfLoader();

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

  // Airless Moon zenith starfield backdrop & Earthrise
  if (artifact.body === 'moon') {
    const rand = createPrng(hashStringSeed(`${artifact.body}-moon-sky`));
    const count = 200;
    const coords = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const az = rand() * Math.PI * 2;
      const el = 0.08 + rand() * 1.15;
      const r = 195;
      coords[i * 3] = Math.cos(az) * Math.cos(el) * r;
      coords[i * 3 + 1] = Math.sin(el) * r;
      coords[i * 3 + 2] = Math.sin(az) * Math.cos(el) * r;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(coords, 3));
    const m = new PointsMaterial({ color: tokens.starPrimary, size: 0.52 });
    scene.add(new Points(g, m));

    const earthrise = new Group();
    earthrise.position.set(-96, 62, -230);
    scene.add(earthrise);

    const earthFallback = new Mesh(
      new SphereGeometry(10.5, 24, 24),
      new MeshBasicMaterial({ color: 0x5aa6f5, fog: false }),
    );
    earthrise.add(earthFallback);
    earthrise.add(
      new Mesh(
        new SphereGeometry(13.0, 24, 24),
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
      targetSize: 21,
      fallbackToRemove: earthFallback,
      filterNonMappedMeshes: true,
      isDisposed: () => disposed,
    });
  }

  // Place ALL monuments belonging to this world according to their real lat/lon zones
  const bodyPool = planetArtifacts.filter((item) => item.body === artifact.body);
  const placements = computePlanetMonumentPlacements(
    bodyPool.length > 0 ? bodyPool : [artifact],
    artifact.body,
  );

  // Seeded terrain flattened at every monument zone, the ship pad, and rover spawn
  const terrain: SurfaceTerrainData = buildSurfaceTerrain(
    `planet-${artifact.body}`,
    artifact.body,
    env,
    reducedMotion,
    placements.map((p) => ({ x: p.x, z: p.z })),
    LANDER_PAD_POSITION,
    ROVER_SPAWN_POSITION,
  );
  scene.add(terrain.root);

  // Build every monument on its real geographic coordinate zone with beacon & perimeter ring
  const sites: SurfaceMonumentSite[] = placements.map((p) => {
    const mon = buildMonumentExterior(p.artifact.id, tokens);
    const py = terrain.getHeight(p.x, p.z);
    mon.root.position.set(p.x, py, p.z);
    scene.add(mon.root);

    const siteHotspots = p.artifact.id === artifact.id ? hotspots : buildArtifactHotspots(p.artifact);

    const beaconMat = new MeshBasicMaterial({
      color: tokens.turquoise,
      transparent: true,
      opacity: 0.24,
    });
    const beaconColumn = new Mesh(new CylinderGeometry(0.14, 0.36, 28, 10), beaconMat);
    beaconColumn.position.set(p.x, py + 14, p.z);
    scene.add(beaconColumn);

    const perimeterMat = new MeshBasicMaterial({
      color: tokens.dormant,
      transparent: true,
      opacity: 0.42,
    });
    const innerR = mon.boundingRadius + 3.0;
    const perimeterRing = new Mesh(new RingGeometry(innerR, innerR + 0.32, 36), perimeterMat);
    perimeterRing.rotation.x = -Math.PI / 2;
    perimeterRing.position.set(p.x, py + 0.06, p.z);
    scene.add(perimeterRing);

    const initialState = getArtifactDiscoveryState(p.artifact.id, readDiscoveryState());
    const initialScanned = new Set<string>();
    if (initialState === 'inspected' || initialState === 'recovered') {
      siteHotspots.forEach((hp) => initialScanned.add(hp.id));
    }

    return {
      artifact: p.artifact,
      x: p.x,
      y: py,
      z: p.z,
      zoneLabel: p.zoneLabel,
      monument: mon,
      hotspots: siteHotspots,
      scannedSet: initialScanned,
      testedSet: new Set<string>(),
      inspectedSynced: initialState === 'inspected' || initialState === 'recovered',
      beaconMat,
      beaconColumn,
      perimeterMat,
      perimeterRing,
    };
  });

  // Enlarged landed spacecraft beside rover deployment point (clearly dwarves miniature rover)
  const landerPadX = LANDER_PAD_POSITION.x;
  const landerPadZ = LANDER_PAD_POSITION.z;
  const landerPadY = terrain.getHeight(landerPadX, landerPadZ);
  const padHex = artifact.body === 'mars' ? 0xff9f1c : 0x2ec4b6;

  const landedCraftGroup = new Group();
  landedCraftGroup.position.set(landerPadX, landerPadY, landerPadZ);
  scene.add(landedCraftGroup);

  const padApron = new Mesh(
    new CylinderGeometry(5.4, 6.0, 0.24, 32),
    new MeshStandardMaterial({ color: tokens.slate, roughness: 0.72, metalness: 0.22 }),
  );
  padApron.position.y = 0.12;
  landedCraftGroup.add(padApron);

  const padRing = new Mesh(
    new TorusGeometry(4.95, 0.14, 10, 48),
    new MeshBasicMaterial({ color: padHex }),
  );
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.26;
  landedCraftGroup.add(padRing);

  const parkedFallback = new Mesh(
    new CylinderGeometry(2.0, 2.8, 7.6, 10),
    new MeshStandardMaterial({ color: tokens.metalLight, roughness: 0.5, metalness: 0.45 }),
  );
  parkedFallback.position.y = 3.9;
  landedCraftGroup.add(parkedFallback);

  loadNormalizedGlbIntoGroup(glbHandle.loader, '/assets/games/spaceship.glb', landedCraftGroup, {
    targetSize: 11.0,
    fallbackToRemove: parkedFallback,
    groundAtMinY: true,
    doubleSide: true,
    isDisposed: () => disposed,
  });

  // Compact miniature survey rover spawned facing North toward monument basin & landed ship
  const rover: SurveyRoverRig = buildSurveyRover(tokens);
  let roverX = terrain.spawnPosition.x;
  let roverZ = terrain.spawnPosition.z;
  let roverYaw = 0.22;
  let roverSpeed = 0;
  let roverSteerAngle = 0;
  rover.root.rotation.order = 'YXZ';
  rover.root.position.set(roverX, terrain.getHeight(roverX, roverZ), roverZ);
  scene.add(rover.root);

  // Expanding sonar pulse ring anchored around rover
  const sonarRingMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0,
  });
  const sonarRing = new Mesh(new RingGeometry(0.42, 0.54, 48), sonarRingMat);
  sonarRing.rotation.x = -Math.PI / 2;
  sonarRing.visible = false;
  scene.add(sonarRing);

  // Interactive inspection laser beam from parked mini-rover + 3D hardware test pulse effects
  const beamGeom = new CylinderGeometry(0.015, 0.022, 1, 8);
  beamGeom.rotateX(Math.PI / 2);
  const scanBeamMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0.72,
  });
  const scanBeam = new Mesh(beamGeom, scanBeamMat);
  scanBeam.visible = false;
  scene.add(scanBeam);

  const beamTipMat = new MeshBasicMaterial({
    color: tokens.turquoise,
    transparent: true,
    opacity: 0.9,
  });
  const beamTip = new Mesh(new SphereGeometry(0.11, 10, 10), beamTipMat);
  beamTip.visible = false;
  scene.add(beamTip);

  const testWaveMat = new MeshBasicMaterial({
    color: tokens.amber,
    transparent: true,
    opacity: 0,
    side: 2,
  });
  const testWaveRing = new Mesh(new RingGeometry(0.14, 0.24, 32), testWaveMat);
  testWaveRing.visible = false;
  scene.add(testWaveRing);

  const testFlareMat = new MeshBasicMaterial({
    color: tokens.amber,
    transparent: true,
    opacity: 0,
  });
  const testFlareBeam = new Mesh(new CylinderGeometry(0.025, 0.09, 14, 8), testFlareMat);
  testFlareBeam.visible = false;
  scene.add(testFlareBeam);

  // State across multi-monument planetary run
  let activeSite: SurfaceMonumentSite = sites.find((s) => s.artifact.id === artifact.id) ?? sites[0];
  let subMode: 'drive' | 'inspect' | 'complete' = 'drive';
  let autoApproach = false;
  let sonarTimer = 0;
  let testWaveTimer = 0;
  let simNominalState = true;
  let lastPingSummary = '';
  let activeHotspotIndex = 0;

  // Camera state (framed tightly enough to see miniature rover alongside 11m ship)
  let driveYaw = roverYaw;
  let drivePitch = 0.28;
  let inspectYaw = 0.45;
  let inspectTargetYaw: number | null = null;
  let inspectPitch = 0.36;
  let inspectTargetPitch: number | null = null;
  let inspectDistance = activeSite.monument.boundingRadius + 4.4;
  const camPosSmooth = new Vector3(
    roverX + Math.sin(driveYaw) * 3.4,
    terrain.getHeight(roverX, roverZ) + 1.5,
    roverZ + Math.cos(driveYaw) * 3.4,
  );
  const camLookAt = new Vector3();

  const tempWorld = new Vector3();
  const tempProjected = new Vector3();
  const tempBeamStart = new Vector3();
  const tempBeamMid = new Vector3();

  const findNearestSite = (onlyUnrecovered: boolean): SurfaceMonumentSite => {
    const state = readDiscoveryState();
    let best: SurfaceMonumentSite | null = null;
    let bestDist = Infinity;

    for (const s of sites) {
      if (onlyUnrecovered && getArtifactDiscoveryState(s.artifact.id, state) === 'recovered') {
        continue;
      }
      const d = Math.hypot(s.x - roverX, s.z - roverZ);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }

    if (best) return best;

    for (const s of sites) {
      const d = Math.hypot(s.x - roverX, s.z - roverZ);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    return best ?? sites[0];
  };

  const syncAllSiteVisuals = (): void => {
    const discoveryState = readDiscoveryState();
    for (const s of sites) {
      const status = getArtifactDiscoveryState(s.artifact.id, discoveryState);
      s.monument.setDiscoveryState(status);

      const isActive = s === activeSite;
      if (status === 'recovered') {
        s.perimeterMat.color.copy(tokens.amber);
        s.perimeterMat.opacity = isActive ? 0.55 : 0.32;
        s.beaconMat.color.copy(tokens.amber);
      } else if (status === 'inspected') {
        s.perimeterMat.color.copy(tokens.turquoise);
        s.perimeterMat.opacity = isActive ? 0.65 : 0.42;
        s.beaconMat.color.copy(tokens.turquoise);
      } else {
        s.perimeterMat.color.copy(tokens.dormant);
        s.perimeterMat.opacity = isActive ? 0.48 : 0.25;
        s.beaconMat.color.copy(tokens.turquoise);
      }

      if (sonarTimer <= 0) {
        s.beaconMat.opacity = status === 'recovered' ? 0.08 : isActive ? 0.28 : 0.16;
      }

      s.hotspots.forEach((hp, idx) => {
        s.monument.setHotspotVisual(
          idx,
          s.scannedSet.has(hp.id),
          subMode === 'inspect' && isActive && idx === activeHotspotIndex,
        );
      });
    }

    const activeStatus = getArtifactDiscoveryState(activeSite.artifact.id, discoveryState);
    hud.setDiscoveryStatus(activeStatus);
  };

  const refreshInspectionHud = (): void => {
    hud.setInspectionProgress(
      activeSite.scannedSet.size,
      activeSite.hotspots.length,
      activeSite.scannedSet.size >= activeSite.hotspots.length,
    );
    syncAllSiteVisuals();
  };

  const bindActiveSite = (nextSite: SurfaceMonumentSite, announceSwitch: boolean): void => {
    const changed = activeSite !== nextSite;
    activeSite = nextSite;
    activeHotspotIndex = 0;
    inspectDistance = activeSite.monument.boundingRadius + 4.4;
    const status = getArtifactDiscoveryState(activeSite.artifact.id, readDiscoveryState());
    if (changed) {
      hud.setActiveArtifact(activeSite.artifact, activeSite.hotspots, status);
      hud.setDiagnosticTested(activeSite.testedSet);
      if (announceSwitch) {
        hud.announce(`Approaching zone ${activeSite.zoneLabel}: ${activeSite.artifact.name}.`);
      }
    }
    refreshInspectionHud();
  };

  const focusHotspotTarget = (index: number): void => {
    const len = activeSite.hotspots.length;
    activeHotspotIndex = ((index % len) + len) % len;
    const marker = activeSite.monument.hotspotMarkers[activeHotspotIndex];
    if (marker) {
      marker.anchor.getWorldPosition(tempWorld);
      const localX = tempWorld.x - activeSite.x;
      const localY = tempWorld.y - activeSite.y;
      const localZ = tempWorld.z - activeSite.z;
      if (Math.hypot(localX, localZ) > 0.25) {
        inspectTargetYaw = Math.atan2(localX, localZ);
      }
      inspectTargetPitch = clampNumber(0.24 + (localY - 0.8) * 0.22, 0.16, 0.85);
    }
    refreshInspectionHud();
  };

  const enterInspectMode = (targetSite: SurfaceMonumentSite): void => {
    if (subMode === 'inspect') return;
    bindActiveSite(targetSite, false);
    // Park mini-rover crisply facing the monument along approach direction for 3D scan beam
    const dx = roverX - targetSite.x;
    const dz = roverZ - targetSite.z;
    const dist = Math.hypot(dx, dz) || 1;
    const parkRadius = targetSite.monument.boundingRadius + 3.4;
    roverX = targetSite.x + (dx / dist) * parkRadius;
    roverZ = targetSite.z + (dz / dist) * parkRadius;
    roverYaw = Math.atan2(-(targetSite.x - roverX), -(targetSite.z - roverZ));
    rover.root.position.set(roverX, terrain.getHeight(roverX, roverZ), roverZ);
    rover.root.rotation.set(0, roverYaw, 0);

    subMode = 'inspect';
    autoApproach = false;
    roverSpeed = 0;
    hud.setApproachEngaged(false);
    hud.setPhase('inspect');
    hud.setDistanceReadout(
      `INSPECTING ${targetSite.artifact.name.toUpperCase()} · [1-5] SUBSYSTEMS · [F] HARDWARE TEST · [E] SCAN`,
    );
    focusHotspotTarget(0);
    hud.announce(
      `Inspection orbit active around ${targetSite.artifact.name} at ${targetSite.zoneLabel}. Five subsystem nodes ready for scan and hardware tests.`,
    );
  };

  const scanHotspotIndex = (index: number): void => {
    focusHotspotTarget(index);
    const hp = activeSite.hotspots[activeHotspotIndex];
    if (!hp) return;

    const firstTime = !activeSite.scannedSet.has(hp.id);
    activeSite.scannedSet.add(hp.id);
    playSonarTone('scan');
    hud.showPlaque(hp);
    hud.announce(`${hp.title}: ${hp.explorerBody}`);

    if (activeSite.scannedSet.size >= activeSite.hotspots.length && !activeSite.inspectedSynced) {
      activeSite.inspectedSynced = true;
      markArtifactInspected(activeSite.artifact.id);
      hud.announce(
        `${activeSite.artifact.name} exterior inspection complete. Archive link unlocked: hold or press HOLD to recover.`,
      );
    } else if (firstTime) {
      refreshInspectionHud();
    } else {
      syncAllSiteVisuals();
    }
  };

  const exitInspectToPerimeter = (): void => {
    const dx = roverX - activeSite.x;
    const dz = roverZ - activeSite.z;
    const dist = Math.hypot(dx, dz) || 1;
    const safeRadius = activeSite.monument.boundingRadius + 7.2;
    roverX = activeSite.x + (dx / dist) * safeRadius;
    roverZ = activeSite.z + (dz / dist) * safeRadius;
    roverSpeed = 0;
    rover.root.position.set(roverX, terrain.getHeight(roverX, roverZ), roverZ);
    scanBeam.visible = false;
    beamTip.visible = false;
    testWaveTimer = 0;
    testWaveRing.visible = false;
    testFlareBeam.visible = false;
    subMode = 'drive';
    hud.showPlaque(null);
    hud.setPhase('drive');
    refreshInspectionHud();
  };

  // Start HUD locked onto closest monument initially
  activeSite = findNearestSite(false);
  hud.setActiveArtifact(
    activeSite.artifact,
    activeSite.hotspots,
    getArtifactDiscoveryState(activeSite.artifact.id, readDiscoveryState()),
  );
  hud.setPhase('drive');
  refreshInspectionHud();

  const updateDriveCamera = (dt: number, camera: PerspectiveCamera, input: ExpeditionInput): void => {
    const orbit = input.consumeOrbitDelta();
    driveYaw += orbit.yaw;
    drivePitch = clampNumber(drivePitch + orbit.pitch, 0.12, 0.72);
    input.consumeWheelZoom();

    if (Math.abs(orbit.yaw) < 0.0001 && Math.abs(roverSpeed) > 0.25) {
      driveYaw += shortestAngleDelta(driveYaw, roverYaw) * Math.min(1, dt * 1.6);
    }

    const camRadius = 3.55;
    const desiredX = roverX + Math.sin(driveYaw) * camRadius * Math.cos(drivePitch);
    const desiredZ = roverZ + Math.cos(driveYaw) * camRadius * Math.cos(drivePitch);
    const groundUnderCam = terrain.getHeight(desiredX, desiredZ);
    const desiredY =
      Math.max(rover.root.position.y + 0.85, groundUnderCam + 0.55) + Math.sin(drivePitch) * 2.2;

    camPosSmooth.lerp(tempWorld.set(desiredX, desiredY, desiredZ), Math.min(1, dt * 7.2));
    camera.position.copy(camPosSmooth);
    camLookAt.set(roverX, rover.root.position.y + 0.38, roverZ);
    camera.lookAt(camLookAt);
  };

  const updateInspectCamera = (dt: number, camera: PerspectiveCamera, input: ExpeditionInput): void => {
    const orbit = input.consumeOrbitDelta();
    const zoom = input.consumeWheelZoom();

    if (Math.abs(orbit.yaw) > 0.0001 || Math.abs(input.inspectRotate) > 0.01) {
      inspectTargetYaw = null;
      inspectTargetPitch = null;
    }

    inspectYaw += orbit.yaw - input.inspectRotate * dt * 1.55;
    inspectPitch = clampNumber(inspectPitch + orbit.pitch, 0.12, 1.24);
    inspectDistance = clampNumber(
      inspectDistance + zoom * 0.45 + input.inspectZoom * dt * 3.8,
      activeSite.monument.boundingRadius + 1.5,
      14.5,
    );

    if (inspectTargetYaw !== null) {
      const step = shortestAngleDelta(inspectYaw, inspectTargetYaw);
      inspectYaw += step * Math.min(1, dt * 4.8);
      if (Math.abs(step) < 0.02) inspectTargetYaw = null;
    }
    if (inspectTargetPitch !== null) {
      const pStep = inspectTargetPitch - inspectPitch;
      inspectPitch += pStep * Math.min(1, dt * 4.8);
      if (Math.abs(pStep) < 0.015) inspectTargetPitch = null;
    }

    const centerY = activeSite.y + 1.15;
    const offsetHoriz = Math.cos(inspectPitch) * inspectDistance;
    const rawX = Math.sin(inspectYaw) * offsetHoriz;
    const rawZ = Math.cos(inspectYaw) * offsetHoriz;
    const rawY = centerY + Math.sin(inspectPitch) * inspectDistance;

    const minGroundY = terrain.getHeight(activeSite.x + rawX, activeSite.z + rawZ) + 0.65;
    const safeY = Math.max(rawY, minGroundY);
    tempWorld.set(rawX, safeY - centerY, rawZ);
    const radialDist = tempWorld.length();
    const minSphere = activeSite.monument.boundingRadius + 1.4;
    if (radialDist < minSphere && radialDist > 0.001) {
      tempWorld.multiplyScalar(minSphere / radialDist);
    }

    camera.position.set(activeSite.x + tempWorld.x, centerY + tempWorld.y, activeSite.z + tempWorld.z);
    // Look slightly lower so the monument rests cleanly in the upper viewport above #hud-plaque-card
    camera.lookAt(activeSite.x, centerY - 0.55, activeSite.z);
  };

  const updateHotspotProjections = (camera: PerspectiveCamera): void => {
    const canvas = hud ? document.getElementById('expedition-canvas') : null;
    const width = canvas?.clientWidth || window.innerWidth;
    const height = canvas?.clientHeight || window.innerHeight;

    const projectedList: ProjectedHotspot[] = activeSite.hotspots.map((hp, index) => {
      const marker = activeSite.monument.hotspotMarkers[index];
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
        scanned: activeSite.scannedSet.has(hp.id),
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
      sonarTimer = 2.4;
      sonarRing.visible = true;
      sonarRing.position.set(roverX, rover.root.position.y + 0.1, roverZ);
      sonarRing.scale.setScalar(1);
      sonarRingMat.opacity = 0.88;

      const summaryParts = sites.map((s) => {
        const distMeters = Math.max(0, Math.round(Math.hypot(s.x - roverX, s.z - roverZ) - 4));
        const az = computeAzimuthDeg(roverX, roverZ, s.x, s.z);
        return `${s.artifact.name.toUpperCase()} (${s.zoneLabel}) ${distMeters}M ${azToCompass8(az)}`;
      });

      lastPingSummary = `SONAR // ${summaryParts.join(' · ')}`;
      hud.setDistanceReadout(lastPingSummary);
      hud.announce(lastPingSummary);
      playSonarTone('ping');
    },

    toggleAutoApproach() {
      if (subMode !== 'drive') return;
      autoApproach = !autoApproach;
      hud.setApproachEngaged(autoApproach);
      const target = findNearestSite(true);
      hud.announce(
        autoApproach
          ? `Auto-Approach engaged toward ${target.artifact.name} (${target.zoneLabel}).`
          : 'Manual driving resumed.',
      );
    },

    interactInInspect() {
      if (subMode === 'drive') {
        const nearest = findNearestSite(false);
        if (Math.hypot(roverX - nearest.x, roverZ - nearest.z) <= nearest.monument.boundingRadius + 7.5) {
          enterInspectMode(nearest);
        }
        return;
      }
      if (subMode === 'inspect' && activeSite.scannedSet.size < activeSite.hotspots.length) {
        scanHotspotIndex(activeHotspotIndex);
      }
    },

    selectHotspot(index: number, openPlaque = true) {
      if (subMode === 'inspect') {
        if (openPlaque) {
          scanHotspotIndex(index);
        } else {
          focusHotspotTarget(index);
        }
      }
    },

    stepHotspot(delta: number) {
      if (subMode === 'inspect') {
        focusHotspotTarget(activeHotspotIndex + delta);
      }
    },

    setSimMode(nominal: boolean) {
      simNominalState = nominal;
      const beamHex = nominal ? tokens.turquoise : tokens.amber;
      scanBeamMat.color.copy(beamHex);
      beamTipMat.color.copy(beamHex);
    },

    triggerDiagnosticTest() {
      if (subMode !== 'inspect') return;
      const hp = activeSite.hotspots[activeHotspotIndex];
      const marker = activeSite.monument.hotspotMarkers[activeHotspotIndex];
      if (!hp || !marker) return;

      if (!activeSite.scannedSet.has(hp.id)) {
        scanHotspotIndex(activeHotspotIndex);
      }

      activeSite.testedSet.add(hp.id);
      hud.setDiagnosticTested(activeSite.testedSet);
      hud.showPlaque(hp);
      playSubsystemPulseTone(activeHotspotIndex, simNominalState);
      hud.announce(hp.telemetry.testResult);

      marker.anchor.getWorldPosition(tempWorld);
      testWaveTimer = 1.6;
      testWaveRing.visible = true;
      testWaveRing.position.copy(tempWorld);
      testWaveRing.lookAt(roverX, rover.root.position.y + 0.5, roverZ);
      testWaveRing.scale.setScalar(1);
      testWaveMat.opacity = 0.95;

      testFlareBeam.visible = true;
      testFlareBeam.position.set(tempWorld.x, tempWorld.y + 7, tempWorld.z);
      testFlareMat.opacity = 0.85;
    },

    returnToDriveMode() {
      if (subMode !== 'inspect') return;
      exitInspectToPerimeter();
    },

    continueExploring() {
      if (subMode === 'drive') return;
      exitInspectToPerimeter();
    },

    markRecovered() {
      subMode = 'complete';
      scanBeam.visible = false;
      beamTip.visible = false;
      markArtifactRecovered(activeSite.artifact.id);
      playSonarTone('recover');
      syncAllSiteVisuals();
      hud.showCompleteCard();
    },

    applyDiscoverySync() {
      syncAllSiteVisuals();
    },

    update(dt: number, nowMs: number, camera: PerspectiveCamera, input: ExpeditionInput) {
      if (sonarTimer > 0) {
        sonarTimer = Math.max(0, sonarTimer - dt);
        const progress = 1 - sonarTimer / 2.4;
        if (!reducedMotion) {
          sonarRing.scale.setScalar(1 + progress * 140);
        } else {
          sonarRing.scale.setScalar(18);
        }
        sonarRingMat.opacity = (1 - progress) * 0.8;
        const pulseOp = 0.25 + (1 - progress) * 0.65;
        for (const s of sites) {
          s.beaconMat.opacity = pulseOp;
        }
        if (sonarTimer === 0) {
          sonarRing.visible = false;
          syncAllSiteVisuals();
        }
      }

      if (testWaveTimer > 0) {
        testWaveTimer = Math.max(0, testWaveTimer - dt);
        const waveProgress = 1 - testWaveTimer / 1.6;
        testWaveRing.scale.setScalar(reducedMotion ? 4 : 1 + waveProgress * 13);
        testWaveMat.opacity = (1 - waveProgress) * 0.9;
        testFlareMat.opacity = (1 - waveProgress) * 0.85;
        if (testWaveTimer === 0) {
          testWaveRing.visible = false;
          testFlareBeam.visible = false;
        }
      }

      if (subMode === 'drive') {
        scanBeam.visible = false;
        beamTip.visible = false;
        const manualThrottle = input.throttle;
        const manualSteer = input.steer;

        if (autoApproach && (Math.abs(manualThrottle) > 0.2 || Math.abs(manualSteer) > 0.2)) {
          autoApproach = false;
          hud.setApproachEngaged(false);
        }

        let targetSpeed = 0;
        let targetSteer = 0;
        const navGoal = findNearestSite(true);

        if (autoApproach) {
          const approachZ = navGoal.z + (navGoal.z > 0 ? -navGoal.monument.boundingRadius - 3.6 : navGoal.monument.boundingRadius + 3.6);
          const tx = navGoal.x - roverX;
          const tz = approachZ - roverZ;
          const desiredYaw = Math.atan2(-tx, -tz);
          const yawErr = shortestAngleDelta(roverYaw, desiredYaw);
          targetSteer = clampNumber(-yawErr * 1.9, -1, 1);
          targetSpeed = Math.abs(yawErr) < 0.7 ? ROVER_AUTOPILOT_SPEED : ROVER_AUTOPILOT_SPEED * 0.55;
        } else {
          targetSpeed = manualThrottle * ROVER_MANUAL_TOP_SPEED;
          targetSteer = manualSteer;
        }

        roverSpeed += (targetSpeed - roverSpeed) * Math.min(1, dt * 7.2);
        roverSteerAngle += (targetSteer * 0.42 - roverSteerAngle) * Math.min(1, dt * 9.0);

        if (Math.abs(roverSpeed) > 0.04) {
          const reverseSign = roverSpeed < 0 ? -1 : 1;
          roverYaw -= targetSteer * reverseSign * 2.05 * dt;
        } else if (Math.abs(targetSteer) > 0.1 && !autoApproach) {
          roverYaw -= targetSteer * 1.45 * dt;
        }

        let nextX = roverX - Math.sin(roverYaw) * roverSpeed * dt;
        let nextZ = roverZ - Math.cos(roverYaw) * roverSpeed * dt;

        // Soft boulder repulsion
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

        // Keep clear of enlarged landed spacecraft hull
        const shipDx = nextX - landerPadX;
        const shipDz = nextZ - landerPadZ;
        const shipDistFromCenter = Math.hypot(shipDx, shipDz);
        const minShipPad = 4.9;
        if (shipDistFromCenter < minShipPad && shipDistFromCenter > 0.001) {
          nextX = landerPadX + (shipDx / shipDistFromCenter) * minShipPad;
          nextZ = landerPadZ + (shipDz / shipDistFromCenter) * minShipPad;
        }

        // Prevent driving directly through any monument chassis
        for (const s of sites) {
          const mdx = nextX - s.x;
          const mdz = nextZ - s.z;
          const md = Math.hypot(mdx, mdz);
          const minMonumentPad = s.monument.boundingRadius + 1.0;
          if (md < minMonumentPad && md > 0.001) {
            nextX = s.x + (mdx / md) * minMonumentPad;
            nextZ = s.z + (mdz / md) * minMonumentPad;
          }
        }

        // Clamp within expanded planetary basin
        const maxBound = 128;
        roverX = clampNumber(nextX, -maxBound, maxBound);
        roverZ = clampNumber(nextZ, -maxBound, maxBound);

        const baseY = terrain.getHeight(roverX, roverZ);
        rover.root.position.set(roverX, baseY, roverZ);

        // Ground normal pitch & roll scaled to compact miniature wheelbase
        const footF = 1.1 * ROVER_SCALE + 0.12;
        const footS = 0.85 * ROVER_SCALE + 0.1;
        const fX = -Math.sin(roverYaw);
        const fZ = -Math.cos(roverYaw);
        const rX = Math.cos(roverYaw);
        const rZ = -Math.sin(roverYaw);
        const hFront = terrain.getHeight(roverX + fX * footF, roverZ + fZ * footF);
        const hBack = terrain.getHeight(roverX - fX * footF, roverZ - fZ * footF);
        const hRight = terrain.getHeight(roverX + rX * footS, roverZ + rZ * footS);
        const hLeft = terrain.getHeight(roverX - rX * footS, roverZ - rZ * footS);

        rover.root.rotation.y = roverYaw;
        rover.root.rotation.x = Math.atan2(hFront - hBack, footF * 2) * 0.72;
        rover.root.rotation.z = -Math.atan2(hRight - hLeft, footS * 2) * 0.72;

        // Spin miniature wheels accurately & stamp tiny tracks
        const wheelSpin = (-roverSpeed * dt) / ROVER_WHEEL_RADIUS;
        for (const w of rover.leftWheels) w.rotation.x += wheelSpin;
        for (const w of rover.rightWheels) w.rotation.x += wheelSpin;
        for (const pivot of rover.frontSteerPivots) {
          pivot.rotation.y = -roverSteerAngle;
        }

        terrain.stampWheelTracks(roverX, roverZ, roverYaw, terrain.getHeight);
        terrain.updateDust(dt, roverX, baseY, roverZ, roverSpeed);

        const nearestOverall = findNearestSite(false);
        if (nearestOverall !== activeSite) {
          bindActiveSite(nearestOverall, true);
        }

        const focusSite = autoApproach ? navGoal : nearestOverall;
        const focusDist = Math.max(0, Math.round(Math.hypot(focusSite.x - roverX, focusSite.z - roverZ) - 4));
        const focusAz = computeAzimuthDeg(roverX, roverZ, focusSite.x, focusSite.z);
        const shipDist = Math.max(0, Math.round(Math.hypot(roverX - landerPadX, roverZ - landerPadZ) - 5));
        const recoveredCount = sites.filter(
          (s) => getArtifactDiscoveryState(s.artifact.id, readDiscoveryState()) === 'recovered',
        ).length;

        if (!reducedMotion) {
          padRing.scale.setScalar(1 + Math.sin(nowMs * 0.004) * 0.03);
        }

        if (sonarTimer <= 0) {
          if (shipDist <= 10 && !autoApproach) {
            hud.setDistanceReadout(
              `LANDED SHIP (${shipDist}M) · [L] LAUNCH TO ORBIT · NEAREST ${focusSite.artifact.name.toUpperCase()} ${focusDist}M ${azToCompass8(focusAz)} (${recoveredCount}/${sites.length})`,
            );
          } else {
            hud.setDistanceReadout(
              autoApproach
                ? `AUTO-APPROACH -> ${focusSite.artifact.name.toUpperCase()} (${focusSite.zoneLabel.toUpperCase()}) ${focusDist}M ${azToCompass8(focusAz)} · [L] ORBIT`
                : `NEAREST: ${focusSite.artifact.name.toUpperCase()} · ${focusSite.zoneLabel.toUpperCase()} ${focusDist}M ${azToCompass8(focusAz)} · SITES ${recoveredCount}/${sites.length} · [L] ORBIT`,
            );
          }
        }

        updateDriveCamera(dt, camera, input);

        // Enter inspection automatically inside ANY monument's inspection apron
        for (const s of sites) {
          if (Math.hypot(roverX - s.x, roverZ - s.z) <= s.monument.boundingRadius + 4.8) {
            enterInspectMode(s);
            break;
          }
        }
      } else if (subMode === 'inspect') {
        terrain.updateDust(dt, activeSite.x, activeSite.y, activeSite.z, 0);
        const activeMarker = activeSite.monument.hotspotMarkers[activeHotspotIndex];
        if (activeMarker) {
          activeMarker.anchor.getWorldPosition(tempWorld);
          tempBeamStart.set(roverX, rover.root.position.y + 0.48, roverZ);
          const beamDist = tempBeamStart.distanceTo(tempWorld);
          scanBeam.visible = true;
          beamTip.visible = true;
          tempBeamMid.copy(tempBeamStart).lerp(tempWorld, 0.5);
          scanBeam.position.copy(tempBeamMid);
          scanBeam.lookAt(tempWorld);
          scanBeam.scale.set(1, 1, beamDist);
          scanBeamMat.opacity =
            testWaveTimer > 0 ? 0.92 : 0.55 + Math.sin(nowMs * 0.008) * 0.14;
          beamTip.position.copy(tempWorld);
          beamTip.scale.setScalar(
            testWaveTimer > 0 ? 1.55 : 1.0 + Math.sin(nowMs * 0.01) * 0.18,
          );
        } else {
          scanBeam.visible = false;
          beamTip.visible = false;
        }
        updateInspectCamera(dt, camera, input);
        updateHotspotProjections(camera);
        hud.tickHold(nowMs);
      } else {
        scanBeam.visible = false;
        beamTip.visible = false;
        inspectYaw += reducedMotion ? 0 : dt * 0.22;
        updateInspectCamera(dt, camera, input);
      }
    },

    dispose() {
      disposed = true;
      glbHandle.dispose();
      disposeObjectTree(scene);
    },
  };
}
