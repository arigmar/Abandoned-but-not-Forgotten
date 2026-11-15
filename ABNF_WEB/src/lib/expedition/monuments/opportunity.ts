import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import type { TokenPalette } from '../palette';
import { attachMonumentHotspotNodes, createMonumentMaterials } from './shared';
import type { MonumentBuild } from './types';

export function buildOpportunityMonument(tokens: TokenPalette): MonumentBuild {
  const mats = createMonumentMaterials(tokens);
  const root = new Group();
  root.name = 'monument-opportunity';

  // Warm Electronics Box (trapezoid profile chassis)
  const webBody = new Mesh(new BoxGeometry(1.15, 0.62, 1.38), mats.goldFoil);
  webBody.position.y = 0.78;
  root.add(webBody);

  // Delta-wing dusty solar deck
  const centerDeck = new Mesh(new BoxGeometry(1.65, 0.08, 1.5), mats.solarCell);
  centerDeck.position.y = 1.12;
  root.add(centerDeck);

  const leftWing = new Mesh(new BoxGeometry(1.1, 0.07, 1.25), mats.solarCell);
  leftWing.position.set(-1.32, 1.07, 0.05);
  leftWing.rotation.z = 0.1;
  root.add(leftWing);

  const rightWing = new Mesh(new BoxGeometry(1.1, 0.07, 1.25), mats.solarCell);
  rightWing.position.set(1.32, 1.07, 0.05);
  rightWing.rotation.z = -0.1;
  root.add(rightWing);

  // State accent edge bar along upper deck
  const deckAccent = new Mesh(new BoxGeometry(1.5, 0.06, 0.14), mats.stateAccent);
  deckAccent.position.set(0, 1.18, 0.68);
  root.add(deckAccent);

  // Tall Pancam mast on forward-left deck
  const mast = new Mesh(new CylinderGeometry(0.06, 0.08, 1.15, 8), mats.metalLight);
  mast.position.set(-0.4, 1.72, 0.62);
  root.add(mast);

  const pancamHead = new Mesh(new BoxGeometry(0.46, 0.2, 0.24), mats.metalLight);
  pancamHead.position.set(-0.4, 2.34, 0.62);
  root.add(pancamHead);

  const camAccent = new Mesh(new CylinderGeometry(0.06, 0.06, 0.08, 8), mats.stateAccent);
  camAccent.rotation.x = Math.PI / 2;
  camAccent.position.set(-0.4, 2.34, 0.76);
  root.add(camAccent);

  // Rear High-Gain Antenna gimbal & dish
  const hgaMast = new Mesh(new CylinderGeometry(0.05, 0.05, 0.46, 8), mats.metalMid);
  hgaMast.position.set(0.56, 1.38, -0.62);
  root.add(hgaMast);

  const hgaDish = new Mesh(new CylinderGeometry(0.48, 0.18, 0.16, 12), mats.metalLight);
  hgaDish.rotation.x = -0.78;
  hgaDish.position.set(0.56, 1.66, -0.72);
  root.add(hgaDish);

  // Front IDD instrument arm projecting right-forward
  const armUpper = new Mesh(new BoxGeometry(0.12, 0.12, 0.85), mats.metalMid);
  armUpper.position.set(0.55, 0.92, 1.05);
  armUpper.rotation.x = 0.28;
  root.add(armUpper);

  const armTurret = new Mesh(new CylinderGeometry(0.18, 0.18, 0.2, 8), mats.copper);
  armTurret.rotation.x = Math.PI / 2;
  armTurret.position.set(0.58, 0.78, 1.52);
  root.add(armTurret);

  // 6 rocker-bogie wheels
  const wheelGeom = new CylinderGeometry(0.27, 0.27, 0.22, 10);
  wheelGeom.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const beam = new Mesh(new BoxGeometry(0.08, 0.09, 1.75), mats.metalMid);
    beam.position.set(side * 0.85, 0.48, 0);
    root.add(beam);

    for (const zOff of [-0.78, 0.0, 0.78]) {
      const wheel = new Mesh(wheelGeom, mats.metalDark);
      wheel.position.set(side * 0.94, 0.27, zOff);
      root.add(wheel);
    }
  }

  return attachMonumentHotspotNodes(
    root,
    [
      [1.82, 1.12, 0.05], // Solar arrays (endCause)
      [-0.4, 2.6, 0.62], // Pancam mast (sizeFact + UTC)
      [-1.18, 0.78, -0.15], // Rocker-bogie & hull (role)
      [0.58, 1.02, 1.66], // IDD turret arm (legacy[0])
      [0.56, 1.9, -0.82], // High-gain antenna (legacy[1..2])
    ],
    tokens,
    mats,
    3.6,
  );
}
