import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import type { TokenPalette } from '../palette';
import { attachMonumentHotspotNodes, createMonumentMaterials } from './shared';
import type { MonumentBuild } from './types';

export function buildApollo15AlsepMonument(tokens: TokenPalette): MonumentBuild {
  const mats = createMonumentMaterials(tokens);
  const root = new Group();
  root.name = 'monument-apollo-15-alsep';

  // Unit 1 (Center): ALSEP Central Station & tall helical S-band mast
  const centralBox = new Mesh(new BoxGeometry(0.95, 0.62, 0.95), mats.metalLight);
  centralBox.position.set(0, 0.42, 0);
  root.add(centralBox);

  const centralLouvers = new Mesh(new BoxGeometry(1.02, 0.12, 1.02), mats.stateAccent);
  centralLouvers.position.set(0, 0.72, 0);
  root.add(centralLouvers);

  const sBandMast = new Mesh(new CylinderGeometry(0.05, 0.08, 1.55, 8), mats.metalLight);
  sBandMast.position.set(0, 1.52, 0);
  root.add(sBandMast);

  const dipoleCrossA = new Mesh(new BoxGeometry(0.75, 0.05, 0.08), mats.metalMid);
  dipoleCrossA.position.set(0, 2.22, 0);
  root.add(dipoleCrossA);

  const dipoleCrossB = new Mesh(new BoxGeometry(0.08, 0.05, 0.75), mats.metalMid);
  dipoleCrossB.position.set(0, 2.22, 0);
  root.add(dipoleCrossB);

  // Unit 2 (Left): Finned dark SNAP-27 Radioisotope Thermoelectric Generator (RTG) cask
  const rtgTripod = new Mesh(new CylinderGeometry(0.32, 0.48, 0.24, 6), mats.metalMid);
  rtgTripod.position.set(-2.3, 0.12, 0);
  root.add(rtgTripod);

  const rtgBody = new Mesh(new CylinderGeometry(0.28, 0.28, 0.88, 10), mats.metalDark);
  rtgBody.position.set(-2.3, 0.62, 0);
  root.add(rtgBody);

  for (let i = 0; i < 4; i++) {
    const fin = new Mesh(new BoxGeometry(0.86, 0.78, 0.05), mats.metalMid);
    fin.position.set(-2.3, 0.62, 0);
    fin.rotation.y = (i * Math.PI) / 4;
    root.add(fin);
  }

  // Unit 3 (Right): Silver-shrouded PSE seismometer dome + Heat Flow borehole probes
  const pseShroud = new Mesh(new CylinderGeometry(0.78, 0.96, 0.18, 14), mats.goldFoil);
  pseShroud.position.set(2.2, 0.09, 0.15);
  root.add(pseShroud);

  const pseDome = new Mesh(new CylinderGeometry(0.36, 0.42, 0.56, 12), mats.metalLight);
  pseDome.position.set(2.2, 0.44, 0.15);
  root.add(pseDome);

  const pseTrim = new Mesh(new CylinderGeometry(0.4, 0.4, 0.08, 12), mats.stateAccent);
  pseTrim.position.set(2.2, 0.68, 0.15);
  root.add(pseTrim);

  // Two protruding Heat Flow Experiment (HFE) borehole stems ahead of PSE
  for (const offsetX of [-0.35, 0.35]) {
    const hfeStem = new Mesh(new CylinderGeometry(0.04, 0.04, 0.52, 8), mats.copper);
    hfeStem.position.set(2.35 + offsetX, 0.26, 1.38);
    root.add(hfeStem);

    const hfeCollar = new Mesh(new CylinderGeometry(0.14, 0.16, 0.06, 8), mats.metalDark);
    hfeCollar.position.set(2.35 + offsetX, 0.03, 1.38);
    root.add(hfeCollar);
  }

  // Surface ribbon cables wiring Central Station to RTG (left) and PSE/HFE (right)
  const cableLeft = new Mesh(new BoxGeometry(1.45, 0.03, 0.12), mats.metalDark);
  cableLeft.position.set(-1.15, 0.02, 0);
  root.add(cableLeft);

  const cableRight = new Mesh(new BoxGeometry(1.5, 0.03, 0.12), mats.metalDark);
  cableRight.position.set(1.15, 0.02, 0.1);
  root.add(cableRight);

  const cableHfe = new Mesh(new BoxGeometry(0.1, 0.03, 0.95), mats.metalDark);
  cableHfe.position.set(2.25, 0.02, 0.85);
  root.add(cableHfe);

  return attachMonumentHotspotNodes(
    root,
    [
      [0, 2.45, 0], // Central station S-band mast (endCause)
      [-1.15, 0.34, 0.35], // Surface ribbon cable & 3-unit span (sizeFact + UTC)
      [-2.3, 1.24, 0], // SNAP-27 RTG power cask (role)
      [2.35, 0.7, 1.38], // Heat flow borehole stems (legacy[0])
      [2.2, 0.96, 0.15], // PSE seismic dome & orbital study (legacy[1..2])
    ],
    tokens,
    mats,
    4.2,
  );
}
