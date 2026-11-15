import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry } from 'three';
import type { TokenPalette } from '../palette';
import { attachMonumentHotspotNodes, createMonumentMaterials } from './shared';
import type { MonumentBuild } from './types';

export function buildSurveyor3Monument(tokens: TokenPalette): MonumentBuild {
  const mats = createMonumentMaterials(tokens);
  const root = new Group();
  root.name = 'monument-surveyor-3';

  // Open tubular tripod frame core & lower thermal deck
  const frameBase = new Mesh(new CylinderGeometry(0.9, 1.05, 0.24, 6), mats.metalLight);
  frameBase.position.y = 0.85;
  root.add(frameBase);

  // Spherical retro-rocket / propellant tank & aft thermal compartment box
  const tank = new Mesh(new SphereGeometry(0.42, 12, 10), mats.metalLight);
  tank.position.set(0.32, 1.18, -0.25);
  root.add(tank);

  const thermalBox = new Mesh(new BoxGeometry(0.62, 0.56, 0.48), mats.metalMid);
  thermalBox.position.set(-0.36, 1.16, -0.22);
  root.add(thermalBox);

  // Tall central tripod mast rising to Planar HGA & Solar Panel
  const mast = new Mesh(new CylinderGeometry(0.06, 0.09, 1.92, 8), mats.metalLight);
  mast.position.set(0, 1.9, 0);
  root.add(mast);

  const mastBand = new Mesh(new CylinderGeometry(0.11, 0.11, 0.14, 8), mats.stateAccent);
  mastBand.position.set(0, 2.52, 0);
  root.add(mastBand);

  const planarHga = new Mesh(new BoxGeometry(1.12, 0.08, 1.12), mats.metalLight);
  planarHga.position.set(-0.12, 2.86, 0.08);
  planarHga.rotation.x = 0.38;
  root.add(planarHga);

  const mastSolar = new Mesh(new BoxGeometry(1.05, 0.05, 0.78), mats.solarCell);
  mastSolar.position.set(0.36, 2.68, -0.28);
  mastSolar.rotation.z = -0.35;
  root.add(mastSolar);

  // Vertical Television Camera Turret & rotating mirror hood (later retrieved by Apollo 12)
  const tvBody = new Mesh(new CylinderGeometry(0.16, 0.18, 0.95, 10), mats.metalLight);
  tvBody.position.set(-0.48, 1.48, 0.48);
  root.add(tvBody);

  const tvHood = new Mesh(new BoxGeometry(0.32, 0.34, 0.34), mats.stateAccent);
  tvHood.position.set(-0.48, 2.04, 0.48);
  root.add(tvHood);

  // 3 wide Surveyor landing legs & crushable footpads
  const legAngles = [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6];
  for (const ang of legAngles) {
    const lx = Math.cos(ang);
    const lz = Math.sin(ang);

    const leg = new Mesh(new CylinderGeometry(0.06, 0.07, 1.45, 8), mats.metalMid);
    leg.position.set(lx * 1.18, 0.56, lz * 1.18);
    leg.rotation.z = lx * 0.65;
    leg.rotation.x = -lz * 0.65;
    root.add(leg);

    const footpad = new Mesh(new CylinderGeometry(0.32, 0.38, 0.14, 10), mats.metalDark);
    footpad.position.set(lx * 1.65, 0.07, lz * 1.65);
    root.add(footpad);
  }

  // Pantograph Soil Mechanics Surface Sampler extending right + regolith trench mark
  const armReach = new Mesh(new BoxGeometry(1.42, 0.12, 0.18), mats.metalMid);
  armReach.position.set(1.22, 0.72, 0.52);
  armReach.rotation.z = -0.36;
  root.add(armReach);

  const scoop = new Mesh(new BoxGeometry(0.28, 0.16, 0.22), mats.copper);
  scoop.position.set(1.88, 0.32, 0.52);
  root.add(scoop);

  const trench = new Mesh(new BoxGeometry(0.68, 0.04, 0.28), mats.metalDark);
  trench.position.set(2.05, 0.02, 0.52);
  root.add(trench);

  return attachMonumentHotspotNodes(
    root,
    [
      [-0.48, 2.34, 0.48], // TV Camera Turret (endCause)
      [1.88, 0.58, 0.52], // Soil Sampler Scoop (sizeFact + UTC)
      [0, 3.12, 0], // Mast & Spaceframe (role)
      [-0.48, 1.45, -0.36], // Thermal / camera shell (legacy[0])
      [-1.55, 0.32, 1.05], // Crushable footpad & Apollo 12 site (legacy[1..2])
    ],
    tokens,
    mats,
    3.9,
  );
}
