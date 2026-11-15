import { CylinderGeometry, BoxGeometry, Group, Mesh, SphereGeometry } from 'three';
import type { TokenPalette } from '../palette';
import { attachMonumentHotspotNodes, createMonumentMaterials } from './shared';
import type { MonumentBuild } from './types';

export function buildInsightMonument(tokens: TokenPalette): MonumentBuild {
  const mats = createMonumentMaterials(tokens);
  const root = new Group();
  root.name = 'monument-insight';

  // Central octagonal lander deck
  const deck = new Mesh(new CylinderGeometry(1.05, 1.15, 0.34, 8), mats.goldFoil);
  deck.position.y = 1.02;
  root.add(deck);

  // Rear avionics & meteorology housing
  const avionics = new Mesh(new BoxGeometry(0.85, 0.45, 0.72), mats.metalLight);
  avionics.position.set(0, 1.4, -0.32);
  root.add(avionics);

  const deckBeacon = new Mesh(new CylinderGeometry(0.16, 0.16, 0.12, 10), mats.stateAccent);
  deckBeacon.position.set(0, 1.68, -0.32);
  root.add(deckBeacon);

  // Twin giant decagonal circular solar wings (UltraFlex signature look)
  const wingGeom = new CylinderGeometry(1.38, 1.38, 0.05, 10);
  const leftWing = new Mesh(wingGeom, mats.solarCell);
  leftWing.position.set(-2.35, 1.08, 0);
  root.add(leftWing);

  const rightWing = new Mesh(wingGeom, mats.solarCell);
  rightWing.position.set(2.35, 1.08, 0);
  root.add(rightWing);

  const leftStrut = new Mesh(new BoxGeometry(0.75, 0.08, 0.12), mats.metalMid);
  leftStrut.position.set(-1.35, 1.05, 0);
  root.add(leftStrut);

  const rightStrut = new Mesh(new BoxGeometry(0.75, 0.08, 0.12), mats.metalMid);
  rightStrut.position.set(1.35, 1.05, 0);
  root.add(rightStrut);

  // Three angled landing legs with footpads
  const legAngles = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6];
  for (const ang of legAngles) {
    const lx = Math.cos(ang);
    const lz = Math.sin(ang);

    const leg = new Mesh(new CylinderGeometry(0.06, 0.08, 1.05, 6), mats.metalMid);
    leg.position.set(lx * 1.1, 0.5, lz * 1.1);
    leg.rotation.z = lx * 0.36;
    leg.rotation.x = -lz * 0.36;
    root.add(leg);

    const pad = new Mesh(new CylinderGeometry(0.24, 0.28, 0.1, 8), mats.metalDark);
    pad.position.set(lx * 1.28, 0.05, lz * 1.28);
    root.add(pad);
  }

  // IDA Robotic Deployment Arm extending right-forward
  const armBase = new Mesh(new BoxGeometry(0.14, 0.55, 0.14), mats.metalLight);
  armBase.position.set(0.85, 1.35, 0.55);
  armBase.rotation.z = -0.45;
  armBase.rotation.x = 0.4;
  root.add(armBase);

  const armFore = new Mesh(new BoxGeometry(0.12, 0.12, 0.95), mats.metalMid);
  armFore.position.set(1.12, 1.25, 1.08);
  armFore.rotation.x = 0.45;
  root.add(armFore);

  // Deployed SEIS Copper/Thermal Shield Seismometer Dome sitting on regolith in front
  const seisShield = new Mesh(
    new SphereGeometry(0.48, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mats.copper,
  );
  seisShield.position.set(0, 0.04, 2.25);
  root.add(seisShield);

  const seisRim = new Mesh(new CylinderGeometry(0.52, 0.54, 0.08, 14), mats.stateAccent);
  seisRim.position.set(0, 0.04, 2.25);
  root.add(seisRim);

  // Surface tether ribbon between lander deck and SEIS
  const tether = new Mesh(new BoxGeometry(0.1, 0.03, 1.4), mats.metalDark);
  tether.position.set(0, 0.02, 1.48);
  root.add(tether);

  return attachMonumentHotspotNodes(
    root,
    [
      [-2.35, 1.28, 0], // Twin solar wings (endCause)
      [0, 1.85, -0.32], // 3-legged lander deck (sizeFact + UTC)
      [0, 0.72, 2.25], // SEIS seismometer dome (role)
      [1.22, 1.38, 1.25], // IDA & subsurface crust (legacy[0])
      [2.35, 1.28, 0], // Right solar wing dust study (legacy[1..2])
    ],
    tokens,
    mats,
    4.2,
  );
}
