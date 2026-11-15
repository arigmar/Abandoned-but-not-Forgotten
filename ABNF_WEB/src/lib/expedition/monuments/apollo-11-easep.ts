import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import type { TokenPalette } from '../palette';
import { attachMonumentHotspotNodes, createMonumentMaterials } from './shared';
import type { MonumentBuild } from './types';

export function buildApollo11EasepMonument(tokens: TokenPalette): MonumentBuild {
  const mats = createMonumentMaterials(tokens);
  const root = new Group();
  root.name = 'monument-apollo-11-easep';

  // Unit 1 (Left): Passive Seismic Experiment Package (PSEP) + twin solar wings
  const psepBase = new Mesh(new CylinderGeometry(0.55, 0.62, 0.14, 12), mats.goldFoil);
  psepBase.position.set(-1.35, 0.07, 0);
  root.add(psepBase);

  const psepCore = new Mesh(new CylinderGeometry(0.42, 0.42, 0.72, 12), mats.metalLight);
  psepCore.position.set(-1.35, 0.5, 0);
  root.add(psepCore);

  const psepRing = new Mesh(new CylinderGeometry(0.45, 0.45, 0.1, 12), mats.stateAccent);
  psepRing.position.set(-1.35, 0.72, 0);
  root.add(psepRing);

  const psepWhip = new Mesh(new CylinderGeometry(0.02, 0.03, 1.32, 8), mats.metalLight);
  psepWhip.position.set(-1.35, 1.52, 0);
  root.add(psepWhip);

  const solarFrameLeft = new Mesh(new BoxGeometry(0.95, 0.78, 0.06), mats.solarCell);
  solarFrameLeft.position.set(-2.18, 0.58, 0);
  solarFrameLeft.rotation.y = 0.2;
  root.add(solarFrameLeft);

  const solarFrameRight = new Mesh(new BoxGeometry(0.95, 0.78, 0.06), mats.solarCell);
  solarFrameRight.position.set(-0.52, 0.58, 0);
  solarFrameRight.rotation.y = -0.2;
  root.add(solarFrameRight);

  // Unit 2 (Right): Laser Ranging Retroreflector (LRRR) tilted pedestal & 100-prism array
  const lrrrFoot = new Mesh(new CylinderGeometry(0.52, 0.68, 0.28, 8), mats.metalMid);
  lrrrFoot.position.set(1.48, 0.14, 0.1);
  root.add(lrrrFoot);

  const lrrrPedestal = new Mesh(new BoxGeometry(0.58, 0.48, 0.58), mats.metalLight);
  lrrrPedestal.position.set(1.48, 0.52, 0.1);
  root.add(lrrrPedestal);

  const lrrrFrame = new Mesh(new BoxGeometry(0.98, 0.14, 0.98), mats.metalLight);
  lrrrFrame.position.set(1.48, 0.88, 0.1);
  lrrrFrame.rotation.x = 0.34;
  lrrrFrame.rotation.z = 0.16;
  root.add(lrrrFrame);

  // Stylized corner-cube optical array face (clamped muted metallic mirror finish)
  const prismFace = new Mesh(new BoxGeometry(0.84, 0.06, 0.84), mats.stateAccent);
  prismFace.position.set(1.48, 0.94, 0.13);
  prismFace.rotation.x = 0.34;
  prismFace.rotation.z = 0.16;
  root.add(prismFace);

  return attachMonumentHotspotNodes(
    root,
    [
      [-1.35, 2.26, 0], // PSEP telemetry whip (endCause)
      [0.05, 0.85, 0.25], // Dual package scale & separation (sizeFact + UTC)
      [-2.18, 1.08, 0.1], // PSEP solar wings & core (role)
      [1.48, 1.24, 0.22], // LRRR 100-prism array (legacy[0])
      [-0.52, 1.08, 0.15], // Dust detector / seismic record (legacy[1..2])
    ],
    tokens,
    mats,
    3.8,
  );
}
