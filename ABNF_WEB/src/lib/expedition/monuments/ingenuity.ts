import { BoxGeometry, CylinderGeometry, Group, Mesh } from 'three';
import type { TokenPalette } from '../palette';
import { attachMonumentHotspotNodes, createMonumentMaterials } from './shared';
import type { MonumentBuild } from './types';

export function buildIngenuityMonument(tokens: TokenPalette): MonumentBuild {
  const mats = createMonumentMaterials(tokens);
  const root = new Group();
  root.name = 'monument-ingenuity';

  // Subtle post-Flight 72 sandy cant while remaining upright and inspectable
  const assembly = new Group();
  assembly.rotation.z = 0.06;
  root.add(assembly);

  // Compact foil-insulated avionics fuselage cube
  const fuselage = new Mesh(new BoxGeometry(0.62, 0.56, 0.58), mats.goldFoil);
  fuselage.position.y = 0.92;
  assembly.add(fuselage);

  const fuselageBand = new Mesh(new BoxGeometry(0.66, 0.1, 0.62), mats.stateAccent);
  fuselageBand.position.y = 0.92;
  assembly.add(fuselageBand);

  // Central rotor mast rising from fuselage
  const shaft = new Mesh(new CylinderGeometry(0.05, 0.06, 0.92, 8), mats.metalLight);
  shaft.position.y = 1.64;
  assembly.add(shaft);

  // Coaxial counter-rotating wide rotor pairs (Flight 72 tip nick visible on upper blade)
  const lowerBlade = new Mesh(new BoxGeometry(3.2, 0.04, 0.24), mats.metalDark);
  lowerBlade.position.y = 1.54;
  lowerBlade.rotation.y = 0.55;
  assembly.add(lowerBlade);

  const upperBladeMain = new Mesh(new BoxGeometry(2.85, 0.04, 0.24), mats.metalDark);
  upperBladeMain.position.set(-0.14, 1.78, 0);
  upperBladeMain.rotation.y = -0.55;
  assembly.add(upperBladeMain);

  // Crown square top solar panel
  const solarCap = new Mesh(new BoxGeometry(0.84, 0.05, 0.84), mats.solarCell);
  solarCap.position.y = 2.08;
  assembly.add(solarCap);

  const solarAccent = new Mesh(new BoxGeometry(0.88, 0.04, 0.08), mats.stateAccent);
  solarAccent.position.set(0, 2.08, 0.44);
  assembly.add(solarAccent);

  // 4 thin angled carbon landing gear struts reaching regolith
  const legCorners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ];
  for (const [sx, sz] of legCorners) {
    const leg = new Mesh(new CylinderGeometry(0.03, 0.03, 1.05, 6), mats.metalMid);
    leg.position.set(sx * 0.54, 0.46, sz * 0.54);
    leg.rotation.z = sx * 0.52;
    leg.rotation.x = -sz * 0.52;
    assembly.add(leg);

    const foot = new Mesh(new BoxGeometry(0.14, 0.05, 0.14), mats.metalDark);
    foot.position.set(sx * 0.8, 0.03, sz * 0.8);
    assembly.add(foot);
  }

  return attachMonumentHotspotNodes(
    root,
    [
      [1.25, 1.88, 0.65], // Coaxial rotors & Flight 72 tip (endCause + note)
      [0, 2.28, 0], // Top square solar array (sizeFact + UTC)
      [0, 0.94, 0.48], // Avionics fuselage (role)
      [-0.82, 0.34, 0.82], // Carbon landing struts (legacy[0])
      [-1.35, 1.56, -0.78], // Opposite coaxial rotor sweep (legacy[1..2])
    ],
    tokens,
    mats,
    3.2,
  );
}
